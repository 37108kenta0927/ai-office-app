import { octokit, parseMarker, repoContext } from "./lib/github.js";
import { pauseCampaign, setCampaignDailyBudget } from "./lib/meta.js";
import type { RecommendedAction } from "./lib/types.js";

function getArg(name: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1 || !process.argv[idx + 1]) {
    throw new Error(`missing required --${name} argument`);
  }
  return process.argv[idx + 1];
}

async function applyAction(action: RecommendedAction): Promise<string> {
  if (action.type === "pause_campaign" || action.type === "pause_ad") {
    await pauseCampaign(action.targetId);
    return `✅ 一時停止しました: ${action.targetName}`;
  }
  if (action.type === "adjust_daily_budget") {
    if (!action.newDailyBudgetYen) {
      return `⚠️ スキップ: ${action.targetName}(変更後の日予算が未設定のため)`;
    }
    await setCampaignDailyBudget(action.targetId, action.newDailyBudgetYen);
    return `✅ 日予算を¥${action.newDailyBudgetYen.toLocaleString()}に変更しました: ${action.targetName}`;
  }
  return `⚠️ スキップ: ${action.targetName}(未対応のアクション種別 ${action.type})`;
}

async function main() {
  const issueNumber = Number(getArg("issue"));
  const client = octokit();
  const { owner, repo } = repoContext();

  const { data: issue } = await client.issues.get({ owner, repo, issue_number: issueNumber });
  const marker = parseMarker(issue.body ?? "");

  const results: string[] = [];
  for (const action of marker.actions) {
    try {
      results.push(await applyAction(action));
    } catch (err) {
      results.push(`❌ 失敗: ${action.targetName} — ${(err as Error).message}`);
    }
  }

  await client.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body: results.length > 0 ? results.join("\n") : "実行対象のアクションがありませんでした。",
  });
  await client.issues.update({ owner, repo, issue_number: issueNumber, state: "closed" });

  console.log("[approve-apply] done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
