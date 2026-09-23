import { readFileSync, writeFileSync } from "node:fs";
import {
  loadBrand,
  loadUsedImageIds,
  outputFile,
  saveUsedImageIds,
} from "./lib/config.js";
import { createDraftPost } from "./lib/wordpress.js";
import { attributionHtml, searchPhoto, trackDownload } from "./lib/unsplash.js";
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

  let featuredImage: { url: string; filename: string } | null = null;
  if (process.env.UNSPLASH_ACCESS_KEY) {
    try {
      console.log(`[publish-wordpress] searching Unsplash for "${post.imageSearchQuery}" ...`);
      const usedImageIds = loadUsedImageIds();
      const photo = await searchPhoto(post.imageSearchQuery, usedImageIds);
      if (photo) {
        await trackDownload(photo);
        featuredImage = { url: photo.imageUrl, filename: photo.filename };
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
    console.log("[publish-wordpress] UNSPLASH_ACCESS_KEY not set, skipping featured image");
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
