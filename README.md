# sample-micro-crud

スプレッドシートに近い操作性(セルクリックでインライン編集、行の追加・削除)を持つタスク管理のWebアプリケーション。
スプレッドシートにはない以下の機能を実現しています。

- カラムごとの入力バリデーション
- タイトル・担当者・メモでの検索/フィルタ
- 操作ログ(誰が/いつ/何を変更したか)の自動記録

認証は現時点ではスコープ外です。設計の背景は [docs/design.md](docs/design.md)、実装タスクの内訳は [docs/todo.md](docs/todo.md) を参照してください。

## 技術スタック

- [Laravel](https://laravel.com/) + PHP 8.3+
- SQLite
- [htmx](https://htmx.org/) + [Alpine.js](https://alpinejs.dev/) (SPAビルド無しでスプレッドシート風のインライン編集・部分更新を実現)
- Tailwind CSS

## セットアップ

```bash
composer install
npm install
cp .env.example .env
php artisan key:generate
touch database/database.sqlite
php artisan migrate
```

サンプルデータを投入する場合:

```bash
php artisan migrate:fresh --seed
```

## 開発サーバーの起動

```bash
php artisan serve
npm run dev
```

`http://localhost:8000/tasks` で動作確認できます。

## テスト・静的解析

```bash
php artisan test
vendor/bin/pint --test
```

## 主な画面

| パス | 内容 |
| --- | --- |
| `/tasks` | タスク一覧・検索・インライン編集・追加・削除 |
| `/audit-logs` | 操作ログ一覧(`?entity_id=` でタスク単位の絞り込みも可能) |
