# Dotfield

https://dotfield.ibk-44-07.workers.dev

PC 向けのドットアニメーション スクリーンセーバー。

## 機能

- 常駐ドットフィールド（16 シーン）。各ドットはパレットの 4 色にスナップし、サイズはイージング、カーソルとクリックにはスプリングで反応
- レンダリング: ハーフトーン（サイズ）/ ディザ（1-bit）、円 / 四角
- ライト / ダーク（黒ベースの Liquid Glass）/ 自動
- スクリーンセーバー（時計: Dot / Segment / Analog / Binary / Date）、無操作時の自動起動
- サブモニター: ディスプレイ検出（Window Management API）→ 指定画面で全画面開始 / 表示用ウィンドウ（常時表示、設定は BroadcastChannel で同期）、画面スリープ防止、焼き付き防止、省電力 30fps
- AI パターン生成（Workers AI `gpt-oss-120b`）: キーワードからドットパターンの式そのものを生成。サンドボックス化された式言語（`public/formula.js`）で検証し、不合格なら理由を返して再生成
- 設定の共有リンク（Workers KV、AI パターンの式も含む）

## ショートカット

| キー | 動作 |
| --- | --- |
| Space | スクリーンセーバー開始 |
| ← / → , 1–9 | シーン切替 |
| T | ライト / ダーク |
| C | 時計スタイル |
| S / A / D | 設定 / AI / ディスプレイ |
| F | 全画面 |
| Esc | パネルを閉じる |

## 構成

- `public/` 静的フロントエンド（ビルド不要の ES Modules）
  - `engine.js` ドット描画エンジン（トーンスナップ、スプリング、ハーフトーン / ディザ）
  - `scenes.js` 各シーン
  - `formula.js` パターン式の言語（パーサー、コンパイラー、検証）
  - `clock.js` 時計フェイス
  - `app.js` UI とアプリの状態
- `src/index.js` Cloudflare Worker（静的アセット配信 + API）
  - `POST /api/theme` Workers AI でパターン式と配色を生成
  - `POST /api/presets` / `GET /api/presets/:id` 共有設定の保存・取得（KV）

## 開発

```bash
npm install
npm run dev
npm run deploy
```

`wrangler.jsonc` の KV namespace ID は自分のアカウントのものに置き換えてください（`npx wrangler kv namespace create dotfield-presets`）。
