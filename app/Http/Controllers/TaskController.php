<?php

namespace App\Http\Controllers;

use App\Models\Task;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class TaskController extends Controller
{
    public function index(Request $request)
    {
        $query = trim((string) $request->query('q', ''));

        $tasks = Task::query()
            ->with('assignee')
            ->when($query !== '', function ($builder) use ($query) {
                $builder->where(function ($builder) use ($query) {
                    $builder->where('title', 'like', "%{$query}%")
                        ->orWhere('notes', 'like', "%{$query}%")
                        ->orWhereHas('assignee', function ($builder) use ($query) {
                            $builder->where('name', 'like', "%{$query}%");
                        });
                });
            })
            ->orderByDesc('id')
            ->get();

        if ($request->header('HX-Request') && $request->header('HX-Target') === 'task-rows') {
            return view('tasks.partials._rows', ['tasks' => $tasks]);
        }

        return view('tasks.index', ['tasks' => $tasks, 'query' => $query]);
    }

    public function store(Request $request)
    {
        $validator = Validator::make(
            $request->only('title'),
            ['title' => Task::validationRuleFor('title')],
        );

        if ($validator->fails()) {
            return response()
                ->view('tasks.partials._new_task_error', ['error' => $validator->errors()->first('title')])
                ->header('HX-Retarget', '#new-task-error')
                ->header('HX-Reswap', 'innerHTML');
        }

        $task = Task::create($validator->validated());

        return response()
            ->view('tasks.partials._row_created', ['task' => $task])
            ->header('HX-Trigger', 'task-created');
    }

    public function updateCell(Request $request, Task $task, string $field)
    {
        abort_unless(array_key_exists($field, Task::fields()), 404);

        $rawValue = $request->input('value');

        $validator = Validator::make(
            [$field => $rawValue],
            [$field => Task::validationRuleFor($field)],
        );

        if ($validator->fails()) {
            return view('tasks.partials._cell', [
                'task' => $task,
                'field' => $field,
                'editing' => true,
                'value' => $rawValue,
                'error' => $validator->errors()->first($field),
            ]);
        }

        $task->update($validator->validated());

        return view('tasks.partials._cell', [
            'task' => $task,
            'field' => $field,
            'editing' => false,
            'value' => null,
            'error' => null,
        ]);
    }

    public function destroy(Task $task)
    {
        $task->delete();

        if (Task::query()->doesntExist()) {
            return view('tasks.partials._no_tasks_row_oob');
        }

        return response('');
    }
}
