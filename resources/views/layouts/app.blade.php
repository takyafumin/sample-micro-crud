<!DOCTYPE html>
<html lang="ja">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="csrf-token" content="{{ csrf_token() }}">
        <title>@yield('title', 'Sample Micro CRUD')</title>
        @vite(['resources/css/app.css', 'resources/js/app.js'])
    </head>
    <body class="bg-gray-50 text-gray-900">
        <div class="mx-auto max-w-5xl px-4 py-8">
            <nav class="mb-6 flex items-center gap-4 text-sm">
                <a href="{{ route('tasks.index') }}" class="font-semibold text-gray-900">タスク一覧</a>
                <a href="{{ route('assignees.index') }}" class="text-gray-500 hover:text-gray-900">担当者</a>
                <a href="{{ route('audit-logs.index') }}" class="text-gray-500 hover:text-gray-900">操作ログ</a>
            </nav>

            @yield('content')
        </div>
    </body>
</html>
