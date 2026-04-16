# Changelog

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
