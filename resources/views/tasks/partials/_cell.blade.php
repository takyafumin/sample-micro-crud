@php
    $type = \App\Models\Task::FIELDS[$field]['type'];
    // On a validation error we must show exactly what the user submitted (even if empty/null),
    // not fall back to the task's stored value.
    $currentValue = $error ? $value : $task->{$field};
    $patchUrl = route('tasks.cells.update', [$task, $field]);
@endphp

<div x-data="{ editing: {{ $editing ? 'true' : 'false' }} }" class="group relative">
    <span
        x-show="!editing"
        @click="editing = true"
        class="block min-h-[1.5rem] cursor-text rounded px-1 py-0.5 group-hover:bg-blue-50"
    >
        @switch($field)
            @case('status')
                <span class="rounded px-1.5 py-0.5 text-xs font-medium
                    @class([
                        'bg-gray-200 text-gray-700' => $task->status === 'TODO',
                        'bg-amber-100 text-amber-800' => $task->status === 'IN_PROGRESS',
                        'bg-green-100 text-green-800' => $task->status === 'DONE',
                    ])">{{ $task->status }}</span>
                @break
            @case('due_date')
                {{ $task->due_date?->format('Y-m-d') }}
                @break
            @default
                {{ $task->{$field} }}
        @endswitch
    </span>

    <div x-show="editing" x-cloak x-on:keydown.escape="editing = false">
        @switch($type)
            @case('select')
                <select
                    name="value"
                    hx-patch="{{ $patchUrl }}"
                    hx-target="closest td"
                    hx-swap="innerHTML"
                    hx-trigger="change"
                    class="w-full rounded border border-blue-400 px-1 py-0.5 text-sm"
                >
                    @foreach (\App\Models\Task::STATUSES as $status)
                        <option value="{{ $status }}" @selected($currentValue === $status)>{{ $status }}</option>
                    @endforeach
                </select>
                @break

            @case('textarea')
                <textarea
                    name="value"
                    hx-patch="{{ $patchUrl }}"
                    hx-target="closest td"
                    hx-swap="innerHTML"
                    hx-trigger="change, keyup[ctrlKey&&key=='Enter'&&!isComposing]"
                    rows="2"
                    class="w-full rounded border border-blue-400 px-1 py-0.5 text-sm"
                >{{ $currentValue }}</textarea>
                @break

            @case('date')
                <input
                    type="date"
                    name="value"
                    value="{{ $currentValue instanceof \Illuminate\Support\Carbon ? $currentValue->format('Y-m-d') : $currentValue }}"
                    hx-patch="{{ $patchUrl }}"
                    hx-target="closest td"
                    hx-swap="innerHTML"
                    hx-trigger="change"
                    class="w-full rounded border border-blue-400 px-1 py-0.5 text-sm"
                >
                @break

            @default
                <input
                    type="text"
                    name="value"
                    value="{{ $currentValue }}"
                    hx-patch="{{ $patchUrl }}"
                    hx-target="closest td"
                    hx-swap="innerHTML"
                    hx-trigger="change, keyup[key=='Enter'&&!isComposing]"
                    class="w-full rounded border border-blue-400 px-1 py-0.5 text-sm"
                >
        @endswitch

        @if ($error)
            <p class="mt-0.5 text-xs text-red-600">{{ $error }}</p>
        @endif
    </div>
</div>
