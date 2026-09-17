import { mkdirSync, writeFileSync } from "node:fs";
import { loadBrand, markTopicStatus, outputDir, outputFile, pickNextTopic } from "./lib/config.js";
import { generatePost } from "./lib/anthropic.js";

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
  const topic = pickNextTopic(brand);

  console.log(`[generate-post] brand=${brand.id} topic=${topic.id} (${topic.title})`);
  const post = await generatePost(brand, topic);

  mkdirSync(outputDir(), { recursive: true });
  writeFileSync(outputFile(brand.id), JSON.stringify(post, null, 2), "utf-8");
  markTopicStatus(brand, topic.id, "drafted");

  if (post.riskFlags.length > 0) {
    console.warn(
      `[generate-post] riskFlags detected (${post.riskFlags.length}) — will be surfaced in the review issue`
    );
  }
  console.log(`[generate-post] wrote draft to ${outputFile(brand.id)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
