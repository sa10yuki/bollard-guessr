# Roadside Guessr

ボラード・電柱・標識の写真を見て、それが使われている国・地域を地図からすべて選ぶクイズゲーム。GeoGuessr の練習用。

- トップでジャンル（ボラード・電柱・標識）を選んで遊ぶ。1セット5問
- 写真のものが使われている国・地域を**すべて**選ぶと正解（GeoGuessr で候補を絞れるように）
- 「似たものがある国」は選んでも減点なし
- 地域限定のものは、国が合っていれば正解。解説で地域も表示
- 標識は種類（シェブロン、一時停止、横断歩道、案内標識、裏面・支柱など）で出題と図鑑を絞り込める
- 間違えた問題はジャンルごとの復習モードで解き直せる（ブラウザの localStorage に保存）
- 図鑑: 国ごとに一覧表示。国名検索・大陸での絞り込み、写真をタップで解説。情報がない国も一覧で確認できる
- 小さな国・地域は地図上のマーカーか、国名検索（ひらがな・カタカナ・英語）で選べる
- スマホ対応

## 動かし方

```bash
npm install
npm run dev
```

## データ

画像と説明は [Plonk It](https://www.plonkit.net/guide)（© 2021-2026 Plonk It）のガイドから取得し、[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) のもとで使用している。画像はトリミング（地図部分を除去）し、説明は日本語に翻訳・要約した。この改変版も CC BY-NC-SA 4.0 で提供する（**非営利に限る**。広告や有料化はしない）。非公式のファンメイドツールで、Plonk It とは関係ない。国境データは [Natural Earth](https://www.naturalearthdata.com/)（パブリックドメイン）。

ライセンス: コードは [MIT](LICENSE)、データは [CC BY-NC-SA 4.0](LICENSE-DATA.md)。

公開版: https://sa10yuki.github.io/bollard-guessr/ （`main` に push すると GitHub Actions で自動デプロイ）

ジャンルは `scripts/categories.mjs` で定義している（Plonk It の項目の拾い方、標識の種類）。ファイルはジャンル（`bollard` / `pole` / `sign`）ごと。

| ファイル | 内容 |
| --- | --- |
| `data/raw/<ジャンル>.json` | Plonk It から抽出した候補の項目 |
| `data/curation/<ジャンル>.json` | 手作業のデータ: トリミング範囲、正解の国、地域、種類、日本語解説、除外理由 |
| `data/triage/`, `data/review/` | キュレーション作業の記録（下記のヘルパーの入力） |
| `public/data/<ジャンル>.json` | ゲームが読む出題データ（生成物） |
| `public/data/world.geojson` | 地図データ（生成物） |
| `public/images/<ジャンル>/*.webp` | トリミング済みの画像（生成物） |

### 更新手順

```bash
npm run data:update
```

中身は次の4ステップ。

1. `data:fetch`: Plonk It の各国ページを取得し、各ジャンルの候補を `data/raw/` に書き出す（ページは `.cache/pages` にキャッシュ。`--refresh` で再取得）
2. `data:images`: 元画像を `.cache/images` にダウンロード（取得済みと除外済みはスキップ。HTTP 429 のときは Retry-After に従って待つ。1時間に40〜50枚程度しか取れないので、大量に取るときは時間がかかる）
3. `data:geo`: Natural Earth から地図データを作る。アラスカ、ハワイ、アゾレス、マデイラ、レユニオン、マルティニーク、スヴァールバル、クリスマス島、ココス諸島は親の国から切り出して独立した地域にする
4. `data:build`: キュレーションに従って画像をトリミングし、出題データを作る

`data:build` は、キュレーションに載っていない新しい項目や、消えた項目があると一覧で警告する。画像の確認が済んだ項目（`crop` か `"checked": true` がある項目）だけが出題される。Plonk It の画像には答えがわかってしまう地図が入っていることが多いので、`crop` で切り落とす（書式は `scripts/build-data.mjs` 冒頭のコメント参照）。

キュレーション用のヘルパー:

- `node scripts/import-triage.mjs <ジャンル> <ファイル>`: 「番号|種類|必須の国|似ている国|地域|解説」形式の判定をまとめて取り込む
- `node scripts/apply-review.mjs <ジャンル> <ファイル>`: 「番号|トリミング範囲」形式の画像確認の結果をまとめて取り込む
