<?php

namespace Tests\Feature;

use App\Models\Task;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuditLogTest extends TestCase
{
    use RefreshDatabase;

    public function test_index_lists_logs_for_all_entities(): void
    {
        $task = Task::create(['title' => '資料作成']);
        $task->update(['status' => 'DONE']);

        $response = $this->get('/audit-logs');

        $response->assertStatus(200);
        $response->assertSee('CREATE');
        $response->assertSee('UPDATE');
    }

    public function test_index_filters_by_entity_id(): void
    {
        $taskA = Task::create(['title' => 'タスクA']);
        $taskB = Task::create(['title' => 'タスクB']);

        $response = $this->get("/audit-logs?entity_id={$taskA->id}");

        $response->assertSee('タスクA');
        $response->assertDontSee('タスクB');
    }
}
