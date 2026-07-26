# バチバチガード (Spark Guard)

川に鉄屑を落とさないように守るアーケードゲーム。押し続けて静電気をチャージし、離した瞬間の静電気の弾きで降ってくる鉄屑を吹き飛ばす。
プレイヤーは電気ナマズ。チャージが溜まるほどヒゲがバチバチと逆立ち、体が光る。

- HTML5 / CSS3 / Vanilla JavaScript（Canvas 2D、外部物理エンジン不使用）
- ランキング：[Supabase](https://supabase.com/)（CDN経由の Supabase JS SDK）
- ホスティング：Cloudflare Workers（静的配信）

## 遊び方

- **画面をドラッグ**：左右移動（押している間はチャージも同時に進み、チャージが進むほど移動が遅くなる）
- **押し続ける（ホールド）**：静電気ゲージが0→100%まで上昇
- **指を離す**：離した瞬間のチャージ量に応じた範囲・威力で放電パルスが発生し、範囲内の鉄屑を上向きに弾き飛ばして得点化（川に落とす前に守れ！）

### 落下物

| 種類 | 必要チャージ | 得点 | 備考 |
|---|---|---|---|
| 紙くず / 軽金属 | 10% | 10 | 軽くすぐ弾き飛ばせる |
| 空き缶 / スプーン | 50% | 30 | 標準サイズ |
| ドラム缶 / 鉄くず | 100% | 100 | フルチャージでないと弾き飛ばせない。弾き損ねてプレイヤーに直撃すると**即ゲームオーバー** |
| 電池 | 弾き不可（触れるだけ） | - | プレイヤーに触れるとチャージが即100%に。触れ損ねてもペナルティなし |

軽量・中量物を弾き損ねて川面（プレイヤーの高さ）に届くと鉄屑が川に落ちたとしてカウントされ、規定数（8個）を超えるとゲームオーバー。

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
テーブル名を `static_catch_scores` にしているのでスコアが混ざらない。

```sql
create table if not exists public.static_catch_scores (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 12),
  score integer not null check (score >= 0),
  created_at timestamptz not null default now()
);

create index if not exists static_catch_scores_score_desc_idx
  on public.static_catch_scores (score desc);

alter table public.static_catch_scores enable row level security;

create policy "Allow public read access"
  on public.static_catch_scores
  for select
  to anon
  using (true);

create policy "Allow public insert access"
  on public.static_catch_scores
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
