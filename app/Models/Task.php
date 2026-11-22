<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Task extends Model
{
    use HasFactory;

    public const STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'];

    /**
     * Editable columns, in display order, with their input type and validation rule.
     *
     * A method rather than a constant so the 'status' rule can be built from
     * STATUSES instead of duplicating its values in a hardcoded rule string.
     *
     * @return array<string, array{type: string, rule: string}>
     */
    public static function fields(): array
    {
        return [
            'title' => ['type' => 'text', 'rule' => 'required|string|max:255'],
            'status' => ['type' => 'select', 'rule' => 'required|in:'.implode(',', self::STATUSES)],
            'assignee_id' => ['type' => 'assignee', 'rule' => 'nullable|exists:assignees,id'],
            'due_date' => ['type' => 'date', 'rule' => 'nullable|date'],
            'notes' => ['type' => 'textarea', 'rule' => 'nullable|string|max:2000'],
        ];
    }

    /** @return array<int, string> */
    public static function auditableFields(): array
    {
        return array_keys(self::fields());
    }

    protected $fillable = [
        'title',
        'status',
        'assignee_id',
        'due_date',
        'notes',
    ];

    // Mirrors the DB column default so a freshly created Task already has
    // 'status' in memory (Eloquent does not re-fetch DB-applied defaults).
    protected $attributes = [
        'status' => 'TODO',
    ];

    protected $casts = [
        'due_date' => 'date',
        // Without this, mass-assigning the raw string from a form submission
        // (e.g. '1') leaves assignee_id as a string in memory until the model
        // is refetched, so e.g. the audit log would record "1" instead of 1.
        'assignee_id' => 'integer',
    ];

    public static function validationRuleFor(string $field): string
    {
        return self::fields()[$field]['rule'] ?? throw new \InvalidArgumentException("Unknown field [{$field}]");
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(Assignee::class);
    }
}
