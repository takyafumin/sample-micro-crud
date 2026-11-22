@include('assignees.partials._row', ['assignee' => $assignee])
<div id="new-assignee-error" hx-swap-oob="true"></div>
{{-- Unconditional: a no-op (htmx logs a harmless console error) when the
     placeholder isn't in the DOM, but it must run every time a row is added
     so the placeholder is also cleared if the list was empty. --}}
<tr id="no-assignees-row" hx-swap-oob="delete"></tr>
