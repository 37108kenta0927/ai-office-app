import Anthropic from "@anthropic-ai/sdk";
import { loadBrand, markTopicStatus } from "./lib/config.js";
import { octokit, parseMarker, repoContext, type DraftMarker } from "./lib/github.js";
import { getPost, hasPublishedSince, publishPost, updatePostCopy } from "./lib/wordpress.js";

type Candidate = { number: number; marker: DraftMarker; reviewBody: string };
type Decision = { decision: "publish" | "hold"; reason: string; title: string; content: string; excerpt: string };
const MIN_TEXT_LENGTH = 800;
const START_AT_JST = Date.UTC(2026, 9, 31, 15);

function requiredArg(name: string): string { const i = process.argv.indexOf(`--${name}`); const v = i < 0 ? undefined : process.argv[i + 1]; if (!v) throw new Error(`missing required --${name} argument`); return v; }
function startOfTodayJst(now = new Date()): string { const jst = new Date(now.getTime() + 9 * 3600_000); return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) - 9 * 3600_000).toISOString(); }
function text(value: { raw?: string; rendered?: string }): string { return value.raw ?? value.rendered ?? ""; }
function plain(html: string): string { return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(); }
function validate(brand: ReturnType<typeof loadBrand>, d: Decision): string | null {
  if (!d.title.trim() || plain(d.content).length < MIN_TEXT_LENGTH) return `revised copy is shorter than ${MIN_TEXT_LENGTH} characters`;
  if (!d.content.includes(brand.bookingUrl)) return "revised copy is missing the existing booking CTA";
  if (/javascript:|data:text\/html/i.test(d.content)) return "revised copy contains an unsafe link";
  return null;
}
async function candidates(brandId: string): Promise<Candidate[]> {
  const client = octokit(); const { owner, repo } = repoContext();
  const issues = await client.paginate(client.issues.listForRepo, { owner, repo, state: "open", labels: "blog-review", per_page: 100, direction: "asc", sort: "created" });
  return issues.flatMap((issue) => { if (issue.pull_request) return []; try { const marker = parseMarker(issue.body ?? ""); return marker.brandId === brandId ? [{ number: issue.number, marker, reviewBody: issue.body ?? "" }] : []; } catch { return []; } });
}
async function assess(brand: ReturnType<typeof loadBrand>, candidate: Candidate, title: string, content: string, excerpt: string): Promise<Decision> {
  const apiKey = process.env.ANTHROPIC_API_KEY; if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const facts = `${brand.name}; site=${brand.siteUrl}; categories=${brand.categories.join(", ")}; location=${brand.location?.city ?? "not verified"}`;
  const response = await new Anthropic({ apiKey }).messages.create({ model: "claude-sonnet-5", max_tokens: 4000,
    tools: [{ name: "submit_publication_decision", description: "Return a safe decision for current WordPress copy.", input_schema: { type: "object", properties: { decision: { type: "string", enum: ["publish", "hold"] }, reason: { type: "string" }, title: { type: "string" }, content: { type: "string" }, excerpt: { type: "string" } }, required: ["decision", "reason", "title", "content", "excerpt"] } }], tool_choice: { type: "tool", name: "submit_publication_decision" },
    messages: [{ role: "user", content: `Final safety review. Current WordPress content is authoritative; old ticket is concern context only. Verified brand facts: ${facts}. Never invent prices, customer experiences, results, staff, services, availability, policy, or structured-data facts. Remove unsupported claims or hold for fact check. Positive observations are not concerns. Keep title/excerpt/HTML/JSON-LD claims consistent and preserve booking CTA exactly. Return HTML.\n\nOLD TICKET:\n${candidate.reviewBody}\n\nTITLE:\n${title}\n\nEXCERPT:\n${excerpt}\n\nCURRENT HTML:\n${content}` }],
  });
  const tool = response.content.find((item): item is Anthropic.ToolUseBlock => item.type === "tool_use"); if (!tool) throw new Error("reviewer did not return a decision");
  const d = tool.input as Decision; if (!(["publish", "hold"] as string[]).includes(d.decision) || !d.reason?.trim()) throw new Error("invalid review decision"); return d;
}
async function note(issue: number, body: string, close = false) { const client = octokit(); const { owner, repo } = repoContext(); await client.issues.createComment({ owner, repo, issue_number: issue, body }); if (close) await client.issues.update({ owner, repo, issue_number: issue, state: "closed" }); }

async function main() {
  const brand = loadBrand(requiredArg("brand")); const dryRun = process.argv.includes("--dry-run");
  if (!dryRun && Date.now() < START_AT_JST) throw new Error("publishing is disabled until 2026-11-01 JST");
  if (await hasPublishedSince(brand, startOfTodayJst())) return console.log(`[daily-publish] ${brand.id} already published today (JST)`);
  for (const candidate of await candidates(brand.id)) {
    const current = await getPost(brand, candidate.marker.wpPostId);
    if (current.status === "publish") { console.log(`[daily-publish] #${current.id} already published; skip`); if (!dryRun) { await note(candidate.number, `Already published: ${current.link}. Closed without republishing.`, true); markTopicStatus(brand, candidate.marker.topicId, "published"); } continue; }
    if (current.status !== "draft") { console.log(`[daily-publish] #${current.id} status=${current.status}; skip`); if (!dryRun) await note(candidate.number, `Skipped: current WordPress status is ${current.status}; not published.`); continue; }
    const decision = await assess(brand, candidate, text(current.title), text(current.content), text(current.excerpt)); const invalid = decision.decision === "publish" ? validate(brand, decision) : null;
    console.log(`[daily-publish] issue #${candidate.number}, WP #${current.id}, ${decision.decision}: ${invalid ?? decision.reason}`);
    if (dryRun) return;
    if (decision.decision === "hold" || invalid) { await note(candidate.number, `Held for fact check; not published. Reason: ${invalid ?? decision.reason}`); continue; }
    const before = await getPost(brand, current.id); if (before.status !== "draft" || before.modified_gmt !== current.modified_gmt || text(before.content) !== text(current.content)) throw new Error(`WP post #${current.id} changed during review; stopping`);
    await updatePostCopy(brand, current.id, { title: decision.title, content: decision.content, excerpt: decision.excerpt }); const published = await publishPost(brand, current.id); const verified = await getPost(brand, current.id);
    if (verified.status !== "publish" || !verified.date_gmt || verified.link !== published.link) throw new Error(`WP post #${current.id} publication could not be verified; stopping`);
    markTopicStatus(brand, candidate.marker.topicId, "published"); await note(candidate.number, `Published after current-draft safety review: ${verified.link} (UTC publication time: ${verified.date_gmt}).`, true); console.log(`[daily-publish] published ${verified.link}`); return;
  }
  console.log(`[daily-publish] no safe draft available for ${brand.id}`);
}
main().catch((error) => { console.error(error); process.exit(1); });
