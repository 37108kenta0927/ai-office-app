import Anthropic from "@anthropic-ai/sdk";
import { loadBrand, markTopicStatus } from "./lib/config.js";
import { octokit, parseMarker, repoContext, type DraftMarker } from "./lib/github.js";
import { getPost, hasPublishedSince, publishPost, updatePostCopy } from "./lib/wordpress.js";

type Decision = { decision: "publish" | "hold"; reason: string; title: string; content: string; excerpt: string };

function getArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function requiredArg(name: string): string {
  const value = getArg(name);
  if (!value) throw new Error(`missing required --${name} argument`);
  return value;
}

function startOfTodayJst(now = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) - 9 * 60 * 60 * 1000).toISOString();
}

function currentText(value: { raw?: string; rendered?: string }): string {
  return value.raw ?? value.rendered ?? "";
}

async function oldestOpenReview(brandId: string): Promise<{ number: number; marker: DraftMarker } | null> {
  const client = octokit();
  const { owner, repo } = repoContext();
  const issues = await client.paginate(client.issues.listForRepo, {
    owner, repo, state: "open", labels: "blog-review", per_page: 100, direction: "asc", sort: "created",
  });
  for (const issue of issues) {
    if (issue.pull_request) continue;
    try {
      const marker = parseMarker(issue.body ?? "");
      if (marker.brandId === brandId) return { number: issue.number, marker };
    } catch {
      // A manually-created issue with this label is not an automatable draft.
    }
  }
  return null;
}

async function assessCurrentCopy(input: { brandName: string; title: string; content: string; excerpt: string }): Promise<Decision> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 4000,
    tools: [{
      name: "submit_publication_decision",
      description: "Return a safe publication decision for the current WordPress draft.",
      input_schema: { type: "object", properties: {
        decision: { type: "string", enum: ["publish", "hold"] }, reason: { type: "string" },
        title: { type: "string" }, content: { type: "string" }, excerpt: { type: "string" },
      }, required: ["decision", "reason", "title", "content", "excerpt"] },
    }],
    tool_choice: { type: "tool", name: "submit_publication_decision" },
    messages: [{ role: "user", content: `You are the final safety editor for ${input.brandName}. Review the CURRENT WordPress draft below, not an old ticket preview. You may make only conservative edits that remove or soften unsupported claims. Never invent customer experiences, prices, results, staff details, services, policies, availability, or facts not present in the supplied text. Remove unsupported claims instead of replacing them with new facts.\n\nPublish only if the copy is safe after those conservative edits. Hold when publication requires a business fact check, when a claim cannot safely be removed without making the article misleading, or when the current draft is empty/broken. A positive observation is not an issue: do not hold just to say the writing is clear, natural, or has no issue.\n\nReturn content as HTML, preserving safe markup and the existing booking CTA.\n\nTITLE:\n${input.title}\n\nEXCERPT:\n${input.excerpt}\n\nCURRENT HTML:\n${input.content}` }],
  });
  const tool = response.content.find((item): item is Anthropic.ToolUseBlock => item.type === "tool_use");
  if (!tool) throw new Error("reviewer did not return a publication decision");
  const decision = tool.input as Decision;
  if (
    (decision.decision !== "publish" && decision.decision !== "hold") ||
    !decision.reason.trim() ||
    !decision.title.trim() ||
    !decision.content.trim()
  ) {
    throw new Error("reviewer returned an invalid decision");
  }
  return decision;
}

async function main() {
  const brand = loadBrand(requiredArg("brand"));
  const dryRun = process.argv.includes("--dry-run");
  const candidate = await oldestOpenReview(brand.id);
  if (!candidate) return console.log(`[daily-publish] no open review draft for ${brand.id}`);
  if (await hasPublishedSince(brand, startOfTodayJst())) {
    return console.log(`[daily-publish] ${brand.id} already has a post published today (JST); stopping`);
  }
  const current = await getPost(brand, candidate.marker.wpPostId);
  if (current.status === "publish") {
    console.log(`[daily-publish] WP post #${current.id} is already published; reconciling Issue only`);
    if (!dryRun) {
      const client = octokit(); const { owner, repo } = repoContext();
      await client.issues.createComment({ owner, repo, issue_number: candidate.number, body: `Already published: ${current.link}. Closing this review item without republishing.` });
      await client.issues.update({ owner, repo, issue_number: candidate.number, state: "closed" });
      markTopicStatus(brand, candidate.marker.topicId, "published");
    }
    return;
  }
  if (current.status !== "draft") throw new Error(`WP post #${current.id} has unexpected status ${current.status}`);
  const decision = await assessCurrentCopy({ brandName: brand.name, title: currentText(current.title), content: currentText(current.content), excerpt: currentText(current.excerpt) });
  console.log(`[daily-publish] candidate issue #${candidate.number}, WP #${current.id}, decision=${decision.decision}: ${decision.reason}`);
  if (dryRun || decision.decision === "hold") {
    if (!dryRun && decision.decision === "hold") {
      const client = octokit(); const { owner, repo } = repoContext();
      await client.issues.createComment({ owner, repo, issue_number: candidate.number, body: `Held for fact check; not published. Reason: ${decision.reason}` });
    }
    return;
  }
  // Re-read status immediately before writing so a concurrent/manual publish cannot be overwritten.
  const beforeWrite = await getPost(brand, current.id);
  if (beforeWrite.status !== "draft") throw new Error(`WP post #${current.id} changed to ${beforeWrite.status}; stopping`);
  if (beforeWrite.modified_gmt !== current.modified_gmt || currentText(beforeWrite.content) !== currentText(current.content)) {
    throw new Error(`WP post #${current.id} was edited during review; stopping without overwrite`);
  }
  await updatePostCopy(brand, current.id, { title: decision.title, content: decision.content, excerpt: decision.excerpt });
  const published = await publishPost(brand, current.id);
  markTopicStatus(brand, candidate.marker.topicId, "published");
  const client = octokit(); const { owner, repo } = repoContext();
  await client.issues.createComment({ owner, repo, issue_number: candidate.number, body: `Published after current-draft safety review: ${published.link}` });
  await client.issues.update({ owner, repo, issue_number: candidate.number, state: "closed" });
  console.log(`[daily-publish] published ${published.link}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
