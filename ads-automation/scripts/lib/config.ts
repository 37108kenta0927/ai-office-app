import { readFileSync } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { AccountConfig } from "./types.js";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

function loadAllAccounts(): AccountConfig[] {
  const file = yaml.load(
    readFileSync(path.join(ROOT, "config/accounts.yaml"), "utf-8")
  ) as { accounts: AccountConfig[] };
  return file.accounts;
}

export function loadAccount(accountId: string): AccountConfig {
  const account = loadAllAccounts().find((a) => a.id === accountId);
  if (!account) {
    throw new Error(
      `account "${accountId}" not found in config/accounts.yaml (known: ${loadAllAccounts()
        .map((a) => a.id)
        .join(", ")})`
    );
  }
  return account;
}

export function outputDir(): string {
  return path.join(ROOT, "output");
}

export function outputFile(name: string): string {
  return path.join(outputDir(), `${name}.json`);
}
