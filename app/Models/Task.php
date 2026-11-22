<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

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
            'assignee' => ['type' => 'text', 'rule' => 'nullable|string|max:255'],
            'due_date' => ['type' => 'date', 'rule' => 'nullable|date'],
            'notes' => ['type' => 'textarea', 'rule' => 'nullable|string|max:2000'],
        ];
    }

    protected $fillable = [
        'title',
        'status',
        'assignee',
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
    ];

    public static function validationRuleFor(string $field): string
    {
        return self::fields()[$field]['rule'] ?? throw new \InvalidArgumentException("Unknown field [{$field}]");
    }
}
