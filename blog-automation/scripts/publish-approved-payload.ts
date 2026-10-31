import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import backlog from "../config/backlog-publish-queue.json" with { type: "json" };
import { loadBrand } from "./lib/config.js";
import { getPost, hasPublishedSince, publishPost, updatePostCopy } from "./lib/wordpress.js";

type Payload = { brandId: string; issueNumber: number; wpPostId: number; expectedModifiedGmt: string | null; expectedContentSha256: string; title: string; excerpt: string; content: string };
function arg(): string { const i = process.argv.indexOf("--brand"); if (i < 0 || !process.argv[i + 1]) throw new Error("missing --brand"); return process.argv[i + 1]; }
function text(value: { raw?: string; rendered?: string }) { return value.raw ?? value.rendered ?? ""; }
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function jstStart() { const n = new Date(Date.now() + 9 * 3600_000); return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()) - 9 * 3600_000).toISOString(); }
function safeHtml(content: string, bookingUrl: string) { return content.replace(/<[^>]*>/g, " ").trim().length >= 800 && content.includes(bookingUrl) && !/<\/?(?:script|iframe)\b|\son\w+\s*=|javascript:/i.test(content); }
async function main() {
  if (Date.now() < Date.UTC(2026, 9, 31, 15)) throw new Error("publishing is disabled until 2026-11-01 JST");
  const brand = loadBrand(arg()); if (await hasPublishedSince(brand, jstStart())) return console.log("already published today (JST)");
  const dir = path.resolve(import.meta.dirname, "..", "content", "approved-payloads");
  const entries = (backlog as unknown as Record<string, { issue: number; wpPost: number }[]>)[brand.id] ?? [];
  for (const entry of entries) {
    const file = path.join(dir, `${brand.id}-${entry.issue}.json`); if (!existsSync(file)) continue;
    const payload = JSON.parse(readFileSync(file, "utf8")) as Payload;
    if (payload.brandId !== brand.id || payload.issueNumber !== entry.issue || payload.wpPostId !== entry.wpPost || !safeHtml(payload.content, brand.bookingUrl)) throw new Error(`invalid approved payload for issue #${entry.issue}`);
    const current = await getPost(brand, entry.wpPost);
    if (current.status !== "draft" || current.modified_gmt !== payload.expectedModifiedGmt || hash(text(current.content)) !== payload.expectedContentSha256) throw new Error(`draft changed or unavailable for issue #${entry.issue}`);
    await updatePostCopy(brand, current.id, { title: payload.title, excerpt: payload.excerpt, content: payload.content });
    const result = await publishPost(brand, current.id); const verified = await getPost(brand, current.id);
    if (verified.status !== "publish" || verified.link !== result.link) throw new Error(`publication verification failed for #${current.id}`);
    console.log(`published ${verified.link}`); return;
  }
  console.log("no approved payload in fixed backlog");
}
main().catch((error) => { console.error(error); process.exit(1); });
