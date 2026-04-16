# corp-engr-output-aggregator

`#prj-output` に投稿される記事やメモを、Slack と Notion の両方に残すための
`slack-cli` 管理 Slack Platform app です。

いまの公開名は `Output Aggregator V3` で、`corp-engr` Slack の参加者が
チャンネル内から起動して使う前提で実装しています。

## 何ができるか

現在の実装範囲では、次の流れを 1 回の workflow で処理します。

1. `#prj-output` で Link Trigger からフォームを開く
2. `title` `url` `comment` を入力する
3. Slack に投稿する
4. 同じ内容を Notion Database に保存する
5. 処理状態を Slack Datastore に残す

OGP 用の Cloudflare Worker は別途追加予定で、現時点では default cover image を
使います。

## どう実装しているか

この repo は「Slack を入口と処理の中心に置き、Notion を保存先に使う」構成です。

### Slack Platform

Slack 側では、主に次の機能を使っています。

1. `Link Trigger` `#prj-output`
   に追加して、参加者が見つけやすい入口にしています。

2. `Workflow` フォームを開き、入力を custom function に渡します。

3. `Custom Function` Slack 投稿、Notion API 呼び出し、Datastore
   更新をまとめて実行します。

4. `Datastore` `submission_id` ごとに `accepted` `completed` `slack_failed`
   `notion_failed` などの状態を保持します。

`src/manifest.ts` に app の宣言があり、`src/workflows/` `src/functions/`
`src/triggers/` に Slack Platform の実装があります。

### Notion API

Notion 側では既存 Database をそのまま使い、次の property 名に合わせて page を
作成します。

1. `Title`
2. `Date`
3. `SlackName`
4. `SlackTs`
5. `Description`
6. `URL`
7. `SlackUserID`

実装は [src/lib/notion.ts](src/lib/notion.ts) にあり、Slack 投稿後の `ts` や
投稿者情報も保存します。

## なぜ Slack Platform を使うのか

今回は slash command や外部 Web app ではなく、Slack Platform の workflow
を中心にしています。

理由は次の 3 つです。

1. `#prj-output` の中で完結する 参加者はチャンネルからそのまま起動できます。

2. 入力フォームと実行権限を Slack 側で管理できる 独自 UI
   を別途ホストしなくて済みます。

3. Datastore と workflow を同じ文脈で扱える 部分失敗時の replay
   や状態追跡を組み込みやすくなります。

## 現在の状態

現在は PR-2 相当で、投稿 core を実装済みです。

- Link Trigger からフォームを開ける
- Slack 投稿と Notion 保存が動く
- Datastore に状態が残る
- OGP cover はまだ Cloudflare 連携前のため default image 固定

今後は replay / alert と Cloudflare OGP proxy を段階的に追加する予定です。

## Repo の見どころ

実装を追うなら、まずこのあたりを見るのが分かりやすいです。

1. [src/manifest.ts](src/manifest.ts) app 全体の宣言

2. [src/workflows/submit_output.ts](src/workflows/submit_output.ts)
   入力フォームと workflow 定義

3. [src/functions/submit_output.ts](src/functions/submit_output.ts) Slack
   投稿、Notion 保存、Datastore 更新の本体

4. [src/lib/notion.ts](src/lib/notion.ts) Notion API payload の組み立て

5. [src/lib/slack-message.ts](src/lib/slack-message.ts) Slack 投稿 block
   の組み立て

## 参加者向けメモ

`corp-engr` Slack の参加者として使うときは、`#prj-output` に追加されている
`Output Aggregator V3` を開けば投稿できます。

開発・deploy・runtime env などのメモは [AGENTS.md](AGENTS.md) にまとめています。
