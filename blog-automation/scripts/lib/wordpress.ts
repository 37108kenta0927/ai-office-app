import type { BrandConfig, GeneratedPost, PublishedDraft } from "./types.js";

function authHeader(brand: BrandConfig): string {
  const appPassword = process.env[brand.wpAppPasswordSecret];
  if (!appPassword) {
    throw new Error(
      `env var ${brand.wpAppPasswordSecret} is not set (WordPress Application Password)`
    );
  }
  const token = Buffer.from(`${brand.wpUser}:${appPassword}`).toString(
    "base64"
  );
  return `Basic ${token}`;
}

function apiUrl(brand: BrandConfig, path: string): string {
  return new URL(`/wp-json/wp/v2${path}`, brand.siteUrl).toString();
}

async function wpFetch<T>(
  brand: BrandConfig,
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(apiUrl(brand, path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(brand),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `WordPress API error ${res.status} on ${path}: ${body.slice(0, 500)}`
    );
  }
  return res.json() as Promise<T>;
}

async function resolveCategoryIds(
  brand: BrandConfig,
  names: string[]
): Promise<number[]> {
  const ids: number[] = [];
  for (const name of names) {
    const found = await wpFetch<{ id: number }[]>(
      brand,
      `/categories?search=${encodeURIComponent(name)}`
    );
    if (found.length > 0) {
      ids.push(found[0].id);
      continue;
    }
    const created = await wpFetch<{ id: number }>(brand, "/categories", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    ids.push(created.id);
  }
  return ids;
}

/**
 * SEOプラグイン固有のメタキーはサイトごとに異なる（Yoast/RankMath/AIOSEO等）。
 * REST APIでの上書きにはプラグイン側でメタフィールドをshow_in_restする設定が必要な場合がある。
 * ここではベストエフォートで代表的なキーを試し、失敗しても投稿自体は継続する。
 */
async function trySetSeoMeta(
  brand: BrandConfig,
  postId: number,
  post: GeneratedPost
): Promise<void> {
  const candidateMeta = {
    // Yoast SEO
    _yoast_wpseo_title: post.title,
    _yoast_wpseo_metadesc: post.metaDescription,
    // RankMath
    rank_math_title: post.title,
    rank_math_description: post.metaDescription,
    // このリポジトリ独自: テーマ側でJSON-LDを出力する場合に参照するキー
    blog_automation_json_ld: JSON.stringify(post.jsonLd),
  };
  try {
    await wpFetch(brand, `/posts/${postId}`, {
      method: "POST",
      body: JSON.stringify({ meta: candidateMeta }),
    });
  } catch (err) {
    console.warn(
      `[wordpress] SEO meta update failed (要: サイト側でメタフィールドをREST公開する設定). ` +
        `記事本文・下書き自体は作成済みなので手動でメタを設定してください。`,
      err
    );
  }
}

/**
 * 画像URLをダウンロードしてWordPressのメディアライブラリにアップロードし、
 * メディアIDを返す。失敗してもアイキャッチなしで記事作成は継続する。
 */
async function uploadFeaturedImage(
  brand: BrandConfig,
  imageUrl: string,
  filename: string,
  altText: string
): Promise<number | null> {
  try {
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) throw new Error(`image download failed: ${imageRes.status}`);
    const imageBuffer = await imageRes.arrayBuffer();

    const uploadRes = await fetch(apiUrl(brand, "/media"), {
      method: "POST",
      headers: {
        Authorization: authHeader(brand),
        "Content-Type": "image/jpeg",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
      body: Buffer.from(imageBuffer),
    });
    if (!uploadRes.ok) {
      throw new Error(
        `media upload failed: ${uploadRes.status} ${await uploadRes.text()}`
      );
    }
    const media = (await uploadRes.json()) as { id: number };

    await wpFetch(brand, `/media/${media.id}`, {
      method: "POST",
      body: JSON.stringify({ alt_text: altText, caption: altText }),
    });

    return media.id;
  } catch (err) {
    console.warn(
      "[wordpress] featured image upload failed, continuing without one",
      err
    );
    return null;
  }
}

export async function createDraftPost(
  brand: BrandConfig,
  post: GeneratedPost,
  featuredImage?: { url: string; filename: string } | null
): Promise<PublishedDraft> {
  const categoryIds = await resolveCategoryIds(brand, brand.categories);
  const featuredMediaId = featuredImage
    ? await uploadFeaturedImage(
        brand,
        featuredImage.url,
        featuredImage.filename,
        post.title
      )
    : null;
  const created = await wpFetch<{
    id: number;
    link: string;
  }>(brand, "/posts", {
    method: "POST",
    body: JSON.stringify({
      title: post.title,
      content: post.bodyHtml,
      excerpt: post.metaDescription,
      slug: post.slug,
      status: "draft",
      categories: categoryIds,
      // コメント・トラックバックは企業ブログでは不要かつスパムの温床になるため常に無効化する
      comment_status: "closed",
      ping_status: "closed",
      ...(featuredMediaId ? { featured_media: featuredMediaId } : {}),
    }),
  });
  await trySetSeoMeta(brand, created.id, post);
  const editLink = new URL(
    `/wp-admin/post.php?post=${created.id}&action=edit`,
    brand.siteUrl
  ).toString();
  return {
    ...post,
    wpPostId: created.id,
    editLink,
    previewLink: created.link,
  };
}

export async function publishPost(
  brand: BrandConfig,
  wpPostId: number
): Promise<{ link: string }> {
  const updated = await wpFetch<{ link: string }>(
    brand,
    `/posts/${wpPostId}`,
    {
      method: "POST",
      body: JSON.stringify({ status: "publish" }),
    }
  );
  return { link: updated.link };
}
