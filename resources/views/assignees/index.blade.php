@extends('layouts.app')

@section('title', '担当者')

@section('content')
    <h1 class="mb-4 text-xl font-bold">担当者</h1>

    <div class="overflow-x-auto rounded border border-gray-200 bg-white">
        <table class="w-full border-collapse text-sm">
            <thead>
                <tr class="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-600">
                    <th class="px-2 py-2">名前</th>
                    <th class="px-2 py-2">担当タスク数</th>
                    <th class="px-2 py-2"></th>
                </tr>
            </thead>
            <tbody id="assignee-rows">
                @include('assignees.partials._rows', ['assignees' => $assignees])
            </tbody>
        </table>
    </div>

    <form
        hx-post="{{ route('assignees.store') }}"
        hx-target="#assignee-rows"
        hx-swap="beforeend"
        hx-on:assignee-created="this.reset()"
        class="mt-4 flex max-w-sm items-start gap-2"
    >
        <div class="flex-1">
            <input
                type="text"
                name="name"
                required
                maxlength="255"
                placeholder="新しい担当者名を入力してEnter"
                class="w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
            >
            <div id="new-assignee-error" class="mt-1"></div>
        </div>
        <button type="submit" class="rounded bg-gray-900 px-3 py-1.5 text-sm text-white">追加</button>
    </form>
@endsection
