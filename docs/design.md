# 設計書: スプシ風Web CRUD (MVP)

関連Issue: [#1](https://github.com/takyafumin/sample-micro-crud/issues/1)

## 1. 背景・目的

スプレッドシートに近い操作性(セルを直接クリックして編集、行の追加/削除)を持つWebシステムを作る。
スプレッドシートには無い以下の機能を実現する。

- 入力バリデーション(型・必須・文字数などサーバー側で保証)
- 検索/フィルタ
- 操作ログ(誰が/いつ/何を変更したかの記録)

認証は今回のMVPではスコープ外(後続で追加)。

## 2. 技術スタック

| 層 | 技術 | 理由 |
|---|---|---|
| バックエンド | Laravel 13 (PHP 8.3+) | Form Requestによるバリデーション、Eloquent ORM、マイグレーションが標準装備。軽量に立ち上げられる。 |
| DB | SQLite | ファイル1つで動く。今回の規模では十分。 |
| フロント(構造) | Blade | サーバーサイドレンダリング。SPAビルド不要。 |
| フロント(部分更新) | htmx | セル編集・行追加・削除・検索をページ遷移なしで実現。JSバンドルを増やさない。 |
| フロント(軽い状態管理) | Alpine.js | セル編集中のキーボード操作(Enter/Escape/矢印移動)など、サーバーを介さない軽量なUI挙動に使う。 |
| CSS | Tailwind CSS (Laravelデフォルト同梱) | 追加設定なしでスプレッドシート風の見た目(グリッド線・ホバー強調)を組める。 |

Next.js + Prisma は検討したが、SPAビルドの重さに対して今回のCRUD規模が見合わないため不採用(ユーザー判断)。

## 3. データモデル

### 3.1 `tasks` テーブル (MVPで扱う唯一の業務テーブル)

| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | bigint | PK, auto increment | |
| title | string(255) | NOT NULL | 必須 |
| status | string | NOT NULL, default `TODO` | `TODO` / `IN_PROGRESS` / `DONE` のいずれか |
| assignee | string(255) | NULL可 | 担当者名(自由入力。認証導入後はユーザー参照に変更予定) |
| due_date | date | NULL可 | |
| notes | text | NULL可, max 2000字 | |
| created_at / updated_at | timestamp | | |

将来的に複数テーブル・リレーションを追加する想定(今回はスコープ外)。

### 3.2 `audit_logs` テーブル (操作ログ)

| カラム | 型 | 備考 |
|---|---|---|
| id | bigint | PK |
| entity_type | string | 例: `Task` (将来他テーブルにも使えるよう汎用化) |
| entity_id | unsigned bigint | 対象レコードのID |
| action | string | `CREATE` / `UPDATE` / `DELETE` |
| changes | json | `{ "field": { "before": ..., "after": ... } }` 形式の差分 |
| actor | string | 操作者。認証が無い間は `anonymous` 固定 |
| created_at | timestamp | |

**記録方法**: Eloquentの [Observer](https://laravel.com/docs/eloquent#observers) (`App\Observers\TaskObserver`) で `created` / `updated` / `deleted` イベントを捕捉し、差分を計算して `AuditLog` に書き込む。サードパーティの監査ログパッケージ(`laravel-auditing`等)は入れず、自前実装で依存を減らす(軽量構成の方針に合わせる)。

## 4. 機能設計

### 4.1 一覧・スプレッドシート風グリッド (`/tasks`)

- 1行 = 1タスク。列は `title / status / assignee / due_date / notes / 操作`。
- 各セルは通常時は表示用の `<span>`。クリック(`hx-get`)すると同じセル内で入力フォームに置き換わる。
- 入力後、blur または Enter で `hx-patch` を発行しサーバーに送信。
  - 成功: 表示用セルに戻り、新しい値を反映。
  - 失敗(バリデーションエラー): 入力フォームのまま、エラーメッセージをセル内に表示。
- Escapeキー(Alpine.jsで制御)で編集をキャンセルし、表示セルに戻す(サーバー通信なし)。
- 行末に削除ボタン(`hx-delete`、`hx-confirm`で確認)。
- 表の下に新規行追加フォーム(タイトルのみ必須入力→Enterで `hx-post`、成功したら行として追加され入力欄はクリア)。

### 4.2 バリデーション

- フィールドごとのルールを `App\Models\Task::FIELDS` に集約(type: input種別, rule: Laravel validationルール文字列)。
- セル単位の更新(`PATCH /tasks/{task}/cells/{field}`)では、そのフィールドのルールだけを適用して検証する。
- 新規行追加(`POST /tasks`)では `title` のみ必須、他は未入力可(default値あり)。

### 4.3 検索/フィルタ

- 一覧上部に検索ボックス。`hx-get="/tasks"` + `hx-trigger="keyup changed delay:300ms"` でデバウンスしつつ `title` / `assignee` / `notes` を `LIKE` 検索。
- 結果は `<tbody>` 部分だけを差し替え(ページ全体はリロードしない)。
- クエリパラメータ `q` をURLに保持し、リロードしても検索状態を維持する。

### 4.4 操作ログ閲覧 (`/audit-logs`)

- `created_at` 降順で一覧表示。`entity_type` / `entity_id` / `action` / `actor` / 変更差分(before→after)を表示。
- 一覧画面の各行から該当タスクの操作ログへ絞り込めるリンクを用意(`?entity_id=`)。

## 5. ルーティング

| Method | Path | 説明 |
|---|---|---|
| GET | `/tasks` | 一覧・検索(htmxから呼ばれた場合は `<tbody>` 部分のみ返す) |
| POST | `/tasks` | 新規作成 |
| GET | `/tasks/{task}/cells/{field}/edit` | セルの編集フォームを返す |
| PATCH | `/tasks/{task}/cells/{field}` | セル単位の更新 |
| DELETE | `/tasks/{task}` | 削除 |
| GET | `/audit-logs` | 操作ログ一覧 |

## 6. 画面構成(ファイル)

```
resources/views/
  layouts/app.blade.php          # 共通レイアウト(htmx/Alpine.js読み込み)
  tasks/index.blade.php          # 一覧ページ
  tasks/partials/_row.blade.php  # 1行分(初期表示・htmx差し替え共用)
  tasks/partials/_cell_display.blade.php
  tasks/partials/_cell_edit.blade.php
  audit-logs/index.blade.php
```

## 7. スコープ外(今回やらないこと)

- 認証・認可(ユーザー登録・ログイン・ロール)
- 複数テーブル・リレーション
- ページネーション(行数が増えたら別途検討)
- 列の追加・削除などスキーマそのものをUIから変更する機能(スプシにある「列追加」はMVPでは対象外)

## 8. 未決事項・確認したいこと

- `status` の選択肢(TODO/IN_PROGRESS/DONE)の名称や増減が必要か
- `actor` を今は `anonymous` 固定にしているが、将来の認証導入時にどう引き継ぐか(セッション/ユーザーID)
- 操作ログの保持期間・削除方針(今回は無期限保持で設計)
