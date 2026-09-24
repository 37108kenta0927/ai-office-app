import Anthropic from "@anthropic-ai/sdk";
import type { AccountConfig, Diagnosis, FetchedInsights } from "./types.js";

const MODEL = "claude-sonnet-5";

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey });
}

const DIAGNOSIS_TOOL: Anthropic.Tool = {
  name: "submit_diagnosis",
  description: "Meta広告の数値診断結果と推奨アクションを提出する",
  input_schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "数値の要点を2〜4文で、専門用語を避けて要約する",
      },
      findings: {
        type: "array",
        items: { type: "string" },
        description: "キャンペーンごとの気づき・懸念点を箇条書きで(良い点も悪い点も)",
      },
      recommendedActions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["pause_campaign", "pause_ad", "adjust_daily_budget", "note_only"],
            },
            targetId: { type: "string", description: "対象のcampaign_id" },
            targetName: { type: "string" },
            detail: { type: "string", description: "何をどう変えるかを日本語で" },
            newDailyBudgetYen: {
              type: "number",
              description: "adjust_daily_budgetの場合のみ、変更後の日予算(円)",
            },
            reason: { type: "string", description: "なぜそれを勧めるか、数値根拠付きで" },
          },
          required: ["type", "targetId", "targetName", "detail", "reason"],
        },
      },
    },
    required: ["summary", "findings", "recommendedActions"],
  },
};

function objectiveInstruction(account: AccountConfig): string {
  if (account.objective === "acquisition") {
    return `# このアカウントの目的
${account.goal}
新規来店(予約)につながっているかを最重視する。resultType/results/costPerResultが
予約やメッセージ相談に近いイベントを指しているか確認し、そうでなければ
「コンバージョンの計測設定自体を見直すべき」という指摘もfindingsに含めてよい。
frequency(フリークエンシー)がおおむね3〜4を超えている場合は広告疲弊(同じ人に何度も表示され
反応が落ちる現象)の兆候として指摘する。`;
  }
  return `# このアカウントの目的
${account.goal}

# 狙っている応募者像(ペルソナ)
${account.targetPersona ?? "(未設定)"}

ageBreakdownがあれば、狙っている年齢層に実際にリーチできているかを必ず確認しコメントする。
Meta広告の数値だけでは「カラーに興味があるか」「働き方をどう考えているか」といった
価値観までは分からないため、その点は「応募フォームや面談で確認するしかない」旨をfindingに
正直に明記すること(数値だけで断定しない)。`;
}

export async function generateDiagnosis(
  account: AccountConfig,
  insights: FetchedInsights
): Promise<Diagnosis> {
  const anthropic = client();
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 3000,
    tools: [DIAGNOSIS_TOOL],
    tool_choice: { type: "tool", name: "submit_diagnosis" },
    messages: [
      {
        role: "user",
        content: `あなたは美容サロン向けのMeta広告(Facebook/Instagram)運用コンサルタントです。
以下のキャンペーン別インサイトデータをもとに、submit_diagnosisツールで診断結果を提出してください。

${objectiveInstruction(account)}

# 訴求方針
${account.brandVoice}

# 直近${insights.dateRangeDays}日間のキャンペーン別データ(JSON)
${JSON.stringify(insights.campaigns, null, 2)}

# 注意事項
- recommendedActionsは「今すぐ実行して問題ない」レベルの具体性・安全性がある提案のみにする
  (成果の出ていないキャンペーンの一時停止、明らかに割高なキャンペーンの日予算引き下げ、等)
- 判断材料が不足していて提案しにくい場合は type: "note_only" にし、
  必要な追加確認事項をdetailに書く(この場合は自動実行されない)
- adjust_daily_budgetを提案する場合、newDailyBudgetYenに具体的な金額(円)を必ず入れる
- 数字の裏付けのない提案は書かない`,
      },
    ],
  });
  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  if (!toolUse) throw new Error("Claude did not return a tool_use block");
  const result = toolUse.input as Omit<Diagnosis, "accountId" | "label">;
  return {
    accountId: account.id,
    label: account.label,
    summary: result.summary,
    findings: asArray(result.findings),
    recommendedActions: asArray(result.recommendedActions),
  };
}

/**
 * ツール呼び出しの配列項目が、まれに文字列化されたJSONとして返ってくることがあるための防御。
 * 配列ならそのまま、文字列ならパースを試み、それでも配列にならなければ空配列にする。
 */
function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed as T[];
    } catch {
      // fall through
    }
  }
  return [];
}
