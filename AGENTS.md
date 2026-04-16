# AGENTS.md

この repo の開発・運用メモです。README は利用者と見学者向けに保ち、こちらに
実装者向けの手順を寄せます。

## 開発メモ

1. local 開発では `.env` を使う
2. deployed app では `slack env set` を使う
3. テストは `deno lint` と `deno test --allow-env`
4. trigger の更新後は `#prj-output` 側の URL 差し替えも必要

## 必須 env

- `NOTION_TOKEN`
- `NOTION_DATABASE_ID`
- `OUTPUT_CHANNEL_ID`
- `ALERT_CHANNEL_ID`
- `DEFAULT_COVER_IMAGE_URL`

## 任意 env

- `OGP_PROXY_URL`
- `OGP_PROXY_SHARED_SECRET_ACTIVE`
- `OGP_PROXY_SHARED_SECRET_NEXT`

## deploy メモ

1. `slack deploy`
2. 必要なら `slack trigger update` または `slack trigger create`
3. production の workflow 導線を `#prj-output` へ反映
