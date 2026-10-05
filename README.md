# Bollard Guessr

ボラード（道路脇の反射ポール）の写真を見て、そのボラードが使われている国・地域を地図からすべて選ぶクイズゲーム。GeoGuessr の練習用。

- 1セット5問
- 写真のボラードが使われている国・地域を**すべて**選ぶと正解（GeoGuessr で候補を絞れるように）
- 「似たものがある国」は選んでも減点なし
- 地域限定のボラードは、国が合っていれば正解。解説で地域も表示
- 間違えた問題は復習モードで解き直せる（ブラウザの localStorage に保存）
- 小さな国・地域は地図上のマーカーか、国名検索（ひらがな・カタカナ・英語）で選べる
- スマホ対応

## 動かし方

```bash
npm install
npm run dev
```

## データ

ボラードの画像と説明は [Plonk It](https://www.plonkit.net/guide) のガイドから取得している。Plonk It のコンテンツなので、**個人利用の範囲で使う**こと（一般公開する場合は Plonk It の許可を取る）。国境データは [Natural Earth](https://www.naturalearthdata.com/)（パブリックドメイン）。

| ファイル | 内容 |
| --- | --- |
| `data/raw-bollards.json` | Plonk It から抽出した、`bollard` タグ付きの全項目 |
| `data/curation.json` | 手作業のデータ: トリミング範囲、正解の国、日本語解説、除外理由 |
| `public/data/bollards.json` | ゲームが読む出題データ（生成物） |
| `public/data/world.geojson` | 地図データ（生成物） |
| `public/bollards/*.webp` | トリミング済みの画像（生成物） |

### 更新手順

```bash
npm run data:update
```

中身は次の4ステップ。

1. `data:fetch`: Plonk It の各国ページを取得し、`bollard` タグの項目を `data/raw-bollards.json` に書き出す（ページは `.cache/pages` にキャッシュ。`--refresh` で再取得）
2. `data:images`: 元画像を `.cache/images` にダウンロード（取得済みはスキップ。HTTP 429 のときは Retry-After に従って待つ）
3. `data:geo`: Natural Earth から地図データを作る。アラスカ、ハワイ、アゾレス、マデイラ、レユニオン、マルティニーク、スヴァールバル、クリスマス島、ココス諸島は親の国から切り出して独立した地域にする
4. `data:build`: `curation.json` に従って画像をトリミングし、出題データを作る

`data:build` は、`curation.json` に載っていない新しい項目や、消えた項目があると一覧で警告する。新しい項目は `.cache/images` の元画像を見て `curation.json` にエントリを追加する（書式は `scripts/build-data.mjs` 冒頭のコメント参照）。Plonk It の画像には、答えがわかってしまう地図が入っていることが多いので、`crop` で切り落とす。
