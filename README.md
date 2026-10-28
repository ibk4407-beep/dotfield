# Dotfield

https://dotfield.ibk-44-07.workers.dev

PC 向けのドットアニメーション スクリーンセーバー。

## 機能

- 常駐ドットフィールド 187 シーン ＋ 自分の画像
  - Pictures: 読み込んだ画像を画面いっぱいのドットに変換（ドラッグ＆ドロップ・貼り付け・ファイル選択）。元の色 / パレット色を切り替え、組み上がり・呼吸・マウスで散る・音で脈打つ。画像はブラウザ内（localStorage）にだけ保存し、共有リンクには含めない
  - Objects: Torus / Knot / Möbius / Twist / Gyro / Coil / Blob / Shell / Orb / Chain / Borromean / Horn / Star / Wind / Slinky / Klein / Pearls / Ribbon / Ripple / Morph（陰影つきの 3D 立体をドットで描画）
  - Satin 2 種: Satin（WebGL のカラー描画）/ Satin Dots（同じ布をドットで）。低音で布のうねりが大きくなり、拍ごとに波が走る
  - Sound 9 種: Spectrum / Mirror / Scope / Ring / Donut / Waterfall / Horizon / Burst / Radial（音のスペクトラム・波形・拍から描く。未接続時は穏やかなダミー信号で動く）
  - Motion 30 種: 回転させず、仕組みそのものが動くシーン。反応拡散（Coral / Mitosis / Fingerprint）、波紋（Pond）、セル・オートマトン（Cyclic / Rule / Ant）、砂（Sand）、ゴルトンボード、結晶成長、育つ木（Sapling）、同期するホタル、渋滞（Traffic）、風になびく布（Curtain）、ソート・迷路・スライドパズルの実演、メタボール、ボロノイ、砂鉄、流線、遠景スクロール、心電図、潮、横断歩道、雷雨 ほか
  - Forms 40 種: Umbilic / Cyclide / Boy / Enneper / Helicat / トーラス結び目 / 超公式シェイプ ほか（Objects と同じ描画の曲面）
  - Orbits 19 種: Lorenz / Aizawa / Thomas などのストレンジアトラクタ、Hopf 束、Currents / Vortex / Swarm ほか（奥行きで陰影をつけた 3D 点群）
  - Lines 21 種: Spiro / Rose / Sunflower / Moiré / Pendulum / Ridges / Hilbert ほか（ドットで描く 2D 図形）
  - Op-art 21 種: Riley / Quasi / Contour / Tiles / Weave ほか（細かいピッチのハーフトーン）
  - Studio: Globe / Terrain / Galaxy / Silk / Rings / Moon / Aura / Helix / Harmono（3D に配置したドット、細かいピッチのハーフトーン、隠線処理）
  - Classic: Koi / Swell / Rain / Flow / Life ほか 16 種（各ドットはパレットの 4 色にスナップ、スプリングで反応）
- サウンド連動: PC の音（画面共有の「システムの音声も共有する」、Chrome / Edge）またはマイクを解析し、全シーンが音量で加速・低音で膨らみ・拍で脈打つ（強さ 弱 / 中 / 強）。音は外部に送らない。サブモニターの表示用ウィンドウにも解析結果を BroadcastChannel で配信
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
| M | サウンド連動 |
| F | 全画面 |
| Esc | パネルを閉じる |

## 構成

- `public/` 静的フロントエンド（ビルド不要の ES Modules）
  - `engine.js` ドット描画エンジン（トーンスナップ、スプリング、ハーフトーン / ディザ）
  - `objects.js` Objects シーン（パラメトリック曲面）
  - `audio.js` 音声の取得と解析（帯域・スペクトラム・波形・拍検出）
  - `picture.js` Pictures（画像の保存・ドット変換・描画）
  - `satin.js` Satin シーン（WebGL シェーダーと共通の高さ場）
  - `sound.js` Sound シーン
  - `motion.js` Motion シーン（シミュレーションと過程）
  - `gallery.js` Forms / Orbits / Lines / Op-art
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
