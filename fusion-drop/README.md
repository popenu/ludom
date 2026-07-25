# 核融合ドロップ (Fusion Drop)

水素から始まり、鉄、そして超新星爆発へ——恒星の一生を、指先で体験するドロップパズル。
同じ元素を落として合体させ、水素(H)から鉄(Fe)まで進化させる2D物理パズルゲーム。
鉄同士が合体すると超新星爆発が発生し、跡地にブラックホールが出現して周囲の元素を数個吸い込む。

**元素の進化（全9段階）**：恒星内元素合成（超新星に至る核融合過程）に沿って質量数順に並べている。
H（水素）→ He（ヘリウム）→ C（炭素）→ O（酸素）→ Ne（ネオン）→ Mg（マグネシウム）→ Si（ケイ素）→ S（硫黄）→ Fe（鉄）

**ブラックホール**：Fe同士の合体で発生。合体した2つのFeに **触れていた元素だけ** を対象に、少し間を置いてから中心へゆっくり吸い込む（吸い込み中の元素は他の元素をすり抜ける）。対象をすべて吸い込むと消滅する。中心の数字は残りの吸収対象数。触れていた元素が無い場合は演出だけ短く表示して消える。

- HTML5 / CSS3 / Vanilla JavaScript
- 物理演算：[Matter.js](https://brm.io/matter-js/)（CDN経由）
- ランキング：[Supabase](https://supabase.com/)（CDN経由の Supabase JS SDK）
- ホスティング：Cloudflare Pages（静的配信）

## ファイル構成

```
index.html   ... HTML構造・CDN読み込み・UI
style.css    ... 宇宙・科学テーマのダークUIデザイン
script.js    ... 物理演算・ゲームロジック・Supabase連携
README.md    ... このファイル
```

## ローカルでの動作確認

静的ファイルのみなので、任意の簡易HTTPサーバーで確認できる。

```bash
python3 -m http.server 8080
```

ブラウザで `http://localhost:8080` を開く。

Supabase未設定の状態でもゲーム自体は問題なく遊べる（ランキングの送信・取得のみ失敗し、その旨がUIに表示される）。

---

## 1. Supabase セットアップ

### 1-1. テーブル作成用SQL

Supabaseダッシュボードの `SQL Editor` で以下を実行する。

```sql
-- スコア保存用テーブル
create table if not exists public.scores (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 12),
  score integer not null check (score >= 0),
  created_at timestamptz not null default now()
);

-- ランキング取得を高速化するインデックス
create index if not exists scores_score_desc_idx
  on public.scores (score desc);

-- Row Level Security を有効化
alter table public.scores enable row level security;

-- 匿名ユーザーによる読み取り（ランキング表示）を許可
create policy "Allow public read access"
  on public.scores
  for select
  to anon
  using (true);

-- 匿名ユーザーによる登録（スコア送信）を許可
create policy "Allow public insert access"
  on public.scores
  for insert
  to anon
  with check (
    char_length(name) between 1 and 12
    and score >= 0
  );
```

> 不正なスコア送信を厳密に防ぎたい場合は、Supabase Edge Functions 等でサーバーサイド検証を挟む構成に変更することを推奨する。本プロトタイプではクライアントから直接 `insert` する簡易構成。

### 1-2. APIキーの設定

Supabaseダッシュボード → `Project Settings` → `API` から以下を取得し、`script.js` 冒頭の定数を置き換える。

```js
const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
const SUPABASE_ANON_KEY = "YOUR-SUPABASE-ANON-KEY";
```

- `SUPABASE_URL`：`Project URL`
- `SUPABASE_ANON_KEY`：`anon` `public` キー（`service_role` キーは絶対に使用しないこと）

---

## 2. Cloudflare Pages へのデプロイ

### 2-1. ダッシュボードから直接デプロイする場合

1. Cloudflareダッシュボード → `Workers & Pages` → `Create application` → `Pages` → `Upload assets`
2. `index.html` / `style.css` / `script.js` を含むフォルダをアップロード
3. プロジェクト名を入力し `Deploy site`
4. 発行された `*.pages.dev` のURLで公開される

### 2-2. GitHub連携でデプロイする場合（推奨・継続的デプロイ）

1. 本フォルダをGitHubリポジトリにpush
   ```bash
   git init
   git add index.html style.css script.js README.md
   git commit -m "Initial commit: Fusion Drop prototype"
   git branch -M main
   git remote add origin <あなたのリポジトリURL>
   git push -u origin main
   ```
2. Cloudflareダッシュボード → `Workers & Pages` → `Create application` → `Pages` → `Connect to Git`
3. 対象リポジトリを選択
4. ビルド設定：
   - **Framework preset**: `None`
   - **Build command**: （空欄のまま）
   - **Build output directory**: `/`
5. `Save and Deploy`

以降、`main` ブランチへのpushで自動的に再デプロイされる。

### 2-3. Wrangler CLI でデプロイする場合

```bash
npm install -g wrangler
wrangler login
wrangler pages deploy . --project-name=fusion-drop
```

---

## 3. 今後の拡張候補

- サウンド・BGM（合体音、爆発音）の追加
- コンボ倍率によるスコアリング強化
- モバイル向けの操作性チューニング（キャンバスDPI対応）
- 不正スコア対策（Supabase Edge Functionsでのサーバーサイド検証）
- Supabase Realtimeを使ったランキングのリアルタイム更新
