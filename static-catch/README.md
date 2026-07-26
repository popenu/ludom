# バチバチキャッチャー (Static Catch)

押し続けて静電気をチャージし、離した瞬間の静電吸着で降ってくる金属ゴミを引き寄せるアーケードゲーム。
チャージが溜まるほどキャラの髪が逆立ち、スパークが飛び散る。

- HTML5 / CSS3 / Vanilla JavaScript（Canvas 2D、外部物理エンジン不使用）
- ランキング：[Supabase](https://supabase.com/)（CDN経由の Supabase JS SDK）
- ホスティング：Cloudflare Workers（静的配信）

## 遊び方

- **画面をドラッグ**：左右移動（押している間はチャージも同時に進み、チャージが進むほど移動が遅くなる）
- **押し続ける（ホールド）**：静電気ゲージが0→100%まで上昇
- **指を離す**：離した瞬間のチャージ量に応じた範囲・威力で静電吸着パルスが発生し、範囲内の金属ゴミを引き寄せて得点化

### 落下物

| 種類 | 必要チャージ | 得点 | 備考 |
|---|---|---|---|
| 紙くず / 軽金属 | 10% | 10 | 軽くすぐ吸着できる |
| 空き缶 / スプーン | 50% | 30 | 標準サイズ |
| ドラム缶 / 鉄くず | 100% | 100 | フルチャージでないと吸着できない。吸着し損ねてプレイヤーに直撃すると**即ゲームオーバー** |
| 水滴 | 吸着不可 | - | 静電気が効かない（電気を通すため）。プレイヤーに触れるとチャージが即0に |

軽量・中量物を吸着し損ねて地面（プレイヤーの高さ）に届くと「ゴミ」としてカウントされ、規定数（8個）を超えるとゲームオーバー。

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
