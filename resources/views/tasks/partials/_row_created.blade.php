@include('tasks.partials._row', ['task' => $task])
<div id="new-task-error" hx-swap-oob="true"></div>
@if ($wasFirstTask)
    <tr id="no-tasks-row" hx-swap-oob="delete"></tr>
@endif
