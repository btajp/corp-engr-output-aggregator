# Changelog

## 0.3.0

- 失敗アラートに投稿者メンション（`<@userId>`）を表示するよう変更
- validation error（URL invalid / title 空 / disallowed channel 等）も
  `submission_log` に `validation_failed` として記録し、`sendFailureAlert`
  / daily summary の両方に反映するよう変更
- `SUBMISSION_STATUS` に `validationFailed` を追加
- Daily failure summary の本文に `Validation失敗` カウント行を追加
- replay workflow の失敗アラートにも投稿者メンションを含めるよう変更

## 0.2.1

- 投稿フォームの URL field に `format: "url"` を指定し、Slack OpenForm 側で
  URL 形式の validation を走らせることで、投稿者本人に即フィードバック
  されるようにした

## 0.2.0

- Slack 投稿メッセージに OGP card を追加し、site name / title / description
  / cover image を表示するよう変更
- Cloudflare OGP proxy を拡張し、HTML fetch から `og:image` / `og:title` /
  `og:description` / `og:site_name` / `twitter:*` / icon fallback まで取得
  できるようにした
- `OGP_FETCH_TIMEOUT_MS` を `10000` に引き上げ、応答が遅い origin でも OGP
  取得が完走するようにした
- test-output channel 用 Link Trigger を追加し、workflow の `channelId`
  で `#prj-output` と `test-output` を切り替えて投稿できるようにした
- test-output への投稿時は Notion への保存を skip するよう変更
- replay workflow が元の `output_channel_id` を基点に OGP 再取得付きで
  実行されるよう変更
- `submission_log` datastore に `output_channel_id` を追加
- Slack postMessage 失敗時に `response_metadata.messages` を datastore の
  `error_message` と failure alert に含めるよう変更
- OGP proxy 呼び出しの skip / 非 ok / 例外経路を `console.warn` で可視化
  し、silent fallback を追跡できるようにした

## 0.1.3

- README 冒頭を `情シスSlack` 向けの表現に調整し、tag badge を追加
- GitHub の OGP 用画像 `assets/github-social-preview.png` を追加
- GitHub repository description を README 冒頭に寄せた内容へ更新

## 0.1.2

- Slack app 名を `Output Aggregator V3` に変更
- 投稿メッセージを V2 寄りの 2 カラム表示に戻し、一言コメントをコードブロック化
- 投稿URLだけ unfurl し、`過去の投稿はこちら` は button にして unfurl しないよう変更
- Slack 本番 runtime で `env` を正しく読むように修正し、送信後に落ちる不具合を修正

## 0.1.1

- 投稿メッセージに `過去の投稿はこちら` リンクを追加
- 公開 repo から外した `.slack/` runtime state をローカルで復元し、再 deploy
  できる状態に戻した

## 0.1.0

- `ALERT_CHANNEL_ID` に daily failure summary を送る workflow を追加
- public repo 向けに README を整理し、Slack Platform / Notion / Cloudflare の
  役割分担を追いやすくした

## 0.0.4

- Cloudflare OGP proxy を追加し、`corp-engr.btajp.run/prj-output/ogp` に deploy
  できる構成にした
- Slack app から固定ドメインの proxy を HMAC 付きで呼び、`og:image` /
  `twitter:image` / icon fallback を使えるようにした
- Cloudflare deploy workflow を追加し、公開 URL 向け route を定義した

## 0.0.3

- replay workflow と failure alert を追加
- `429` / `5xx` に対する Notion retry を追加
- replay 実行者を `REPLAY_ALLOWED_USER_IDS` で制限できるようにした

## 0.0.2

- フォーム送信から Slack 投稿、Notion 保存、Datastore 更新までの core
  フローを実装
- default cover 解決、Slack 投稿文面 builder、Notion API client、JST 時刻 helper
  を追加
- `completed` `slack_failed` `notion_failed` `rolled_back` を Datastore
  に残すように変更

## 0.0.1

- `slack-cli` で管理する Slack Platform app の土台を追加
- manifest、Link Trigger、workflow、submission datastore、config loader を追加
- Slack deploy 用 GitHub Actions workflow と trigger provisioning 手順を追加
- 入力 URL を `http` / `https` のみに制限
