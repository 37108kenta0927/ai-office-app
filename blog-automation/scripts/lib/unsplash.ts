export interface UnsplashPhoto {
  imageUrl: string;
  filename: string;
  photographerName: string;
  photographerProfileUrl: string;
  downloadLocation: string;
}

function accessKey(): string {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) throw new Error("UNSPLASH_ACCESS_KEY is not set");
  return key;
}

interface UnsplashSearchResult {
  results: {
    id: string;
    urls: { regular: string };
    links: { download_location: string };
    user: { name: string; links: { html: string } };
  }[];
}

export async function searchPhoto(
  query: string
): Promise<UnsplashPhoto | null> {
  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", "landscape");
  url.searchParams.set("per_page", "1");

  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${accessKey()}` },
  });
  if (!res.ok) {
    throw new Error(`Unsplash search failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as UnsplashSearchResult;
  const photo = data.results[0];
  if (!photo) return null;

  return {
    imageUrl: photo.urls.regular,
    filename: `${photo.id}.jpg`,
    photographerName: photo.user.name,
    photographerProfileUrl: photo.user.links.html,
    downloadLocation: photo.links.download_location,
  };
}

/**
 * Unsplash APIの利用規約上、写真を実際に使用する際は
 * download_location エンドポイントを叩いて利用実績を通知する必要がある。
 */
export async function trackDownload(photo: UnsplashPhoto): Promise<void> {
  await fetch(photo.downloadLocation, {
    headers: { Authorization: `Client-ID ${accessKey()}` },
  });
}

export function attributionHtml(photo: UnsplashPhoto): string {
  return `<p style="font-size:12px;color:#888;">Photo by <a href="${photo.photographerProfileUrl}?utm_source=onexone_hair_blog&utm_medium=referral" target="_blank" rel="noopener">${photo.photographerName}</a> on <a href="https://unsplash.com/?utm_source=onexone_hair_blog&utm_medium=referral" target="_blank" rel="noopener">Unsplash</a></p>`;
}
