import { readFileSync, writeFileSync } from "node:fs";
import {
  loadBrand,
  loadUsedImageIds,
  outputFile,
  saveUsedImageIds,
} from "./lib/config.js";
import { createDraftPost, type FeaturedImageInput } from "./lib/wordpress.js";
import {
  attributionHtml,
  downloadPhoto,
  searchPhoto,
  trackDownload,
} from "./lib/unsplash.js";
import { pickLocalImage } from "./lib/local-images.js";
import type { GeneratedPost } from "./lib/types.js";

function getArg(name: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1 || !process.argv[idx + 1]) {
    throw new Error(`missing required --${name} argument`);
  }
  return process.argv[idx + 1];
}

async function main() {
  const brandId = getArg("brand");
  const brand = loadBrand(brandId);
  const post = JSON.parse(
    readFileSync(outputFile(brand.id), "utf-8")
  ) as GeneratedPost;

  let featuredImage: FeaturedImageInput | null = null;
  const usedImageIds = loadUsedImageIds();

  // 自社で用意した画像(content/images/<brand>/)があれば最優先で使う。
  // ストック写真より自社の実写真の方がブランディング・E-E-A-T上望ましいため。
  const local = pickLocalImage(brand, usedImageIds);
  if (local) {
    console.log(`[publish-wordpress] using local image ${local.filePath}`);
    featuredImage = {
      buffer: readFileSync(local.filePath),
      filename: local.filename,
      contentType: local.contentType,
    };
    usedImageIds.add(local.key);
    saveUsedImageIds(usedImageIds);
  } else if (process.env.UNSPLASH_ACCESS_KEY) {
    try {
      console.log(
        `[publish-wordpress] no local image available, searching Unsplash for "${post.imageSearchQuery}" ...`
      );
      const photo = await searchPhoto(post.imageSearchQuery, usedImageIds);
      if (photo) {
        const downloaded = await downloadPhoto(photo);
        await trackDownload(photo);
        featuredImage = {
          buffer: downloaded.buffer,
          filename: photo.filename,
          contentType: downloaded.contentType,
        };
        post.bodyHtml = `${post.bodyHtml}\n${attributionHtml(photo)}`;
        usedImageIds.add(photo.id);
        saveUsedImageIds(usedImageIds);
      } else {
        console.warn("[publish-wordpress] no Unsplash photo found for query, skipping image");
      }
    } catch (err) {
      console.warn("[publish-wordpress] Unsplash lookup failed, continuing without image", err);
    }
  } else {
    console.log(
      "[publish-wordpress] no local image and UNSPLASH_ACCESS_KEY not set, skipping featured image"
    );
  }

  console.log(`[publish-wordpress] creating draft on ${brand.siteUrl} ...`);
  const draft = await createDraftPost(brand, post, featuredImage);
  writeFileSync(outputFile(brand.id), JSON.stringify(draft, null, 2), "utf-8");
  console.log(`[publish-wordpress] created WP draft #${draft.wpPostId}: ${draft.editLink}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
