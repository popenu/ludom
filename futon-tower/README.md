# 布団タワー (Futon Tower)

左右に揺れるドロッパーからタイミングよく布団を落とし、崩さずにどこまで高く積み上げられるかを競う物理タワーゲーム。
高く積むほど背景が和室→屋根の上→雲の上→宇宙と変化していく。

- HTML5 / CSS3 / Vanilla JavaScript（Matter.js による物理演算）
- ランキング：[Supabase](https://supabase.com/)（CDN経由の Supabase JS SDK）
- ホスティング：Cloudflare Workers（静的配信）

## 遊び方

- **画面をタップ**：現在ドロッパーの位置にある布団が真下に落下する
- 布団は種類ごとに手触り（摩擦・反発）が違う：

| 種類 | 特徴 |
|---|---|
| ふつうの敷布団 | 標準的な重さ・摩擦。安定したベース |
| ふかふか羽毛布団 | 厚みがあり、乗せるとクッションのように沈み込む。着地の「ぎゅっ」が一番大きい |
| ツルツル絹布団 | 摩擦が極めて低く、上に乗せた布団がツルッと滑り落ちやすい危険な布団 |
| せんべい布団 | 薄くて硬い。高さは稼ぎにくいが安定しやすい |

- 布団が床や画面の左右範囲外まで滑り落ちて落下すると「ミス」が1つ増える。3回落とすとゲームオーバー
- 積み上げた枚数と、これまでに到達した最高高度（m）を表示

## ローカルでの動作確認

```bash
python3 -m http.server 8080
```

`http://localhost:8080` を開く。Supabase未設定でもゲーム自体は遊べる（ランキングの送信・取得のみ失敗し、その旨がUIに表示される）。

---

## 1. Supabase セットアップ

### 1-1. テーブル作成用SQL

Supabaseダッシュボードの `SQL Editor` で以下を実行する。
他のゲーム（核融合ドロップ等）と同じSupabaseプロジェクトを共有する場合でも、
テーブル名を `futon_tower_scores` にしているのでスコアが混ざらない。
スコアは到達高度(m)を10倍した整数値（例：8.5m→85）で保存している。

```sql
create table if not exists public.futon_tower_scores (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 12),
  score integer not null check (score >= 0),
  created_at timestamptz not null default now()
);

create index if not exists futon_tower_scores_score_desc_idx
  on public.futon_tower_scores (score desc);

alter table public.futon_tower_scores enable row level security;

create policy "Allow public read access"
  on public.futon_tower_scores
  for select
  to anon
  using (true);

create policy "Allow public insert access"
  on public.futon_tower_scores
  for insert
  to anon
  with check (
    char_length(name) between 1 and 12
    and score >= 0
  );
```

### 1-2. APIキーの設定

`script.js` 冒頭の定数を実際の値に置き換える。

```js
const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
const SUPABASE_ANON_KEY = "YOUR-SUPABASE-ANON-KEY";
```

## 2. デプロイ

リポジトリルートの [DEPLOY.md](../DEPLOY.md) を参照（Cloudflare Workers/Pagesへの公開手順は全ゲーム共通）。
