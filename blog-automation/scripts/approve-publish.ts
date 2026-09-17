import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadBrand, markTopicStatus, outputDir } from "./lib/config.js";
import { publishPost } from "./lib/wordpress.js";
import { octokit, parseMarker, repoContext } from "./lib/github.js";

function getArg(name: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1 || !process.argv[idx + 1]) {
    throw new Error(`missing required --${name} argument`);
  }
  return process.argv[idx + 1];
}

async function main() {
  const issueNumber = Number(getArg("issue"));
  const client = octokit();
  const { owner, repo } = repoContext();

  const { data: issue } = await client.issues.get({
    owner,
    repo,
    issue_number: issueNumber,
  });
  const marker = parseMarker(issue.body ?? "");
  const brand = loadBrand(marker.brandId);

  console.log(
    `[approve-publish] publishing WP post #${marker.wpPostId} for brand=${brand.id} ...`
  );
  const { link } = await publishPost(brand, marker.wpPostId);
  markTopicStatus(brand, marker.topicId, "published");

  mkdirSync(outputDir(), { recursive: true });
  writeFileSync(
    path.join(outputDir(), "x-announce.json"),
    JSON.stringify({ title: marker.title, link }, null, 2),
    "utf-8"
  );

  await client.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body: `✅ 公開しました: ${link}`,
  });
  await client.issues.update({
    owner,
    repo,
    issue_number: issueNumber,
    state: "closed",
  });

  console.log(`[approve-publish] published: ${link}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
