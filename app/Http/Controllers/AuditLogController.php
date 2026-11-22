<?php

namespace App\Http\Controllers;

use App\Models\Assignee;
use App\Models\AuditLog;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    public function index(Request $request)
    {
        $entityId = $request->query('entity_id');
        $entityType = $request->query('entity_type');

        $logs = AuditLog::query()
            ->when($entityId, fn ($builder) => $builder->where('entity_id', $entityId))
            // entity_id alone is ambiguous: Task and Assignee ids both start at 1.
            ->when($entityType, fn ($builder) => $builder->where('entity_type', $entityType))
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get();

        return view('audit-logs.index', [
            'logs' => $logs,
            'entityId' => $entityId,
            'entityType' => $entityType,
            // Lets the view show "assignee_id: 2 → 5" as names instead of bare ids.
            'assigneeNames' => Assignee::pluck('name', 'id'),
        ]);
    }
}
