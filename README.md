# Dotfield

https://dotfield.ibk-44-07.workers.dev

PC 向けのドットアニメーション スクリーンセーバー。

## 機能

- 常駐ドットフィールド 45 シーン
  - Objects: Torus / Knot / Möbius / Twist / Gyro / Coil / Blob / Shell / Orb / Chain / Borromean / Horn / Star / Wind / Slinky / Klein / Pearls / Ribbon / Ripple / Morph（陰影つきの 3D 立体をドットで描画）
  - Studio: Globe / Terrain / Galaxy / Silk / Rings / Moon / Aura / Helix / Harmono（3D に配置したドット、細かいピッチのハーフトーン、隠線処理）
  - Classic: Koi / Swell / Rain / Flow / Life ほか 16 種（各ドットはパレットの 4 色にスナップ、スプリングで反応）
- レンダリング: ハーフトーン（サイズ）/ ディザ（1-bit）、円 / 四角
- ライト / ダーク（黒ベースの Liquid Glass）/ 自動
- スクリーンセーバー（時計 15 種: Light / Orbit / Dot / Serif / Grotesk / Mono / Condensed / Segment / Analog / Railway / Ring / Word / Progress / Binary / Date）。細かいドットで描画し、位置（左下・中央・右下）とサイズ（S/M/L）を選択可能、無操作時の自動起動
- サブモニター: ディスプレイ検出（Window Management API）→ 指定画面で全画面開始 / 表示用ウィンドウ（常時表示、設定は BroadcastChannel で同期）、画面スリープ防止、焼き付き防止、省電力 30fps
- AI パターン生成（Workers AI `gpt-oss-120b`）: キーワードからドットパターンの式と、描く面（平面 / 球体 / 地形）を生成。3 案を並列に作り、サンドボックス化された式言語（`public/formula.js`）で検証・採点（埋まり具合・構造・ちらつき）して最良案を採用
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
  - `objects.js` Objects シーン（パラメトリック曲面）
  - `scenes3d.js` Studio シーン（3D・自由配置のドット）
  - `scenes.js` Classic シーン
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
