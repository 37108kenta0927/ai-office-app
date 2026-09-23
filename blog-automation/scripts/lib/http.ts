function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 共有レンタルサーバー(Xserver)への接続が数回に1回タイムアウトする現象が
 * 確認されているため、ネットワーク層のエラー(fetch failed/タイムアウト)は
 * 数回リトライする。相手先が返す4xx/5xxエラーはリトライしても
 * 無駄なので対象外(即座にthrowする)。
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempts = 3
): Promise<Response> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      if (attempt === attempts) throw err;
      const waitMs = attempt * 3000;
      console.warn(
        `[http] network error on attempt ${attempt}/${attempts} for ${url}, retrying in ${waitMs}ms...`,
        err
      );
      await sleep(waitMs);
    }
  }
  throw new Error("unreachable");
}
