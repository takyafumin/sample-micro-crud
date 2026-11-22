<?php

namespace Database\Seeders;

use App\Models\Task;
use Illuminate\Database\Seeder;

class TaskSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $tasks = [
            [
                'title' => '要件定義書のレビュー',
                'status' => 'DONE',
                'assignee' => '田中',
                'due_date' => now()->subDays(3)->toDateString(),
                'notes' => '関係者全員の承認済み',
            ],
            [
                'title' => 'デザインカンプの確認',
                'status' => 'IN_PROGRESS',
                'assignee' => '佐藤',
                'due_date' => now()->addDays(2)->toDateString(),
                'notes' => null,
            ],
            [
                'title' => 'API仕様書の作成',
                'status' => 'IN_PROGRESS',
                'assignee' => '鈴木',
                'due_date' => now()->addDays(5)->toDateString(),
                'notes' => 'OpenAPI形式で作成中',
            ],
            [
                'title' => '会議資料のレビュー依頼',
                'status' => 'TODO',
                'assignee' => '田中',
                'due_date' => now()->addDay()->toDateString(),
                'notes' => null,
            ],
            [
                'title' => '本番環境のデプロイ手順書作成',
                'status' => 'TODO',
                'assignee' => null,
                'due_date' => null,
                'notes' => '担当者未アサイン',
            ],
            [
                'title' => '週次定例の議事録まとめ',
                'status' => 'DONE',
                'assignee' => '佐藤',
                'due_date' => now()->subDay()->toDateString(),
                'notes' => null,
            ],
        ];

        foreach ($tasks as $task) {
            Task::create($task);
        }
    }
}
