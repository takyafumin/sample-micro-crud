<?php

namespace App\Observers\Concerns;

use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;

/**
 * Shared created/updated/deleted -> AuditLog diffing logic for any model that
 * exposes a static auditableFields(): array of the column names to track.
 */
trait RecordsAuditLog
{
    public function created(Model $model): void
    {
        $this->record($model, 'CREATE', $this->diff(null, $this->snapshot($model)));
    }

    public function updated(Model $model): void
    {
        $changedFields = array_intersect(array_keys($model->getChanges()), $model::auditableFields());

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
            $before[$field] = $model->getOriginal($field);
            $after[$field] = $model->getAttribute($field);
        }

        $this->record($model, 'UPDATE', $this->diff($before, $after));
    }

    public function deleted(Model $model): void
    {
        $this->record($model, 'DELETE', $this->diff($this->snapshot($model), null));
    }

    /**
     * The model's current auditable attributes, read through the same
     * cast-applying accessor as updated()'s before/after so CREATE/DELETE and
     * UPDATE never disagree on a field's format.
     *
     * @return array<string, mixed>
     */
    private function snapshot(Model $model): array
    {
        $snapshot = [];

        foreach ($model::auditableFields() as $field) {
            $snapshot[$field] = $model->getAttribute($field);
        }

        return $snapshot;
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
    private function record(Model $model, string $action, array $changes): void
    {
        AuditLog::create([
            'entity_type' => class_basename($model),
            'entity_id' => $model->id,
            'action' => $action,
            'changes' => $changes,
            'actor' => 'anonymous',
        ]);
    }
}
