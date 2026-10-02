function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 共有レンタルサーバー(Xserver)への接続が数回に1回タイムアウトする現象が
 * 確認されている(onexone-hair/horizon-hair双方で発生実績あり)。
 * 接続不能の時間帯が30秒前後続くケースが観測されているため、
 * 3回程度のリトライでは間に合わないことがある。相手先が返す4xx/5xx
 * エラーはリトライしても無駄なので対象外(即座にthrowする)。
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempts = 5
): Promise<Response> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      if (attempt === attempts) throw err;
      const waitMs = Math.min(attempt * 5000, 20000);
      console.warn(
        `[http] network error on attempt ${attempt}/${attempts} for ${url}, retrying in ${waitMs}ms...`,
        err
      );
      await sleep(waitMs);
    }
  }
  throw new Error("unreachable");
}
