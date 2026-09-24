# 部首あわせ (Bushu Awase)

「日」と「月」をくっつけて「明」。6つの部品から2つを選んでくっつけ、漢字を作る60秒タイムアタック。
できた漢字の読みも表示されるので、遊びながら覚えられる。

- HTML5 / CSS3 / Vanilla JavaScript（ライブラリ・バックエンドなし）
- 自己ベストは `localStorage` に保存。それ以外は何も送信しない
- ホスティング：Cloudflare Workers（静的配信）

## 遊び方

- 部品の札を2つタップ。順番はどちらからでもよい（PC は 1〜6 キー）
- 漢字になれば +1。1セット（6部品）で漢字は3つ。3つ作ると次のセット
- くっつかない組み合わせは札が震えてやり直し
- 制限時間 60秒。分からないセットは「パス」で飛ばせる（−5秒）

## データ（`data.js`）

`[漢字, 部品A, 部品B, 読み]` の配列で約700字。

- 部品は2つとも単独で表示できる文字に限る（にんべん「亻」、さんずい「氵」などの部首の変形を含む）
- **同じ2部品の組み合わせが別の漢字にもなるものは入れない**。例：口＋十 は「古」と「叶」の両方になるので「古」だけ
- 出題セットは、6部品の中の意図しない2部品が収録漢字にならないことを確認してから出す（`makeSet`）
- 同じ漢字は1回のプレイ中に重複して出さない

データを増やすときは、末尾の重複チェックを Node で回すとよい。

```bash
node -e 'require("./data.js"); const D=globalThis.BUSHU_DATA; const k=(a,b)=>a<b?a+"|"+b:b+"|"+a; const s=new Map(); for(const [x,a,b] of D){ const kk=k(a,b); if(s.has(kk)) console.log("dup pair:", s.get(kk), x); s.set(kk,x);} console.log(D.length)'
```

## ファイル構成

```
index.html   ... HTML構造・UI
style.css    ... 藍色の地に和紙の札、明朝体
data.js      ... 漢字データ
script.js    ... セット生成・判定・タイマー・結果
README.md    ... このファイル
```

## ローカルでの動作確認

```bash
python3 -m http.server 8080
```

`http://localhost:8080/bushu-awase/` を開く。

## デプロイ

リポジトリルートの [DEPLOY.md](../DEPLOY.md) を参照。
