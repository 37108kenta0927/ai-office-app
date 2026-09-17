# ブログ自動化（美容サロン向け）

複数ブランドのWordPressブログについて、記事の企画〜執筆〜SEO/AIOメタデータ付与〜下書き作成までをAIで自動化し、
公開は人間が内容を確認してから1コメントで行うパイプライン。

## 仕組み

1. `.github/workflows/generate-content.yml` が週2回（月・木）起動し、ブランドごとに次のトピックを選んで記事を生成
2. Claude APIで本文執筆 → SEO/AIOメタデータ生成 → 薬機法・景品表示法リスクの自己チェックを実施
3. WordPressに `status: draft` で投稿を作成
4. GitHub Issue（`blog-review` ラベル）でレビュー依頼を通知。リスクフラグがあれば明記される
5. 人間がWordPress編集画面で内容を確認し、問題なければそのIssueに `/publish` とコメント
6. `.github/workflows/approve-and-publish.yml` が起動し、WordPress記事を公開 → X（Twitter）に告知ポストを自動投稿 → Issueをクローズ

**全記事が人間の確認を経てから公開されます。** 自動化されるのは「下書きを作るところまで」です。

## 初回セットアップ

### 1. WordPress側
- 対象サイトで管理画面 > ユーザー > プロフィール から Application Passwords を発行し、`blog-automation` 用のパスワードを控える
- 使用しているSEOプラグイン（Yoast SEO / RankMath / AIOSEO等）を確認する。`scripts/lib/wordpress.ts` の `trySetSeoMeta` はベストエフォートで代表的なメタキーを送るが、プラグイン側で REST 経由の書き込みを許可する設定（`show_in_rest`）が必要な場合がある
- JSON-LD構造化データはカスタムメタ `blog_automation_json_ld` に保存される。テーマ側でこの値を `<head>` に出力するコードを追加すると、Article/FAQPageのリッチリザルト・AI検索エンジンからの引用対策になる（未実装・要対応）

### 2. GitHub Secrets（リポジトリ設定 > Secrets and variables > Actions）
| Secret名 | 用途 |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API |
| `WP_APP_PASSWORD_ONEXONE_HAIR` | onexone HAIR の Application Password |
| `X_API_KEY` / `X_API_SECRET` / `X_ACCESS_TOKEN` / `X_ACCESS_SECRET` | X (Twitter) API v2 |

`GITHUB_TOKEN` はActionsが自動発行するため設定不要。

### 3. 設定ファイル
- `config/brands.yaml` の `siteUrl` を実際のWordPressサイトURLに書き換える
- `content/topics/<brand>.yaml` にネタを追加していく（尽きると生成が失敗するので定期的に補充する）

### 4. ブランドを増やす
1. `config/brands.yaml` に新ブランドのエントリを追加
2. `content/topics/<新ブランドid>.yaml` を作成
3. `.github/workflows/generate-content.yml` の `matrix.brand` に追加し、対応する `WP_APP_PASSWORD_<ID>` の env 行を追加
4. `.github/workflows/approve-and-publish.yml` にも同様に `WP_APP_PASSWORD_<ID>` の env 行を追加

## ローカルでの動作確認

```bash
cd blog-automation
npm install
export ANTHROPIC_API_KEY=...
npx tsx scripts/generate-post.ts --brand onexone-hair
# output/onexone-hair.json に生成結果が出力される。中身（本文・SEOメタ・riskFlags）を確認する

export WP_APP_PASSWORD_ONEXONE_HAIR=...
npx tsx scripts/publish-wordpress.ts --brand onexone-hair
# WordPressに下書きが作成され、output/onexone-hair.json が更新される

export GITHUB_TOKEN=...
export GITHUB_REPOSITORY=37108kenta0927/ai-office-app
npx tsx scripts/notify-review.ts --brand onexone-hair
# レビュー用Issueが作成される
```

## 未確定事項（実装時に要確認）
- 対象WordPressサイトのSEOプラグイン種別とREST APIでのメタ書き込み可否
- Application Passwords機能が有効になっているか
- X APIの利用プラン（投稿数上限が頻度設計に影響する）
