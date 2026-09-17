import { readFileSync, writeFileSync } from "node:fs";
import { loadBrand, outputFile } from "./lib/config.js";
import { createDraftPost } from "./lib/wordpress.js";
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

  console.log(`[publish-wordpress] creating draft on ${brand.siteUrl} ...`);
  const draft = await createDraftPost(brand, post);
  writeFileSync(outputFile(brand.id), JSON.stringify(draft, null, 2), "utf-8");
  console.log(`[publish-wordpress] created WP draft #${draft.wpPostId}: ${draft.editLink}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
