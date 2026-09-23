import { mkdirSync, writeFileSync } from "node:fs";
import { loadAccount, outputDir, outputFile } from "./lib/config.js";
import { fetchCampaignInsights } from "./lib/meta.js";

function getArg(name: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1 || !process.argv[idx + 1]) {
    throw new Error(`missing required --${name} argument`);
  }
  return process.argv[idx + 1];
}

async function main() {
  const accountId = getArg("account");
  const account = loadAccount(accountId);

  console.log(`[fetch-insights] fetching Meta insights for ${account.label} ...`);
  const insights = await fetchCampaignInsights(account);

  mkdirSync(outputDir(), { recursive: true });
  writeFileSync(outputFile(accountId), JSON.stringify(insights, null, 2), "utf-8");
  console.log(`[fetch-insights] saved ${insights.campaigns.length} campaign(s)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
