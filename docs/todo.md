# TODOリスト (MVP実装)

[設計書](./design.md) / Issue [#1](https://github.com/takyafumin/sample-micro-crud/issues/1) に基づく実装タスク一覧。
上から順に実施する想定。チェックは実装完了のたびに更新する。

## 0. 土台(完了)

- [x] Laravelプロジェクト作成 + SQLite接続確認
- [x] `tasks` テーブルのマイグレーション作成
- [x] `audit_logs` テーブルのマイグレーション作成
- [x] `Task` モデルにフィールド定義・バリデーションルールを定義

## 1. データ層

- [x] マイグレーションを実行し、SQLiteにテーブルを作成する
- [x] `AuditLog` モデルを実装(fillable, キャスト)
- [x] `TaskObserver` を実装し、`created` / `updated` / `deleted` で `AuditLog` に差分を記録する
- [x] Observerを `AppServiceProvider` に登録する
- [x] 動作確認用のSeeder/Factoryを作成する(任意、デモデータ投入用) → `database/seeders/TaskSeeder.php`

## 2. バックエンド(ルーティング・コントローラ)

- [x] `routes/web.php` にルーティングを定義(一覧/作成/セル更新/削除/操作ログ)
- [x] `TaskController@index` : 検索クエリ `q` に対応、htmxリクエスト時は `<tbody>` 部分のみ返す
- [x] `TaskController@store` : 新規行追加、バリデーション失敗時はフォーム部分にエラーを返す
- [x] `TaskController@updateCell` : 指定フィールド1件だけを検証して更新、成否に応じて表示用/編集用セルを返す
- [x] `TaskController@destroy` : 削除、htmxの行削除に対応したレスポンスを返す
- [x] `AuditLogController@index` : 一覧表示、`entity_id` によるフィルタに対応

## 3. フロントエンド(Blade/htmx/Alpine.js)

- [x] htmx, Alpine.js, Tailwindを `resources/js/app.js` / `resources/css/app.css` に組み込む
- [x] `layouts/app.blade.php` 共通レイアウトを作成
- [x] `tasks/index.blade.php` : 検索ボックス + テーブル + 新規行追加フォーム
- [x] `tasks/partials/_row.blade.php` : 1行分のテーブル行(初期表示・htmx差し替え両方で使う)
- [x] `tasks/partials/_cell.blade.php` : セルの表示用・編集用パーシャル(フィールド種別ごとにtext/select/date/textarea切り替え、Alpine.jsのx-showで表示切り替え)
- [x] Alpine.jsでEscapeキャンセルのキーボード操作を実装(Enter確定はhtmxのkeyup trigger、IME変換中のEnterは`isComposing`判定で除外)
- [x] `audit-logs/index.blade.php` : 操作ログ一覧ビュー

## 4. 動作確認

- [x] `php artisan serve` 等でローカル起動し、ブラウザで一連の操作を確認する
  - [x] 行追加 → 一覧に反映されるか
  - [x] セルクリック→編集→保存で値が更新されるか
  - [x] 不正な値(title空)でバリデーションエラーがセル内に表示されるか
  - [x] 検索ボックスでの絞り込みが効くか
  - [x] 行削除が機能するか
  - [x] 操作ログ一覧に CREATE/UPDATE/DELETE が記録されているか、差分内容が正しいか
- [x] 主要フロー(作成・更新・削除・検索)の自動テスト(Feature test)を書く(`tests/Feature/TaskTest.php`, `tests/Feature/AuditLogTest.php`、計12件すべてパス)

## 5. リリース手順(CLAUDE.mdのPRワークフローに従う)

- [x] 自己レビュー(code-reviewスキル / サブエージェント、8観点で実施。5件のバグを修正済み)
- [x] `gh pr create` でPR作成([#2](https://github.com/takyafumin/sample-micro-crud/pull/2)、`Closes #1`)
- [x] Copilotが使えないためサブエージェントでレビュー依頼(計3ラウンド)
- [x] 指摘対応 → 再レビュー(🟢 Approval recommendedまで到達)
- [x] マージ(PR #2。レビュー中の最後の修正がタイミングの関係で漏れたため、[#3](https://github.com/takyafumin/sample-micro-crud/pull/3)として追加修正・マージ済み)

## 6. 担当者のマスタ化 (Issue #5)

- [x] `assignees` テーブル作成 + `tasks.assignee_id` 追加(既存データの移行込み)マイグレーション
- [x] `Assignee` モデル・`Task` とのリレーション
- [x] 操作ログObserverを `RecordsAuditLog` トレイトに共通化し `AssigneeObserver` を追加
- [x] `AssigneeController`(一覧・追加・インライン改名・削除)+ ルーティング + 画面
- [x] タスクの担当者セルを `assignees` からの選択式に変更
- [x] 操作ログ画面で `assignee_id` を名前表示に解決
- [x] `TaskSeeder` を担当者マスタ対応に更新
- [x] Feature test追加(`AssigneeTest.php`、`TaskTest.php` に担当者関連ケース追加)
- [x] ブラウザで動作確認(選択・検索・担当者の追加/改名/重複エラー/削除時のnull化)

## 今回やらないこと(スコープ外・設計書参照)

- 認証・認可
- ページネーション
- 列追加/削除などのスキーマ変更UI
