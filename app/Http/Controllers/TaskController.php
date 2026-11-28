<?php

namespace App\Http\Controllers;

use App\Models\Assignee;
use App\Models\Task;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

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

        $rawValue = Task::normalizeInput($request->input('value'));

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

    /**
     * Updates many cells at once for the grid's paste / clear / cut / undo /
     * redo. Each cell is validated on its own, as in updateCell(); the valid
     * ones are saved together in one transaction (one audit log entry per
     * task) and the invalid ones are left unchanged and reported back, so a
     * paste partly made of bad values still applies the rest, as a
     * spreadsheet would.
     *
     * Request:  {"changes": [{"id": 1, "field": "title", "value": "...", "text": false}, ...]}
     *           ("text": true means the value is spreadsheet text to convert,
     *           see Task::valueFromPastedText(), rather than an editor value.)
     * Response: {"results": [{"id", "field", "ok", "before", "after", "html", "error"}, ...]}
     *           in request order; "html" is the re-rendered cell for ok ones.
     */
    public function updateCells(Request $request)
    {
        $request->validate([
            'changes' => 'required|array|max:5000',
            'changes.*.id' => 'required|integer',
            'changes.*.field' => ['required', 'string', 'in:'.implode(',', array_keys(Task::fields()))],
            'changes.*.value' => 'nullable|string',
            'changes.*.text' => 'sometimes|boolean',
        ]);

        $changes = $request->input('changes');
        $tasks = Task::query()->whereIn('id', array_column($changes, 'id'))->get()->keyBy('id');
        // One query for all pasted assignee names instead of one per cell.
        $assigneeIdsByName = null;
        $knownAssigneeIds = null;

        $results = [];
        $pending = []; // task id => [field => validated value]

        foreach ($changes as $i => $change) {
            $id = (int) $change['id'];
            $field = $change['field'];
            $value = Task::normalizeInput($change['value'] ?? null);
            $isText = ! empty($change['text']);
            $results[$i] = ['id' => $id, 'field' => $field, 'ok' => false, 'error' => null];

            $task = $tasks->get($id);
            if (! $task) {
                $results[$i]['error'] = 'この行は削除されています';

                continue;
            }

            if ($isText && $value !== null) {
                $assigneeIdsByName ??= Assignee::pluck('id', 'name')->all();
                $converted = Task::valueFromPastedText($field, $value, $assigneeIdsByName);
                if ($converted === false) {
                    $results[$i]['error'] = "担当者「{$value}」は登録されていません";

                    continue;
                }
                $value = $converted;
            }

            $rule = Task::validationRuleFor($field);
            if ($field === 'assignee_id') {
                // Checked against one list of ids instead of an exists query per cell.
                $knownAssigneeIds ??= Assignee::pluck('id')->map(fn ($id) => (string) $id)->all();
                $rule = ['nullable', Rule::in($knownAssigneeIds)];
            } elseif ($isText && Task::fields()[$field]['type'] === 'date') {
                // Pasted text must be a real date, not e.g. "tomorrow".
                $rule .= '|date_format:Y-m-d';
            }
            $validator = Validator::make([$field => $value], [$field => $rule]);
            if ($validator->fails()) {
                $results[$i]['error'] = $validator->errors()->first($field);

                continue;
            }

            $pending[$id][$field] = $validator->validated()[$field];
            $results[$i]['ok'] = true;
        }

        $before = [];
        DB::transaction(function () use ($pending, $tasks, &$before) {
            foreach ($pending as $id => $values) {
                $task = $tasks->get($id);
                foreach (array_keys($values) as $field) {
                    $before[$id][$field] = $task->rawCellValue($field);
                }
                $task->update($values);
            }
        });
        // Fresh assignees for re-rendering, in one query.
        $tasks->load('assignee');

        foreach ($results as $i => $result) {
            if (! $result['ok']) {
                continue;
            }
            $task = $tasks->get($result['id']);
            $field = $result['field'];
            $results[$i]['before'] = $before[$result['id']][$field];
            $results[$i]['after'] = $task->rawCellValue($field);
            $results[$i]['html'] = view('tasks.partials._cell', [
                'task' => $task,
                'field' => $field,
                'editing' => false,
                'value' => null,
                'error' => null,
            ])->render();
        }

        return response()->json(['results' => array_values($results)]);
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
