import { Octokit } from "@octokit/rest";
import type { Diagnosis, FetchedInsights, RecommendedAction } from "./types.js";

const MARKER_PREFIX = "<!-- ads-automation:";
const MARKER_SUFFIX = " -->";

export interface DiagnosisMarker {
  accountId: string;
  actions: RecommendedAction[];
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

function buildMarker(marker: DiagnosisMarker): string {
  return `${MARKER_PREFIX}${JSON.stringify(marker)}${MARKER_SUFFIX}`;
}

export function parseMarker(issueBody: string): DiagnosisMarker {
  const start = issueBody.indexOf(MARKER_PREFIX);
  const end = issueBody.indexOf(MARKER_SUFFIX, start);
  if (start === -1 || end === -1) {
    throw new Error("could not find ads-automation marker in issue body");
  }
  const json = issueBody.slice(start + MARKER_PREFIX.length, end);
  return JSON.parse(json) as DiagnosisMarker;
}

function formatCampaignTable(insights: FetchedInsights): string {
  const header =
    "| キャンペーン | 消化金額 | 表示回数 | クリック | CTR | フリークエンシー | 成果(種別) | 成果単価 |\n|---|---|---|---|---|---|---|---|";
  const rows = insights.campaigns.map((c) => {
    const result = c.results !== null ? `${c.results}件 (${c.resultType})` : "-";
    const costPerResult =
      c.costPerResult !== null ? `¥${Math.round(c.costPerResult).toLocaleString()}` : "-";
    return `| ${c.campaignName} | ¥${Math.round(c.spend).toLocaleString()} | ${c.impressions.toLocaleString()} | ${c.clicks.toLocaleString()} | ${c.ctr.toFixed(2)}% | ${c.frequency.toFixed(1)} | ${result} | ${costPerResult} |`;
  });
  return [header, ...rows].join("\n");
}

function actionLabel(type: RecommendedAction["type"]): string {
  switch (type) {
    case "note_only":
      return "📝 要確認(自動実行なし)";
    case "pause_campaign":
      return "⏸ キャンペーン一時停止";
    case "pause_ad":
      return "⏸ 広告一時停止";
    case "adjust_daily_budget":
      return "💰 日予算変更";
  }
}

function formatActions(diagnosis: Diagnosis): string {
  if (diagnosis.recommendedActions.length === 0) return "特になし。";
  return diagnosis.recommendedActions
    .map(
      (a, i) =>
        `**${i + 1}. ${actionLabel(a.type)}: ${a.targetName}**\n- 内容: ${a.detail}\n- 理由: ${a.reason}`
    )
    .join("\n\n");
}

export async function createDiagnosisIssue(
  diagnosis: Diagnosis,
  insights: FetchedInsights
): Promise<void> {
  const client = octokit();
  const { owner, repo } = repoContext();
  const executableActions = diagnosis.recommendedActions.filter((a) => a.type !== "note_only");

  const body = `## ${diagnosis.label} 広告診断(直近${insights.dateRangeDays}日間)

### 📊 数値サマリー
${diagnosis.summary}

### 📋 キャンペーン別データ
${formatCampaignTable(insights)}

### 🔍 気づき
${diagnosis.findings.map((f) => `- ${f}`).join("\n")}

### 🛠 推奨アクション
${formatActions(diagnosis)}

${
  executableActions.length > 0
    ? `### レビューチェックリスト
- [ ] 提案内容を確認した
- [ ] このまま実行してよいことを確認した

確認が終わったら、このIssueに \`おけ\` とコメントすると上記のアクションが自動実行されます(「要確認」の項目は自動実行されません)。`
    : "今回は自動実行できる提案はありません(要確認事項のみ)。"
}

${buildMarker({ accountId: diagnosis.accountId, actions: executableActions })}
`;

  await client.issues.create({
    owner,
    repo,
    title: `[広告診断] ${diagnosis.label} (${insights.fetchedAt.slice(0, 10)})`,
    body,
    labels: ["ads-review"],
  });
}
