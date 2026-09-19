import { Octokit } from "@octokit/rest";
import type { PublishedDraft } from "./types.js";

const MARKER_PREFIX = "<!-- blog-automation:";
const MARKER_SUFFIX = " -->";

export interface DraftMarker {
  brandId: string;
  topicId: string;
  wpPostId: number;
  previewLink: string;
  title: string;
}

export function octokit(): Octokit {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not set");
  return new Octokit({ auth: token });
}

export function repoContext(): { owner: string; repo: string } {
  const full = process.env.GITHUB_REPOSITORY;
  if (!full) throw new Error("GITHUB_REPOSITORY is not set");
  const [owner, repo] = full.split("/");
  return { owner, repo };
}

export function buildMarker(marker: DraftMarker): string {
  return `${MARKER_PREFIX}${JSON.stringify(marker)}${MARKER_SUFFIX}`;
}

export function parseMarker(issueBody: string): DraftMarker {
  const start = issueBody.indexOf(MARKER_PREFIX);
  const end = issueBody.indexOf(MARKER_SUFFIX, start);
  if (start === -1 || end === -1) {
    throw new Error("could not find blog-automation marker in issue body");
  }
  const json = issueBody.slice(start + MARKER_PREFIX.length, end);
  return JSON.parse(json) as DraftMarker;
}

export async function createReviewIssue(draft: PublishedDraft): Promise<void> {
  const client = octokit();
  const { owner, repo } = repoContext();
  const riskSection =
    draft.riskFlags.length > 0
      ? `### ⚠️ 薬機法・景品表示法リスクフラグ\n${draft.riskFlags
          .map((f) => `- ${f}`)
          .join("\n")}`
      : "### ✅ 薬機法・景品表示法リスクフラグ\nAIによる自動チェックでは検出なし（最終判断は必ず人間が行ってください）。";

  const body = `## ${draft.title}

**ブランド**: ${draft.brandId}
**下書き編集**: ${draft.editLink}
**meta description**: ${draft.metaDescription}

${riskSection}

### 内部リンク候補
${draft.internalLinkSuggestions.map((s) => `- ${s}`).join("\n") || "- なし"}

### レビューチェックリスト
- [ ] 事実関係・表現を確認した
- [ ] 薬機法・景品表示法上の懸念がないことを確認した
- [ ] SEOタイトル・meta descriptionを確認した

確認が終わったら、このIssueに \`おけ\` とコメントすると自動で公開・X告知まで実行されます。

${buildMarker({
  brandId: draft.brandId,
  topicId: draft.topicId,
  wpPostId: draft.wpPostId,
  previewLink: draft.previewLink,
  title: draft.title,
})}
`;

  await client.issues.create({
    owner,
    repo,
    title: `[要レビュー] ${draft.brandId}: ${draft.title}`,
    body,
    labels: ["blog-review"],
  });
}
