import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { BrandConfig, Topic } from "./types.js";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

export function loadBrand(brandId: string): BrandConfig {
  const file = yaml.load(
    readFileSync(path.join(ROOT, "config/brands.yaml"), "utf-8")
  ) as { brands: BrandConfig[] };
  const brand = file.brands.find((b) => b.id === brandId);
  if (!brand) {
    throw new Error(
      `brand "${brandId}" not found in config/brands.yaml (known: ${file.brands
        .map((b) => b.id)
        .join(", ")})`
    );
  }
  return brand;
}

function topicsPath(brand: BrandConfig): string {
  return path.join(ROOT, brand.topicsFile);
}

export function loadTopics(brand: BrandConfig): Topic[] {
  const raw = yaml.load(readFileSync(topicsPath(brand), "utf-8")) as {
    topics: Topic[];
  };
  return raw.topics;
}

export function pickNextTopic(brand: BrandConfig): Topic {
  const topics = loadTopics(brand);
  const pending = topics.filter((t) => t.status === "pending");
  if (pending.length === 0) {
    throw new Error(
      `no pending topics left for brand "${brand.id}" in ${brand.topicsFile} — add more topics`
    );
  }
  const currentMonth = new Date().getMonth() + 1;
  const seasonalMatch = pending.find(
    (t) => t.seasonal && t.month === currentMonth
  );
  return seasonalMatch ?? pending[0];
}

export function markTopicStatus(
  brand: BrandConfig,
  topicId: string,
  status: Topic["status"]
): void {
  const file = topicsPath(brand);
  const raw = yaml.load(readFileSync(file, "utf-8")) as { topics: Topic[] };
  const topic = raw.topics.find((t) => t.id === topicId);
  if (!topic) throw new Error(`topic "${topicId}" not found`);
  topic.status = status;
  writeFileSync(file, yaml.dump(raw), "utf-8");
}

function usedImagesPath(): string {
  return path.join(ROOT, "content/used-images.json");
}

/**
 * ブランド間・記事間でアイキャッチ画像が重複しないよう、
 * 過去に使用したUnsplash写真IDを記録・参照する。
 */
export function loadUsedImageIds(): Set<string> {
  try {
    const raw = readFileSync(usedImagesPath(), "utf-8");
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export function saveUsedImageIds(ids: Set<string>): void {
  writeFileSync(usedImagesPath(), JSON.stringify([...ids].sort(), null, 2), "utf-8");
}

export function outputDir(): string {
  return path.join(ROOT, "output");
}

export function outputFile(brandId: string): string {
  return path.join(outputDir(), `${brandId}.json`);
}
