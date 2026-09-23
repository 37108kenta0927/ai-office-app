import type { AccountConfig, CampaignInsight, FetchedInsights } from "./types.js";

// Metaはおおむね2年でAPIバージョンを廃止するため、定期的に最新版に上げること。
// https://developers.facebook.com/docs/graph-api/changelog
const GRAPH_API_VERSION = "v21.0";

function accessToken(): string {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN is not set");
  return token;
}

async function graphFetch<T>(pathAndQuery: string): Promise<T> {
  const sep = pathAndQuery.includes("?") ? "&" : "?";
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}${pathAndQuery}${sep}access_token=${encodeURIComponent(
    accessToken()
  )}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta Graph API error ${res.status}: ${body.slice(0, 800)}`);
  }
  return res.json() as Promise<T>;
}

interface RawAction {
  action_type: string;
  value: string;
}

interface RawInsightRow {
  campaign_id: string;
  campaign_name: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  frequency?: string;
  actions?: RawAction[];
  cost_per_action_type?: RawAction[];
}

interface RawAgeRow {
  campaign_id: string;
  age: string;
  impressions?: string;
  spend?: string;
}

const FIELDS = [
  "campaign_id",
  "campaign_name",
  "spend",
  "impressions",
  "reach",
  "clicks",
  "ctr",
  "cpc",
  "cpm",
  "frequency",
  "actions",
  "cost_per_action_type",
].join(",");

// 求人=応募(lead)、集客=来店予約・メッセージ相談に近いイベントを優先してresultとして拾う。
// カスタムコンバージョンの名称はアカウントごとに違うため、見つからない場合はリンククリックにフォールバックする。
const RESULT_ACTION_PRIORITY = [
  "lead",
  "offsite_conversion.fb_pixel_lead",
  "onsite_conversion.messaging_conversation_started_7d",
  "link_click",
];

function pickResult(
  actions: RawAction[] | undefined,
  costPerAction: RawAction[] | undefined
): { results: number | null; costPerResult: number | null; resultType: string | null } {
  if (!actions) return { results: null, costPerResult: null, resultType: null };
  for (const type of RESULT_ACTION_PRIORITY) {
    const action = actions.find((a) => a.action_type === type);
    if (action) {
      const cost = costPerAction?.find((c) => c.action_type === type);
      return {
        results: Number(action.value),
        costPerResult: cost ? Number(cost.value) : null,
        resultType: type,
      };
    }
  }
  return { results: null, costPerResult: null, resultType: null };
}

function buildFilteringParam(account: AccountConfig): string {
  if (account.campaignIds && account.campaignIds.length > 0) return "";
  if (!account.campaignNameContains || account.campaignNameContains.length === 0) return "";
  const filters = account.campaignNameContains.map((keyword) => ({
    field: "campaign.name",
    operator: "CONTAIN",
    value: keyword,
  }));
  return `&filtering=${encodeURIComponent(JSON.stringify(filters))}`;
}

export async function fetchCampaignInsights(
  account: AccountConfig,
  dateRangeDays = 28
): Promise<FetchedInsights> {
  const filtering = buildFilteringParam(account);
  const rows = await graphFetch<{ data: RawInsightRow[] }>(
    `/act_${account.adAccountId}/insights?level=campaign&fields=${FIELDS}&date_preset=last_${dateRangeDays}d${filtering}&limit=200`
  );

  // 求人アカウントは狙っている年齢層に届いているかを見るため、年齢別の内訳も取得する。
  let ageRows: RawAgeRow[] = [];
  if (account.objective === "recruit") {
    const ageResult = await graphFetch<{ data: RawAgeRow[] }>(
      `/act_${account.adAccountId}/insights?level=campaign&fields=campaign_id,impressions,spend&breakdowns=age&date_preset=last_${dateRangeDays}d${filtering}&limit=500`
    );
    ageRows = ageResult.data;
  }

  const campaigns: CampaignInsight[] = rows.data
    .filter((row) =>
      account.campaignIds && account.campaignIds.length > 0
        ? account.campaignIds.includes(row.campaign_id)
        : true
    )
    .map((row) => {
      const { results, costPerResult, resultType } = pickResult(
        row.actions,
        row.cost_per_action_type
      );
      const ageBreakdown = ageRows
        .filter((a) => a.campaign_id === row.campaign_id)
        .map((a) => ({
          age: a.age,
          impressions: Number(a.impressions ?? 0),
          spend: Number(a.spend ?? 0),
        }));
      return {
        campaignId: row.campaign_id,
        campaignName: row.campaign_name,
        spend: Number(row.spend ?? 0),
        impressions: Number(row.impressions ?? 0),
        reach: Number(row.reach ?? 0),
        clicks: Number(row.clicks ?? 0),
        ctr: Number(row.ctr ?? 0),
        cpc: Number(row.cpc ?? 0),
        cpm: Number(row.cpm ?? 0),
        frequency: Number(row.frequency ?? 0),
        results,
        costPerResult,
        resultType,
        ...(ageBreakdown.length > 0 ? { ageBreakdown } : {}),
      };
    });

  return {
    accountId: account.id,
    fetchedAt: new Date().toISOString(),
    dateRangeDays,
    campaigns,
  };
}

/** 日予算を変更する。金額は円の整数(JPYは小数点のない通貨のためそのままでよい)。 */
export async function setCampaignDailyBudget(
  campaignId: string,
  dailyBudgetYen: number
): Promise<void> {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${campaignId}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      daily_budget: String(dailyBudgetYen),
      access_token: accessToken(),
    }),
  });
  if (!res.ok) {
    throw new Error(`daily_budget update failed: ${res.status} ${await res.text()}`);
  }
}

export async function pauseCampaign(campaignId: string): Promise<void> {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${campaignId}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      status: "PAUSED",
      access_token: accessToken(),
    }),
  });
  if (!res.ok) {
    throw new Error(`pause failed: ${res.status} ${await res.text()}`);
  }
}
