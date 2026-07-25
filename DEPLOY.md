# 公開手順（Cloudflare Pages）

サイト名：**Ludom（ルドム）**

このリポジトリは **ビルド不要の静的サイト**（HTML/CSS/JS のみ）です。
ルートの `index.html` がゲーム一覧ポータル、各サブフォルダが個別ゲームです。

```
/                 ← 配信ルート（= サイトのトップ）
├── index.html    … ゲーム一覧ポータル
├── portal.css
├── fusion-drop/  … 核融合ドロップ      → https://サイト/fusion-drop/
├── panda-run/    … パンダ走            → https://サイト/panda-run/
└── swingby/      … スイングバイ…       → https://サイト/swingby/
```

---

## 0. 事前準備：GitHubにpush（推奨ルート）

まだリモートに上げていない場合：

```bash
git add .
git commit -m "Initial commit: game portal + 3 games"
git remote add origin https://github.com/<あなたのユーザー名>/<リポジトリ名>.git
git branch -M main
git push -u origin main
```

> `.gitignore` で `.DS_Store` や `.claude/` などは除外済みです。
> `git status` で、公開したくないファイルが含まれていないか一度確認してください。

---

## 1. Cloudflare Pages にデプロイ

### 方法A：GitHub連携（自動デプロイ・おすすめ）

1. Cloudflareダッシュボード → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
2. 上でpushしたリポジトリを選択
3. ビルド設定：
   - **Framework preset**: `None`
   - **Build command**: （空欄）
   - **Build output directory**: `/`
4. **Save and Deploy**
5. プロジェクト名を `ludom` にすれば `https://ludom.pages.dev` で公開されます
   （すでに他の人に使われている場合は `ludom-games` 等に調整してください）

以降、`main` ブランチに `git push` するだけで自動的に再デプロイされます。

### 方法B：フォルダを直接アップロード（Git不要）

1. **Workers & Pages** → **Create application** → **Pages** → **Upload assets**
2. このフォルダ一式（`index.html` などを含む）をアップロード
3. プロジェクト名に `ludom` を入力して **Deploy site**

### 方法C：Wrangler CLI

```bash
npm install -g wrangler
wrangler login
wrangler pages deploy . --project-name=ludom
```

---

## 2. 独自ドメインを割り当てる（任意・広告審査には推奨）

1. ドメインを取得（Cloudflare Registrar / お名前.com / ムームードメイン など）
2. Pagesプロジェクト → **Custom domains** → **Set up a custom domain**
3. 取得したドメインを入力し、案内どおりDNSを設定
   - Cloudflareでドメインを管理していれば自動でDNSが入ります

---

## 3. 公開後にやること（別途）

- **プライバシーポリシー / お問い合わせ** ページの用意（広告審査に必要）
- 広告（Google AdSense など）の申請・設置 … `index.html` の `.ad-slot` に貼るだけ
- アクセス解析（任意）

---

## 更新のしかた

- ファイルを編集 → `git add . && git commit -m "..." && git push`（方法Aなら自動反映）
- ローカル確認： このフォルダで `python3 -m http.server 8080` を起動し `http://localhost:8080/` を開く
