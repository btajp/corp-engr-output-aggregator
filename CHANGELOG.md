# Changelog

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
