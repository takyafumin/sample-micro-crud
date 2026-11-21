# TODOリスト (MVP実装)

[設計書](./design.md) / Issue [#1](https://github.com/takyafumin/sample-micro-crud/issues/1) に基づく実装タスク一覧。
上から順に実施する想定。チェックは実装完了のたびに更新する。

## 0. 土台(完了)

- [x] Laravelプロジェクト作成 + SQLite接続確認
- [x] `tasks` テーブルのマイグレーション作成
- [x] `audit_logs` テーブルのマイグレーション作成
- [x] `Task` モデルにフィールド定義・バリデーションルールを定義

## 1. データ層

- [ ] マイグレーションを実行し、SQLiteにテーブルを作成する
- [ ] `AuditLog` モデルを実装(fillable, キャスト)
- [ ] `TaskObserver` を実装し、`created` / `updated` / `deleted` で `AuditLog` に差分を記録する
- [ ] Observerを `AppServiceProvider` (または `Task::observe()`) に登録する
- [ ] 動作確認用のSeeder/Factoryを作成する(任意、デモデータ投入用)

## 2. バックエンド(ルーティング・コントローラ)

- [ ] `routes/web.php` にルーティングを定義(一覧/作成/セル編集フォーム/セル更新/削除/操作ログ)
- [ ] `TaskController@index` : 検索クエリ `q` に対応、htmxリクエスト時は `<tbody>` 部分のみ返す
- [ ] `TaskController@store` : 新規行追加、バリデーション失敗時はフォーム部分にエラーを返す
- [ ] `TaskController@editCell` : 指定フィールドの編集フォームを返す
- [ ] `TaskController@updateCell` : 指定フィールド1件だけを検証して更新、成否に応じて表示用/編集用セルを返す
- [ ] `TaskController@destroy` : 削除、htmxの行削除に対応したレスポンスを返す
- [ ] `AuditLogController@index` : 一覧表示、`entity_id` によるフィルタに対応

## 3. フロントエンド(Blade/htmx/Alpine.js)

- [ ] htmx, Alpine.js, Tailwindを `resources/js/app.js` / `resources/css/app.css` に組み込む
- [ ] `layouts/app.blade.php` 共通レイアウトを作成
- [ ] `tasks/index.blade.php` : 検索ボックス + テーブル + 新規行追加フォーム
- [ ] `tasks/partials/_row.blade.php` : 1行分のテーブル行(初期表示・htmx差し替え両方で使う)
- [ ] `tasks/partials/_cell_display.blade.php` / `_cell_edit.blade.php` : セルの表示用・編集用パーシャル(フィールド種別ごとにtext/select/date/textarea切り替え)
- [ ] Alpine.jsでEnter確定・Escapeキャンセルのキーボード操作を実装
- [ ] `audit-logs/index.blade.php` : 操作ログ一覧ビュー

## 4. 動作確認

- [ ] `php artisan serve` 等でローカル起動し、ブラウザで一連の操作を確認する
  - [ ] 行追加 → 一覧に反映されるか
  - [ ] セルクリック→編集→保存で値が更新されるか
  - [ ] 不正な値(例: title空、due_dateに文字列)でバリデーションエラーがセル内に表示されるか
  - [ ] 検索ボックスでの絞り込みが効くか
  - [ ] 行削除が機能するか
  - [ ] 操作ログ一覧に CREATE/UPDATE/DELETE が記録されているか、差分内容が正しいか
- [ ] 主要フロー(作成・更新・削除・検索)の自動テスト(Feature test)を書く

## 5. リリース手順(CLAUDE.mdのPRワークフローに従う)

- [ ] 自己レビュー(code-reviewスキル / サブエージェント)
- [ ] `gh pr create` でPR作成(`Closes #1` を本文に含める)
- [ ] GitHub Copilotへレビュー依頼(Web UIから)
- [ ] 指摘対応 → 再レビュー(「🟢 Approval recommended」まで)
- [ ] マージ

## 今回やらないこと(スコープ外・設計書参照)

- 認証・認可
- 複数テーブル・リレーション
- ページネーション
- 列追加/削除などのスキーマ変更UI
