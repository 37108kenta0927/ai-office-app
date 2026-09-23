import { readdirSync } from "node:fs";
import path from "node:path";
import type { BrandConfig } from "./types.js";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

const EXT_CONTENT_TYPE: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export interface LocalImage {
  key: string;
  filePath: string;
  filename: string;
  contentType: string;
}

function imagesDir(brand: BrandConfig): string {
  return path.join(ROOT, "content/images", brand.id);
}

/**
 * content/images/<brandId>/ に置かれた画像からランダムに1枚選ぶ。
 * 未使用の画像を優先し、全て使用済みなら使い回す(在庫切れで
 * Unsplashにフォールバックしてしまわないようにするため)。
 * フォルダが存在しない・画像が1枚もない場合はnullを返し、
 * 呼び出し側でUnsplash検索にフォールバックする。
 */
export function pickLocalImage(
  brand: BrandConfig,
  excludeKeys: ReadonlySet<string>
): LocalImage | null {
  let files: string[];
  try {
    files = readdirSync(imagesDir(brand));
  } catch {
    return null;
  }

  const candidates: LocalImage[] = files
    .filter((f) => EXT_CONTENT_TYPE[path.extname(f).toLowerCase()])
    .map((f) => ({
      key: `local:${brand.id}/${f}`,
      filePath: path.join(imagesDir(brand), f),
      filename: f,
      contentType: EXT_CONTENT_TYPE[path.extname(f).toLowerCase()],
    }));
  if (candidates.length === 0) return null;

  const unused = candidates.filter((c) => !excludeKeys.has(c.key));
  const pool = unused.length > 0 ? unused : candidates;
  return pool[Math.floor(Math.random() * pool.length)];
}
