<tr id="task-{{ $task->id }}" class="border-b border-gray-200 last:border-0">
    @foreach (array_keys(\App\Models\Task::fields()) as $field)
        <td class="px-2 py-1 align-top">
            @include('tasks.partials._cell', ['task' => $task, 'field' => $field, 'editing' => false, 'value' => null, 'error' => null])
        </td>
    @endforeach
    <td class="px-2 py-1 align-top text-right">
        <button
            type="button"
            hx-delete="{{ route('tasks.destroy', $task) }}"
            hx-target="closest tr"
            hx-swap="outerHTML"
            hx-confirm="このタスクを削除しますか?"
            class="text-xs text-red-600 hover:underline"
        >削除</button>
        <a href="{{ route('audit-logs.index', ['entity_id' => $task->id]) }}" class="ml-2 text-xs text-gray-500 hover:underline">
            ログ
        </a>
    </td>
</tr>
