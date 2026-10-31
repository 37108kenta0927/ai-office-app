import { createHash } from "node:crypto";
import backlog from "../config/backlog-publish-queue.json" with { type: "json" };
import { loadBrand } from "./lib/config.js";
import { getPost } from "./lib/wordpress.js";

function arg(): string { const i = process.argv.indexOf("--brand"); if (i < 0 || !process.argv[i + 1]) throw new Error("missing --brand"); return process.argv[i + 1]; }
function text(value: { raw?: string; rendered?: string }) { return value.raw ?? value.rendered ?? ""; }
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }

async function main() {
  const brand = loadBrand(arg());
  const entries = (backlog as unknown as Record<string, { issue: number; wpPost: number }[]>)[brand.id] ?? [];
  for (const entry of entries) {
    const post = await getPost(brand, entry.wpPost);
    if (post.status !== "draft") continue;
    // This log contains editorial copy but never credentials. It is the exact
    // snapshot the chat must use when preparing an approved payload.
    console.log(JSON.stringify({ brandId: brand.id, issueNumber: entry.issue, wpPostId: post.id, expectedModifiedGmt: post.modified_gmt, expectedContentSha256: hash(text(post.content)), expectedTitleSha256: hash(text(post.title)), expectedExcerptSha256: hash(text(post.excerpt)), title: text(post.title), excerpt: text(post.excerpt), content: text(post.content) }));
    return;
  }
  console.log(JSON.stringify({ brandId: brand.id, status: "no-draft-in-fixed-backlog" }));
}
main().catch((error) => { console.error(error); process.exit(1); });
