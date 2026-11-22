<?php

namespace App\Observers;

use App\Models\AuditLog;
use App\Models\Task;

class TaskObserver
{
    /**
     * Handle the Task "created" event.
     */
    public function created(Task $task): void
    {
        $changes = [];

        foreach ($task->getAttributes() as $field => $value) {
            if (in_array($field, ['id', 'created_at', 'updated_at'], true)) {
                continue;
            }

            $changes[$field] = ['before' => null, 'after' => $value];
        }

        $this->record($task, 'CREATE', $changes);
    }

    /**
     * Handle the Task "updated" event.
     */
    public function updated(Task $task): void
    {
        $changes = [];

        foreach ($task->getChanges() as $field => $after) {
            if (in_array($field, ['updated_at'], true)) {
                continue;
            }

            $changes[$field] = [
                'before' => $task->getOriginal($field),
                'after' => $after,
            ];
        }

        if ($changes === []) {
            return;
        }

        $this->record($task, 'UPDATE', $changes);
    }

    /**
     * Handle the Task "deleted" event.
     */
    public function deleted(Task $task): void
    {
        $changes = [];

        foreach ($task->getAttributes() as $field => $value) {
            if (in_array($field, ['id', 'created_at', 'updated_at'], true)) {
                continue;
            }

            $changes[$field] = ['before' => $value, 'after' => null];
        }

        $this->record($task, 'DELETE', $changes);
    }

    /**
     * @param  array<string, array{before: mixed, after: mixed}>  $changes
     */
    private function record(Task $task, string $action, array $changes): void
    {
        AuditLog::create([
            'entity_type' => 'Task',
            'entity_id' => $task->id,
            'action' => $action,
            'changes' => $changes,
            'actor' => 'anonymous',
        ]);
    }
}
