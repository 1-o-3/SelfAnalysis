# SelfAnalysis (AIレポート生成スタンド)

Google Apps Script (GAS) で運用されていた「AIレポート生成スタンド」を、Cloudflare Pages および Vercel 等で安全に公開・共有できるように移植したスタンドアロン版Webアプリケーションです。

---

## 🌟 主な特徴

- **共有時の権限エラーなし**: Googleアカウントへのログインや認可の制限を受けず、発行されたURLで全員が即座にレポートを生成できます。
- **安心のセキュア設計**: OpenRouterのAPIキーはサーバーサイド（Cloudflare Pages Functions / Vercel Serverless Functions）で処理されるため、クライアントに漏洩しません。
- **ブラウザへのデータ保存**: あなたのペルソナ、ソース情報、お気に入り、履歴は、すべてブラウザの `localStorage` に安全に保管されます。
- **カスタムプロフィール設定**: 表示用のアバター画像や名前/メールアドレスを、アプリ画面上で簡単にカスタマイズできます。

---

## 🛠️ ローカルでの起動方法

1. **リポジトリをクローンして移動**
   ```bash
   cd ai-report-generator
   ```
2. **依存関係のインストール**
   ```bash
   npm install
   ```
3. **環境変数の設定**
   - `.env.example` をコピーして `.env` を作成します。
   - `OPENROUTER_API_KEY` の値をあなた自身のOpenRouter APIキーに書き換えます。
     ```text
     OPENROUTER_API_KEY=sk-or-v1-あなたのAPIキー
     ```
4. **開発サーバーの起動**
   ```bash
   npm run dev
   ```
   ブラウザで `http://localhost:5173/` にアクセスします。

---

## 🚀 デプロイ方法 (Cloudflare Pages)

1. GitHubにリポジトリをプッシュします。
2. Cloudflareのダッシュボードで Pages プロジェクトを作成し、GitHubリポジトリを接続します。
3. **ビルド設定**:
   - ビルドコマンド: `npm run build`
   - 出力ディレクトリ: `dist`
4. **環境変数の設定**:
   - ダッシュボードの変数設定で `OPENROUTER_API_KEY` に OpenRouter API キーを設定します。
5. 保存してデプロイを実行します。
