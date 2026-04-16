# corp-engr-output-aggregator

[![GitHub Tag](https://img.shields.io/github/v/tag/btajp/corp-engr-output-aggregator?sort=semver)](https://github.com/btajp/corp-engr-output-aggregator/tags)

[`情シスSlack`](https://corp-engr.jp) の `#prj-output` で共有されたアウトプットを、
Slack と Notion に揃えて残すための `slack-cli` 管理 Slack Platform app です。Slack 上の公開名は
`Output Aggregator V3` です。

## できること

1. `#prj-output` の Link Trigger から投稿フォームを開く
2. `title` `url` `comment` を受け取って Slack に投稿する
3. 同じ内容を Notion Database に保存する
4. 処理状態を Slack Datastore に記録する
5. 失敗時は alert channel に通知し、管理者が replay できる
6. 毎日 1 回、失敗サマリを alert channel に送る

## どういう構成か

この repo は Slack Platform を中心に組んでいます。入口、フォーム、Datastore、
workflow 実行は Slack 側で持ち、外向きの OGP 取得だけを Cloudflare Worker に
分離しています。

### Slack Platform

Slack 側では次の機能を使っています。

1. `Link Trigger`
   `#prj-output` にワークフローを追加して、参加者が見つけやすい入口にします。
2. `Workflow`
   フォームを開き、送信後に custom function を順に実行します。
3. `Custom Function`
   Slack 投稿、Notion 保存、失敗通知、daily summary 集計を実装します。
4. `Datastore`
   `submission_id` ごとに `accepted` `completed` `slack_failed`
   `notion_failed` `rolled_back` などの状態を残します。

Slack Platform の実装は [src/manifest.ts](src/manifest.ts)、
[src/workflows](src/workflows)、[src/functions](src/functions)、
[src/triggers](src/triggers) にあります。

### Notion API

Notion 側では既存 Database に対して page を作成します。使っている property は次です。

1. `Title`
2. `Date`
3. `SlackName`
4. `SlackTs`
5. `Description`
6. `URL`
7. `SlackUserID`

実装は [src/lib/notion.ts](src/lib/notion.ts) にあります。`429` と `5xx` は
`Retry-After` を見ながら 1 回だけ同期 retry します。

### Cloudflare Worker

OGP 画像の取得は [workers/ogp-proxy](workers/ogp-proxy) の Worker が担当します。
Slack app 側は `https://corp-engr.btajp.run/prj-output/ogp` だけを呼びます。

Worker 側では次を行います。

1. timestamp 付き HMAC でリクエストを認証する
2. `http/https` 以外、`localhost`、RFC1918、link-local などを拒否する
3. redirect 先にも同じ検査をかける
4. `og:image` が無い場合は `twitter:image` や icon link まで拾う

## 実装の見どころ

1. [src/functions/submit_output.ts](src/functions/submit_output.ts)
   投稿フロー本体。Slack 投稿、Notion 保存、Datastore 更新をまとめています。
2. [src/functions/replay_submission.ts](src/functions/replay_submission.ts)
   失敗レコードの replay と admin 制御です。
3. [src/functions/daily_failure_summary.ts](src/functions/daily_failure_summary.ts)
   Datastore を集計して daily summary を送ります。
4. [src/lib/cover-image.ts](src/lib/cover-image.ts)
   Slack app から Cloudflare OGP proxy を呼ぶ小さな client です。
5. [workers/ogp-proxy/src/index.ts](workers/ogp-proxy/src/index.ts)
   OGP proxy の本体です。

## 参加者向けメモ

`corp-engr` Slack の参加者は、`#prj-output` に追加されている
`Output Aggregator V3` を開くだけで使えます。投稿結果は Slack と Notion の
両方に残ります。

開発・deploy・runtime env のメモは [AGENTS.md](AGENTS.md) にあります。
