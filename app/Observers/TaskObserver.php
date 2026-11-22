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
        $this->record($task, 'CREATE', $this->diff(null, $this->snapshot($task)));
    }

    /**
     * Handle the Task "updated" event.
     */
    public function updated(Task $task): void
    {
        $changedFields = array_intersect(array_keys($task->getChanges()), array_keys(Task::fields()));

        if ($changedFields === []) {
            return;
        }

        // Read both sides through the same cast-applying accessor (getAttribute),
        // not the raw getChanges()/getOriginal() arrays, so e.g. a 'date' cast
        // field doesn't end up with a cast value on one side and a raw string
        // on the other.
        $before = [];
        $after = [];

        foreach ($changedFields as $field) {
            $before[$field] = $task->getOriginal($field);
            $after[$field] = $task->getAttribute($field);
        }

        $this->record($task, 'UPDATE', $this->diff($before, $after));
    }

    /**
     * Handle the Task "deleted" event.
     */
    public function deleted(Task $task): void
    {
        $this->record($task, 'DELETE', $this->diff($this->snapshot($task), null));
    }

    /**
     * The task's current auditable attributes (everything in Task::fields()).
     *
     * @return array<string, mixed>
     */
    private function snapshot(Task $task): array
    {
        return array_intersect_key($task->getAttributes(), Task::fields());
    }

    /**
     * @param  array<string, mixed>|null  $before
     * @param  array<string, mixed>|null  $after
     * @return array<string, array{before: mixed, after: mixed}>
     */
    private function diff(?array $before, ?array $after): array
    {
        $changes = [];

        foreach (array_keys($before ?? $after ?? []) as $field) {
            $changes[$field] = [
                'before' => $before[$field] ?? null,
                'after' => $after[$field] ?? null,
            ];
        }

        return $changes;
    }

    /**
     * @param  array<string, array{before: mixed, after: mixed}>  $changes
     */
    private function record(Task $task, string $action, array $changes): void
    {
        AuditLog::create([
            'entity_type' => class_basename($task),
            'entity_id' => $task->id,
            'action' => $action,
            'changes' => $changes,
            'actor' => 'anonymous',
        ]);
    }
}
