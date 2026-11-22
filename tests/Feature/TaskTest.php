<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Task;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TaskTest extends TestCase
{
    use RefreshDatabase;

    public function test_index_lists_tasks(): void
    {
        Task::create(['title' => '資料作成']);

        $response = $this->get('/tasks');

        $response->assertStatus(200);
        $response->assertSee('資料作成');
    }

    public function test_index_filters_by_search_query(): void
    {
        Task::create(['title' => '資料作成']);
        Task::create(['title' => '会議設定']);

        $response = $this->get('/tasks?'.http_build_query(['q' => '会議']));

        $response->assertSee('会議設定');
        $response->assertDontSee('資料作成');
    }

    public function test_store_creates_task_and_records_audit_log(): void
    {
        $response = $this->post('/tasks', ['title' => '新しいタスク']);

        $response->assertStatus(200);
        $this->assertDatabaseHas('tasks', ['title' => '新しいタスク']);

        $task = Task::firstWhere('title', '新しいタスク');
        $log = AuditLog::where('entity_id', $task->id)->where('action', 'CREATE')->first();

        $this->assertNotNull($log);
        $this->assertSame('anonymous', $log->actor);
        $this->assertSame('新しいタスク', $log->changes['title']['after']);
    }

    public function test_store_rejects_blank_title(): void
    {
        $response = $this->post('/tasks', ['title' => '']);

        $response->assertStatus(200);
        $response->assertSee('required');
        $this->assertDatabaseCount('tasks', 0);
    }

    public function test_update_cell_updates_field_and_records_audit_log(): void
    {
        $task = Task::create(['title' => '資料作成']);

        $response = $this->patch("/tasks/{$task->id}/cells/status", ['value' => 'DONE']);

        $response->assertStatus(200);
        $this->assertSame('DONE', $task->fresh()->status);

        $log = AuditLog::where('entity_id', $task->id)->where('action', 'UPDATE')->first();
        $this->assertNotNull($log);
        $this->assertSame('TODO', $log->changes['status']['before']);
        $this->assertSame('DONE', $log->changes['status']['after']);
    }

    public function test_update_cell_rejects_invalid_value_and_does_not_update(): void
    {
        $task = Task::create(['title' => '資料作成']);

        $response = $this->patch("/tasks/{$task->id}/cells/title", ['value' => '']);

        $response->assertStatus(200);
        $response->assertSee('required');
        $this->assertSame('資料作成', $task->fresh()->title);
    }

    public function test_update_cell_rejects_unknown_field(): void
    {
        $task = Task::create(['title' => '資料作成']);

        $response = $this->patch("/tasks/{$task->id}/cells/id", ['value' => '999']);

        $response->assertStatus(404);
    }

    public function test_destroy_deletes_task_and_records_audit_log(): void
    {
        $task = Task::create(['title' => '資料作成']);

        $response = $this->delete("/tasks/{$task->id}");

        $response->assertStatus(200);
        $this->assertDatabaseMissing('tasks', ['id' => $task->id]);

        $log = AuditLog::where('entity_id', $task->id)->where('action', 'DELETE')->first();
        $this->assertNotNull($log);
        $this->assertSame('資料作成', $log->changes['title']['before']);
    }
}
