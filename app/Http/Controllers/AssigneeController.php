<?php

namespace App\Http\Controllers;

use App\Models\Assignee;
use App\Models\Task;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class AssigneeController extends Controller
{
    public function index()
    {
        $assignees = Assignee::withCount('tasks')->orderBy('name')->get();

        return view('assignees.index', ['assignees' => $assignees]);
    }

    public function store(Request $request)
    {
        $validator = Validator::make(
            $request->only('name'),
            ['name' => Assignee::validationRuleFor('name')],
        );

        if ($validator->fails()) {
            return response()
                ->view('assignees.partials._new_assignee_error', ['error' => $validator->errors()->first('name')])
                ->header('HX-Retarget', '#new-assignee-error')
                ->header('HX-Reswap', 'innerHTML');
        }

        $assignee = Assignee::create($validator->validated());
        // A brand-new assignee provably has 0 tasks; skip the COUNT query.
        $assignee->setAttribute('tasks_count', 0);

        return response()
            ->view('assignees.partials._row_created', ['assignee' => $assignee])
            ->header('HX-Trigger', 'assignee-created');
    }

    public function update(Request $request, Assignee $assignee)
    {
        $validator = Validator::make(
            ['name' => $request->input('value')],
            ['name' => Assignee::validationRuleFor('name', $assignee)],
        );

        if ($validator->fails()) {
            return view('assignees.partials._name_cell', [
                'assignee' => $assignee,
                'editing' => true,
                'value' => $request->input('value'),
                'error' => $validator->errors()->first('name'),
            ]);
        }

        $assignee->update($validator->validated());

        return view('assignees.partials._name_cell', [
            'assignee' => $assignee,
            'editing' => false,
            'value' => null,
            'error' => null,
        ]);
    }

    public function destroy(Assignee $assignee)
    {
        // Unassign through Eloquent (not the DB's nullOnDelete FK action) so
        // TaskObserver fires and the affected tasks' UPDATE is audit-logged.
        $assignee->tasks()->get()->each(function (Task $task) {
            $task->update(['assignee_id' => null]);
        });

        $assignee->delete();

        if (Assignee::query()->doesntExist()) {
            return view('assignees.partials._no_assignees_row_oob');
        }

        return response('');
    }
}
