@forelse ($tasks as $task)
    @include('tasks.partials._row', ['task' => $task])
@empty
    <tr id="no-tasks-row">
        <td colspan="6" class="px-2 py-4 text-center text-sm text-gray-500">タスクがありません</td>
    </tr>
@endforelse
