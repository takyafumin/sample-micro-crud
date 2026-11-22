<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'entity_type',
        'entity_id',
        'action',
        'changes',
        'actor',
    ];

    protected $casts = [
        'changes' => 'array',
    ];
}
