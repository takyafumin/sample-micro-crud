@php
    $currentValue = $error ? $value : $assignee->name;
    $patchUrl = route('assignees.update', $assignee);
@endphp

<div
    x-data="{ editing: {{ $editing ? 'true' : 'false' }}, original: null }"
    x-init="original = $refs.field.value"
    class="group relative"
>
    <span
        x-show="!editing"
        @click="editing = true"
        class="block min-h-[1.5rem] cursor-text rounded px-1 py-0.5 group-hover:bg-blue-50"
    >
        {{ $assignee->name }}
    </span>

    <div
        x-show="editing"
        x-cloak
        x-on:keydown.escape="$refs.field.value = original; editing = false"
    >
        <input
            x-ref="field"
            type="text"
            name="value"
            value="{{ $currentValue }}"
            hx-patch="{{ $patchUrl }}"
            hx-target="closest td"
            hx-swap="innerHTML"
            hx-trigger="change, keyup[key=='Enter'&&!isComposing]"
            class="w-full rounded border border-blue-400 px-1 py-0.5 text-sm"
        >

        @if ($error)
            <p class="mt-0.5 text-xs text-red-600">{{ $error }}</p>
        @endif
    </div>
</div>
