import { readFileSync } from "node:fs";
import path from "node:path";
import { TwitterApi } from "twitter-api-v2";
import { outputDir } from "./lib/config.js";

interface Announcement {
  title: string;
  link: string;
}

function client(): TwitterApi {
  const { X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET } = process.env;
  if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_SECRET) {
    throw new Error(
      "X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_SECRET must be set"
    );
  }
  return new TwitterApi({
    appKey: X_API_KEY,
    appSecret: X_API_SECRET,
    accessToken: X_ACCESS_TOKEN,
    accessSecret: X_ACCESS_SECRET,
  });
}

async function main() {
  const announcement = JSON.parse(
    readFileSync(path.join(outputDir(), "x-announce.json"), "utf-8")
  ) as Announcement;

  const text = `【新着ブログ】${announcement.title}\n${announcement.link}`;
  const twitter = client();
  await twitter.v2.tweet(text);
  console.log(`[post-to-x] posted: ${text}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
