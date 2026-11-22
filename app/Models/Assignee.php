<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Assignee extends Model
{
    /** Auditable columns, shared shape with Task::fields() for the shared audit-log observer trait. */
    public const FIELDS = [
        'name' => ['rule' => 'required|string|max:255'],
    ];

    protected $fillable = [
        'name',
    ];

    /** @return array<int, string> */
    public static function auditableFields(): array
    {
        return array_keys(self::FIELDS);
    }

    public static function validationRuleFor(string $field, ?self $ignoring = null): string
    {
        $rule = self::FIELDS[$field]['rule'] ?? throw new \InvalidArgumentException("Unknown field [{$field}]");

        if ($field === 'name') {
            $unique = 'unique:assignees,name'.($ignoring ? ','.$ignoring->id : '');
            $rule .= '|'.$unique;
        }

        return $rule;
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class);
    }
}
