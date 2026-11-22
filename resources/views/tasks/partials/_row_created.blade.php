@include('tasks.partials._row', ['task' => $task])
<div id="new-task-error" hx-swap-oob="true"></div>
{{-- Unconditional: a no-op (htmx logs a harmless console error) when the
     placeholder isn't in the DOM, but it must run every time a row is added
     so the placeholder is also cleared after a zero-result search. --}}
<tr id="no-tasks-row" hx-swap-oob="delete"></tr>
