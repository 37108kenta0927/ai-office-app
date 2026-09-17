import { readFileSync } from "node:fs";
import { loadBrand, outputFile } from "./lib/config.js";
import { createReviewIssue } from "./lib/github.js";
import type { PublishedDraft } from "./lib/types.js";

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
  const draft = JSON.parse(
    readFileSync(outputFile(brand.id), "utf-8")
  ) as PublishedDraft;

  console.log(`[notify-review] creating GitHub Issue for ${draft.title} ...`);
  await createReviewIssue(draft);
  console.log("[notify-review] done — waiting for human review (/publish comment)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
