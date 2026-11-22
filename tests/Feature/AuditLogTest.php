<?php

namespace Tests\Feature;

use App\Models\Assignee;
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

    public function test_index_filters_by_entity_id_and_type_without_mixing_entities(): void
    {
        // Task and Assignee ids both start at 1, so entity_id alone is ambiguous.
        $task = Task::create(['title' => 'タスクA']);
        $assignee = Assignee::create(['name' => '佐藤']);
        $this->assertSame($task->id, $assignee->id);

        $response = $this->get("/audit-logs?entity_id={$task->id}&entity_type=Task");

        $response->assertSee('タスクA');
        $response->assertDontSee('佐藤');
    }
}
