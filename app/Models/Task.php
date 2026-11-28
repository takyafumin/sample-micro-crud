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

    /**
     * Normalizes a submitted value before validation: textarea newlines
     * arrive as CRLF but the grid's data-raw (an HTML attribute) holds LF,
     * so store LF to keep undo from rewriting identical notes.
     */
    public static function normalizeInput(mixed $value): mixed
    {
        return is_string($value) ? str_replace(["\r\n", "\r"], "\n", $value) : $value;
    }

    public static function validationRuleFor(string $field): string
    {
        return self::fields()[$field]['rule'] ?? throw new \InvalidArgumentException("Unknown field [{$field}]");
    }

    /**
     * The stored value of $field as the string the cell editor submits
     * (assignee id, Y-m-d date, ...). Used by the grid to record undo history.
     */
    public function rawCellValue(string $field): string
    {
        $value = $this->{$field};

        return match (true) {
            $value === null => '',
            $value instanceof \DateTimeInterface => $value->format('Y-m-d'),
            default => (string) $value,
        };
    }

    /** The value of $field as shown in the grid (and copied to the clipboard). */
    public function cellText(string $field): string
    {
        return $field === 'assignee_id'
            ? (string) $this->assignee?->name
            : $this->rawCellValue($field);
    }

    /**
     * Converts text pasted from a spreadsheet into what the cell editor would
     * submit for $field: an assignee name becomes its id, a status is
     * upper-cased, and a "2026/11/30"-style date becomes "2026-11-30".
     * Returns null for an empty cell, or false when the text can't be mapped
     * (an unknown assignee name). Pass $assigneeIdsByName (name => id) to
     * avoid a query per call when converting many cells.
     */
    public static function valueFromPastedText(string $field, string $text, ?array $assigneeIdsByName = null): string|false|null
    {
        $trimmed = trim(preg_replace('/\s+/u', ' ', $text));
        if ($trimmed === '') {
            return null;
        }

        return match (self::fields()[$field]['type']) {
            'assignee' => (string) (($assigneeIdsByName ?? Assignee::pluck('id', 'name')->all())[$trimmed] ?? '') ?: false,
            'select' => strtoupper($trimmed),
            'date' => preg_match('#^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$#', $trimmed, $m)
                ? sprintf('%04d-%02d-%02d', $m[1], $m[2], $m[3])
                : $trimmed,
            default => $text,
        };
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(Assignee::class);
    }
}
