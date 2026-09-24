import { readFileSync, writeFileSync } from "node:fs";
import { loadAccount, outputFile } from "./lib/config.js";
import { generateDiagnosis } from "./lib/anthropic.js";
import type { FetchedInsights } from "./lib/types.js";

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
  const insights = JSON.parse(readFileSync(outputFile(accountId), "utf-8")) as FetchedInsights;

  console.log(`[generate-diagnosis] asking Claude to diagnose ${account.label} ...`);
  const diagnosis = await generateDiagnosis(account, insights);

  writeFileSync(
    outputFile(`${accountId}-diagnosis`),
    JSON.stringify({ diagnosis, insights }, null, 2),
    "utf-8"
  );
  console.log(
    `[generate-diagnosis] done — ${diagnosis.recommendedActions.length} action(s) proposed`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
