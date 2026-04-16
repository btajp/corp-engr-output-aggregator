# corp-engr-output-aggregator

`slack-cli` で管理する Slack Platform app と Cloudflare Worker で、`#prj-output`
投稿を置き換えるためのリポジトリです。

## Current Scope

PR-1 では Slack app の骨格を用意します。

- `#prj-output` 用 Link Trigger
- submission 用 workflow / function / datastore
- runtime config の読み込み口
- GitHub Actions からの deploy workflow

PR-1 の function は config を検証し、Slack / Notion ともに `accepted` 状態の
初期 submission レコードを Datastore に保存するところまでを担当します。

## Required Environment Variables

ローカル開発では `.env` を使い、deployed app では `slack env set` を使います。

必須:

- `NOTION_TOKEN`
- `NOTION_DATABASE_ID`
- `OUTPUT_CHANNEL_ID`
- `ALERT_CHANNEL_ID`
- `DEFAULT_COVER_IMAGE_URL`

任意:

- `OGP_PROXY_URL`
- `OGP_PROXY_SHARED_SECRET_ACTIVE`
- `OGP_PROXY_SHARED_SECRET_NEXT`

`.env.example` をコピーして `.env` を作り、必要値を入れてください。

## Local Development

1. `slack auth list` で `corp-engr` workspace にログイン済みであることを確認する
2. `.env.example` を `.env` にコピーする
3. `slack run` でローカル app を起動する
4. 必要なら
   `slack trigger create --trigger-def src/triggers/submit_output_link_trigger.ts`
   で local trigger を作る
5. `deno task test` で fmt / lint / test をまとめて確認する

## Production Trigger Provisioning

production 用 Link Trigger は deploy 後に workspace ごとに作り直します。

1. `slack deploy`
2. `slack trigger create --trigger-def src/triggers/submit_output_link_trigger.ts`
3. 出力された Shortcut URL を `#prj-output` にメッセージまたは bookmark
   として追加する
4. trigger を作り直したら、古い URL を `#prj-output` から外して差し替える

## Deploy from GitHub Actions

GitHub Environment `production` に `SLACK_SERVICE_TOKEN` を入れます。

workflow は次を実行します。

1. Slack CLI をインストールする
2. `slack login --token "$SLACK_SERVICE_TOKEN"` で認証する
3. `slack deploy` を実行する

runtime secret は GitHub ではなく Slack 側に置きます。deploy 前後で
`slack env set` により managed env を同期し、trigger URL の差し替えが必要な
ときは `#prj-output` 側もあわせて更新します。
