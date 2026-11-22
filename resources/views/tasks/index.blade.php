@extends('layouts.app')

@section('title', 'タスク一覧')

@section('content')
    <h1 class="mb-4 text-xl font-bold">タスク一覧</h1>

    <div class="mb-4">
        <input
            type="search"
            name="q"
            value="{{ $query }}"
            placeholder="タイトル・担当者・メモで検索..."
            hx-get="{{ route('tasks.index') }}"
            hx-trigger="input changed delay:300ms, search"
            hx-target="#task-rows"
            hx-swap="innerHTML"
            hx-push-url="true"
            class="w-full max-w-sm rounded border border-gray-300 px-3 py-1.5 text-sm"
        >
    </div>

    <div class="overflow-x-auto rounded border border-gray-200 bg-white">
        <table class="w-full border-collapse text-sm">
            <thead>
                <tr class="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-600">
                    <th class="px-2 py-2">タイトル</th>
                    <th class="px-2 py-2">状態</th>
                    <th class="px-2 py-2">担当者</th>
                    <th class="px-2 py-2">期限</th>
                    <th class="px-2 py-2">メモ</th>
                    <th class="px-2 py-2"></th>
                </tr>
            </thead>
            <tbody id="task-rows">
                @include('tasks.partials._rows', ['tasks' => $tasks])
            </tbody>
        </table>
    </div>

    <form
        hx-post="{{ route('tasks.store') }}"
        hx-target="#task-rows"
        hx-swap="beforeend"
        hx-on:task-created="this.reset()"
        class="mt-4 flex max-w-sm items-start gap-2"
    >
        <div class="flex-1">
            <input
                type="text"
                name="title"
                required
                maxlength="255"
                placeholder="新しいタスクのタイトルを入力してEnter"
                class="w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
            >
            <div id="new-task-error" class="mt-1"></div>
        </div>
        <button type="submit" class="rounded bg-gray-900 px-3 py-1.5 text-sm text-white">追加</button>
    </form>
@endsection
