# 広告自動化（美容サロン向け）

Meta広告（Facebook / Instagram）の「集客用」「求人用（ワンバイワン・ホライズン）」を
定期的に自動で数値取得 → Claudeが数値を要約・診断 → 改善アクションを提案し、
人間が確認してから実行するパイプライン。`blog-automation` と同じ思想（自動化するのは
下準備まで、実行は人間の確認を経てから）で作られている。

## 仕組み

1. `.github/workflows/ads-diagnose.yml` が週1回（月曜朝）起動し、アカウントごと
   （集客／求人・ワンバイワン／求人・ホライズン）に直近28日間の広告データを取得
2. Claudeがそのアカウントの目的・狙っているペルソナに沿って数値を診断し、
   「一時停止すべきキャンペーン」「日予算を変えるべきキャンペーン」などを提案
3. GitHub Issue（`ads-review` ラベル）でレビュー依頼を通知。数値の要約・キャンペーン別
   データ表・気づき・推奨アクションが日本語で記載される
4. 人間がIssueの内容を確認し、問題なければそのIssueに `おけ` とコメントする
5. `.github/workflows/ads-approve-apply.yml` が起動し、承認された範囲のアクション
   （一時停止・日予算変更）だけをMeta広告に反映してIssueをクローズする

**判断が難しい提案は「要確認」扱いになり、自動実行はされない。**
提案が実行されるのは、常に人間が `おけ` とコメントした後だけ。

## 求人広告の「応募の質」について（重要な前提）

Meta広告の数値（クリック数・応募数・応募単価など）だけでは、
「20代かどうか」はある程度わかっても、「カラーの技術に興味があるか」
「働き方の負担を気にしているか」といった中身までは判定できない。
そのため、このパイプラインの診断は「広告の数字」までしか見ておらず、
実際に応募してきた人がペルソナに合っているかどうかは含まれていない。

応募フォーム（Googleフォームなど）に一言二言、興味分野や希望条件を聞く質問を
足せるようになったら、そのデータも合わせて分析できるように拡張できる。
今回はまず「広告の数字だけの診断」から始める。

## 初回セットアップ

### 1. Meta側（ここが一番手間がかかる部分）

広告を自動で読み書きするには、Meta Business Manager（ビジネスマネージャ）で
「システムユーザー」という専用のアクセス用アカウントを作り、そこにアクセストークンを
発行してもらう必要がある。

1. [Meta Business Manager](https://business.facebook.com/) にログインする（普段広告を
   出稿しているアカウントで）
2. 左メニュー「ビジネス設定」→「ユーザー」→「システムユーザー」→「追加」
   - 名前は何でもよい（例: `ads-automation`）
   - 権限は「管理者」でよい
3. 作成したシステムユーザーに、対象の広告アカウント（集客用・求人用、複数あれば全部）への
   アクセス権を割り当てる（「アセットを追加」→広告アカウントを選択→「管理者権限」）
4. そのシステムユーザーの画面で「新しいトークンを生成」を押し、権限（スコープ）は
   `ads_read` と `ads_management` の両方にチェックを入れる
   - `ads_read` = 数値を読む、`ads_management` = 一時停止・予算変更を行う。
     数字を見るだけでよく、自動実行はさせたくない場合は `ads_read` だけでもよい
     （その場合、承認しても実際の反映は手動でAds Managerから行うことになる）
5. 発行されたトークン（長い英数字の文字列）を控える。これがGitHub Secretsに登録する
   `META_ACCESS_TOKEN` になる
   - このトークンは基本的に無期限（システムユーザートークン）だが、パスワードと同じくらい
     大事なものなので、メールやチャットにそのまま貼らず、GitHub Secretsにだけ入れること
6. 広告アカウントID（`act_1234567890` の `1234567890` の部分）を確認する。
   広告マネージャ →（左上のアカウント名をクリック）→「すべての広告アカウントを表示」で見える

### 2. GitHub Secrets（リポジトリ設定 > Secrets and variables > Actions）

| Secret名 | 用途 |
|---|---|
| `META_ACCESS_TOKEN` | 手順1で発行したシステムユーザートークン |
| `ANTHROPIC_API_KEY_ADS` | Claude API（診断の生成に使用） |

`GITHUB_TOKEN` はActionsが自動発行するため設定不要。

### 3. 設定ファイル

`config/accounts.yaml` を開き、3つのアカウント（`acquisition` / `recruit-onexone` /
`recruit-horizon`）それぞれについて:

- `adAccountId` を手順1-6で確認した広告アカウントIDに書き換える
  （集客用と求人用で広告アカウント自体が別なら、それぞれ正しいIDを入れる）
- `campaignNameContains` を実際のキャンペーン名の付け方に合わせて調整する
  （例えば求人系のキャンペーン名に必ず「採用」と入れているならそのままでよいし、
  そうでなければ実際の命名規則に合わせて書き換える）

## ローカルでの動作確認

```bash
cd ads-automation
npm install

export META_ACCESS_TOKEN=...
npx tsx scripts/fetch-insights.ts --account acquisition
# output/acquisition.json に取得結果が出力される

export ANTHROPIC_API_KEY=...
npx tsx scripts/generate-diagnosis.ts --account acquisition
# output/acquisition-diagnosis.json に診断結果が出力される。中身を確認する

export GITHUB_TOKEN=...
export GITHUB_REPOSITORY=37108kenta0927/ai-office-app
npx tsx scripts/notify-review.ts --account acquisition
# レビュー用Issueが作成される
```

## 未確定事項（実装時に要確認）

- 集客用アカウントで「新規来店」に一番近いコンバージョンイベントが何か
  （公式LINEでの相談開始／予約フォーム送信など、実際に設定されているイベント名を確認し、
  必要なら `scripts/lib/meta.ts` の `RESULT_ACTION_PRIORITY` にそのイベント名を追加する）
- 求人アカウントのキャンペーン名の命名規則（`campaignNameContains` の調整に必要）
- Graph APIのバージョン（`scripts/lib/meta.ts` の `GRAPH_API_VERSION`）は定期的に
  最新版へ更新が必要（Metaはおおむね2年で古いバージョンを廃止する）
