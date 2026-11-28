<?php

namespace Tests\Feature;

use App\Models\Assignee;
use App\Models\AuditLog;
use App\Models\Task;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TaskBatchCellUpdateTest extends TestCase
{
    use RefreshDatabase;

    private function patchCells(array $changes)
    {
        return $this->patchJson('/tasks/cells', ['changes' => $changes]);
    }

    public function test_updates_many_cells_and_returns_before_and_after(): void
    {
        $a = Task::create(['title' => 'A']);
        $b = Task::create(['title' => 'B', 'due_date' => '2026-01-02']);

        $response = $this->patchCells([
            ['id' => $a->id, 'field' => 'title', 'value' => 'A2'],
            ['id' => $a->id, 'field' => 'status', 'value' => 'DONE'],
            ['id' => $b->id, 'field' => 'due_date', 'value' => ''],
        ]);

        $response->assertOk();
        $response->assertJsonPath('results.0.ok', true);
        $response->assertJsonPath('results.0.before', 'A');
        $response->assertJsonPath('results.0.after', 'A2');
        $response->assertJsonPath('results.1.before', 'TODO');
        $response->assertJsonPath('results.1.after', 'DONE');
        $response->assertJsonPath('results.2.before', '2026-01-02');
        $response->assertJsonPath('results.2.after', '');
        $this->assertStringContainsString('data-raw="A2"', $response->json('results.0.html'));

        $this->assertSame('A2', $a->fresh()->title);
        $this->assertSame('DONE', $a->fresh()->status);
        $this->assertNull($b->fresh()->due_date);

        // One audit log entry per task, not per cell.
        $this->assertSame(1, AuditLog::where('entity_id', $a->id)->where('action', 'UPDATE')->count());
    }

    public function test_invalid_cells_are_reported_and_the_rest_still_applied(): void
    {
        $task = Task::create(['title' => 'A', 'notes' => 'memo']);

        $response = $this->patchCells([
            ['id' => $task->id, 'field' => 'title', 'value' => ''],
            ['id' => $task->id, 'field' => 'notes', 'value' => ''],
            ['id' => 999999, 'field' => 'title', 'value' => 'x'],
        ]);

        $response->assertOk();
        $response->assertJsonPath('results.0.ok', false);
        $this->assertNotEmpty($response->json('results.0.error'));
        $response->assertJsonPath('results.1.ok', true);
        $response->assertJsonPath('results.2.ok', false);

        $this->assertSame('A', $task->fresh()->title);
        $this->assertNull($task->fresh()->notes);
    }

    public function test_text_mode_converts_spreadsheet_values(): void
    {
        $tanaka = Assignee::create(['name' => '田中 太郎']);
        $task = Task::create(['title' => 'A']);

        $response = $this->patchCells([
            ['id' => $task->id, 'field' => 'assignee_id', 'value' => "田中  太郎\n", 'text' => true],
            ['id' => $task->id, 'field' => 'status', 'value' => 'done', 'text' => true],
            ['id' => $task->id, 'field' => 'due_date', 'value' => '2026/3/4', 'text' => true],
        ]);

        $response->assertOk();
        $response->assertJsonPath('results.0.after', (string) $tanaka->id);
        $this->assertStringContainsString('田中 太郎', $response->json('results.0.html'));

        $fresh = $task->fresh();
        $this->assertSame($tanaka->id, $fresh->assignee_id);
        $this->assertSame('DONE', $fresh->status);
        $this->assertSame('2026-03-04', $fresh->due_date->format('Y-m-d'));
    }

    public function test_text_mode_rejects_unknown_assignee_name(): void
    {
        $task = Task::create(['title' => 'A']);

        $response = $this->patchCells([
            ['id' => $task->id, 'field' => 'assignee_id', 'value' => '存在しない人', 'text' => true],
        ]);

        $response->assertJsonPath('results.0.ok', false);
        $this->assertStringContainsString('存在しない人', $response->json('results.0.error'));
    }

    public function test_rejects_unknown_field(): void
    {
        $task = Task::create(['title' => 'A']);

        $this->patchCells([['id' => $task->id, 'field' => 'id', 'value' => '5']])->assertStatus(422);
    }

    public function test_cell_partial_exposes_raw_and_display_values(): void
    {
        $tanaka = Assignee::create(['name' => '田中']);
        Task::create(['title' => 'A', 'assignee_id' => $tanaka->id, 'due_date' => '2026-05-06']);

        $response = $this->get('/tasks');

        $response->assertSee('data-raw="'.$tanaka->id.'"', false);
        $response->assertSee('data-text="田中"', false);
        $response->assertSee('data-raw="2026-05-06"', false);
    }

    public function test_text_mode_rejects_free_form_dates(): void
    {
        $task = Task::create(['title' => 'A']);

        $this->patchCells([['id' => $task->id, 'field' => 'due_date', 'value' => 'tomorrow', 'text' => true]])
            ->assertJsonPath('results.0.ok', false);
        $this->assertNull($task->fresh()->due_date);
    }

    public function test_rejects_unknown_assignee_id_and_normalizes_crlf(): void
    {
        $task = Task::create(['title' => 'A']);

        $response = $this->patchCells([
            ['id' => $task->id, 'field' => 'assignee_id', 'value' => '999'],
            ['id' => $task->id, 'field' => 'notes', 'value' => "a\r\nb"],
        ]);

        $response->assertJsonPath('results.0.ok', false);
        $response->assertJsonPath('results.1.after', "a\nb");
        $this->assertSame("a\nb", $task->fresh()->notes);
    }
}
