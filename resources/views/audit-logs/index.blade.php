@extends('layouts.app')

@section('title', '操作ログ')

@section('content')
    <h1 class="mb-4 text-xl font-bold">操作ログ</h1>

    @if ($entityId)
        <p class="mb-4 text-sm text-gray-600">
            {{ $entityType }} #{{ $entityId }} の操作ログのみ表示中。
            <a href="{{ route('audit-logs.index') }}" class="text-blue-600 hover:underline">すべて表示</a>
        </p>
    @endif

    <div class="overflow-x-auto rounded border border-gray-200 bg-white">
        <table class="w-full border-collapse text-sm">
            <thead>
                <tr class="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-600">
                    <th class="px-2 py-2">日時</th>
                    <th class="px-2 py-2">対象</th>
                    <th class="px-2 py-2">操作</th>
                    <th class="px-2 py-2">実行者</th>
                    <th class="px-2 py-2">変更内容</th>
                </tr>
            </thead>
            <tbody>
                @forelse ($logs as $log)
                    <tr class="border-b border-gray-200 align-top last:border-0">
                        <td class="whitespace-nowrap px-2 py-2 text-gray-500">{{ $log->created_at->format('Y-m-d H:i:s') }}</td>
                        <td class="whitespace-nowrap px-2 py-2">{{ $log->entity_type }} #{{ $log->entity_id }}</td>
                        <td class="whitespace-nowrap px-2 py-2">
                            <span class="rounded px-1.5 py-0.5 text-xs font-medium
                                @class([
                                    'bg-green-100 text-green-800' => $log->action === 'CREATE',
                                    'bg-amber-100 text-amber-800' => $log->action === 'UPDATE',
                                    'bg-red-100 text-red-800' => $log->action === 'DELETE',
                                ])">{{ $log->action }}</span>
                        </td>
                        <td class="whitespace-nowrap px-2 py-2 text-gray-500">{{ $log->actor }}</td>
                        <td class="px-2 py-2">
                            <ul class="space-y-0.5">
                                @foreach ($log->changes as $field => $diff)
                                    @php
                                        $resolve = fn ($value) => $log->entity_type === 'Task' && $field === 'assignee_id' && $value !== null
                                            ? ($assigneeNames[$value] ?? "ID:{$value}")
                                            : $value;
                                    @endphp
                                    <li>
                                        <span class="font-medium">{{ $field }}</span>:
                                        <span class="text-gray-500">{{ $resolve($diff['before']) ?? '(空)' }}</span>
                                        →
                                        <span>{{ $resolve($diff['after']) ?? '(空)' }}</span>
                                    </li>
                                @endforeach
                            </ul>
                        </td>
                    </tr>
                @empty
                    <tr>
                        <td colspan="5" class="px-2 py-4 text-center text-sm text-gray-500">操作ログがありません</td>
                    </tr>
                @endforelse
            </tbody>
        </table>
    </div>
@endsection
