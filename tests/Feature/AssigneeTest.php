<?php

namespace Tests\Feature;

use App\Models\Assignee;
use App\Models\AuditLog;
use App\Models\Task;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AssigneeTest extends TestCase
{
    use RefreshDatabase;

    public function test_index_lists_assignees_with_task_counts(): void
    {
        $assignee = Assignee::create(['name' => '田中']);
        Task::create(['title' => 'タスクA', 'assignee_id' => $assignee->id]);
        Task::create(['title' => 'タスクB', 'assignee_id' => $assignee->id]);

        $response = $this->get('/assignees');

        $response->assertStatus(200);
        $response->assertSee('田中');
        $response->assertSee('2');
    }

    public function test_store_creates_assignee_and_records_audit_log(): void
    {
        $response = $this->post('/assignees', ['name' => '佐藤']);

        $response->assertStatus(200);
        $this->assertDatabaseHas('assignees', ['name' => '佐藤']);

        $assignee = Assignee::firstWhere('name', '佐藤');
        $log = AuditLog::where('entity_type', 'Assignee')->where('entity_id', $assignee->id)->where('action', 'CREATE')->first();

        $this->assertNotNull($log);
        $this->assertSame('佐藤', $log->changes['name']['after']);
    }

    public function test_store_rejects_duplicate_name(): void
    {
        Assignee::create(['name' => '佐藤']);

        $response = $this->post('/assignees', ['name' => '佐藤']);

        $response->assertStatus(200);
        $response->assertSee('taken');
        $this->assertDatabaseCount('assignees', 1);
    }

    public function test_update_renames_assignee_and_records_audit_log(): void
    {
        $assignee = Assignee::create(['name' => '田中']);

        $response = $this->patch("/assignees/{$assignee->id}", ['value' => '田中太郎']);

        $response->assertStatus(200);
        $this->assertSame('田中太郎', $assignee->fresh()->name);

        $log = AuditLog::where('entity_type', 'Assignee')->where('entity_id', $assignee->id)->where('action', 'UPDATE')->first();
        $this->assertNotNull($log);
        $this->assertSame('田中', $log->changes['name']['before']);
        $this->assertSame('田中太郎', $log->changes['name']['after']);
    }

    public function test_update_rejects_duplicate_name_of_another_assignee(): void
    {
        Assignee::create(['name' => '田中']);
        $assignee = Assignee::create(['name' => '佐藤']);

        $response = $this->patch("/assignees/{$assignee->id}", ['value' => '田中']);

        $response->assertStatus(200);
        $response->assertSee('taken');
        $this->assertSame('佐藤', $assignee->fresh()->name);
    }

    public function test_update_allows_keeping_the_same_name(): void
    {
        $assignee = Assignee::create(['name' => '田中']);

        $response = $this->patch("/assignees/{$assignee->id}", ['value' => '田中']);

        $response->assertStatus(200);
        $response->assertDontSee('taken');
    }

    public function test_destroy_deletes_assignee_and_unsets_related_tasks(): void
    {
        $assignee = Assignee::create(['name' => '田中']);
        $task = Task::create(['title' => 'タスクA', 'assignee_id' => $assignee->id]);

        $response = $this->delete("/assignees/{$assignee->id}");

        $response->assertStatus(200);
        $this->assertDatabaseMissing('assignees', ['id' => $assignee->id]);
        $this->assertNull($task->fresh()->assignee_id);

        $log = AuditLog::where('entity_type', 'Assignee')->where('entity_id', $assignee->id)->where('action', 'DELETE')->first();
        $this->assertNotNull($log);
    }
}
