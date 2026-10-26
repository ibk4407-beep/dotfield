# Dotfield

https://dotfield.ibk-44-07.workers.dev

PC 向けのドットアニメーション スクリーンセーバー。

## 機能

- 常駐ドットフィールド背景（Koi / Wave / Rain / Flow / Life）とカーソル・クリックへの反応
- スクリーンセーバーモード（ドット時計、全画面、マウス / キー操作で解除）
- 無操作時の自動起動（1 / 3 / 5 / 10 分）
- パレット、ドットサイズ、速度、形状の設定（ブラウザに保存）
- AI テーマ生成（Workers AI）
- 設定の共有リンク（Workers KV）

## ショートカット

| キー | 動作 |
| --- | --- |
| Space | スクリーンセーバー開始 |
| F | 全画面 |
| 1–5 | シーン切替 |
| S / A | 設定 / AI パネル |
| Esc | パネルを閉じる |

## 構成

- `public/` 静的フロントエンド（ビルド不要の ES Modules）
  - `engine.js` ドット描画エンジン
  - `scenes.js` 各シーン
  - `app.js` UI とアプリの状態
- `src/index.js` Cloudflare Worker（静的アセット配信 + API）
  - `POST /api/theme` Workers AI でテーマ生成
  - `POST /api/presets` / `GET /api/presets/:id` 共有設定の保存・取得（KV）

## 開発

```bash
npm install
npm run dev
npm run deploy
```

`wrangler.jsonc` の KV namespace ID は自分のアカウントのものに置き換えてください（`npx wrangler kv namespace create dotfield-presets`）。
