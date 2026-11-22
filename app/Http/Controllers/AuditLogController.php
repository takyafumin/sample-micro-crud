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

        $logs = AuditLog::query()
            ->when($entityId, fn ($builder) => $builder->where('entity_id', $entityId))
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get();

        return view('audit-logs.index', [
            'logs' => $logs,
            'entityId' => $entityId,
            // Lets the view show "assignee_id: 2 → 5" as names instead of bare ids.
            'assigneeNames' => Assignee::pluck('name', 'id'),
        ]);
    }
}
