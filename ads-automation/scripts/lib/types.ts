export type Objective = "acquisition" | "recruit";

export interface AccountConfig {
  id: string;
  label: string;
  adAccountId: string;
  objective: Objective;
  campaignNameContains?: string[];
  campaignIds?: string[];
  goal: string;
  targetPersona?: string;
  brandVoice: string;
}

export interface AgeBreakdown {
  age: string;
  impressions: number;
  spend: number;
}

export interface CampaignInsight {
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  results: number | null;
  costPerResult: number | null;
  resultType: string | null;
  ageBreakdown?: AgeBreakdown[];
}

export interface FetchedInsights {
  accountId: string;
  fetchedAt: string;
  dateRangeDays: number;
  campaigns: CampaignInsight[];
}

export type ActionType =
  | "pause_campaign"
  | "pause_ad"
  | "adjust_daily_budget"
  | "note_only";

export interface RecommendedAction {
  type: ActionType;
  targetId: string;
  targetName: string;
  detail: string;
  newDailyBudgetYen?: number;
  reason: string;
}

export interface Diagnosis {
  accountId: string;
  label: string;
  summary: string;
  findings: string[];
  recommendedActions: RecommendedAction[];
}
