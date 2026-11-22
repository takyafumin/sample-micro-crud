<tr id="assignee-{{ $assignee->id }}" class="border-b border-gray-200 last:border-0">
    <td class="px-2 py-1 align-top">
        @include('assignees.partials._name_cell', ['assignee' => $assignee, 'editing' => false, 'value' => null, 'error' => null])
    </td>
    <td class="px-2 py-1 align-top text-gray-500">{{ $assignee->tasks_count }}</td>
    <td class="px-2 py-1 align-top text-right">
        <button
            type="button"
            hx-delete="{{ route('assignees.destroy', $assignee) }}"
            hx-target="closest tr"
            hx-swap="outerHTML"
            hx-confirm="この担当者を削除しますか?(担当中のタスクは担当者未設定になります)"
            class="text-xs text-red-600 hover:underline"
        >削除</button>
        <a href="{{ route('audit-logs.index', ['entity_id' => $assignee->id]) }}" class="ml-2 text-xs text-gray-500 hover:underline">
            ログ
        </a>
    </td>
</tr>
