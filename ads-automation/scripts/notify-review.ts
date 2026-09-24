import { readFileSync } from "node:fs";
import { outputFile } from "./lib/config.js";
import { createDiagnosisIssue } from "./lib/github.js";
import type { Diagnosis, FetchedInsights } from "./lib/types.js";

function getArg(name: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1 || !process.argv[idx + 1]) {
    throw new Error(`missing required --${name} argument`);
  }
  return process.argv[idx + 1];
}

async function main() {
  const accountId = getArg("account");
  const { diagnosis, insights } = JSON.parse(
    readFileSync(outputFile(`${accountId}-diagnosis`), "utf-8")
  ) as { diagnosis: Diagnosis; insights: FetchedInsights };

  console.log(`[notify-review] creating GitHub Issue for ${diagnosis.label} ...`);
  await createDiagnosisIssue(diagnosis, insights);
  console.log("[notify-review] done — waiting for human review (おけ comment)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
