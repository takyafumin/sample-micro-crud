@forelse ($assignees as $assignee)
    @include('assignees.partials._row', ['assignee' => $assignee])
@empty
    <tr id="no-assignees-row">
        <td colspan="3" class="px-2 py-4 text-center text-sm text-gray-500">担当者がいません</td>
    </tr>
@endforelse
