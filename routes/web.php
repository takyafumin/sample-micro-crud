<?php

use App\Http\Controllers\AssigneeController;
use App\Http\Controllers\AuditLogController;
use App\Http\Controllers\TaskController;
use Illuminate\Support\Facades\Route;

Route::redirect('/', '/tasks');

Route::get('/tasks', [TaskController::class, 'index'])->name('tasks.index');
Route::post('/tasks', [TaskController::class, 'store'])->name('tasks.store');
Route::patch('/tasks/{task}/cells/{field}', [TaskController::class, 'updateCell'])->name('tasks.cells.update');
Route::delete('/tasks/{task}', [TaskController::class, 'destroy'])->name('tasks.destroy');

Route::get('/assignees', [AssigneeController::class, 'index'])->name('assignees.index');
Route::post('/assignees', [AssigneeController::class, 'store'])->name('assignees.store');
Route::patch('/assignees/{assignee}', [AssigneeController::class, 'update'])->name('assignees.update');
Route::delete('/assignees/{assignee}', [AssigneeController::class, 'destroy'])->name('assignees.destroy');

Route::get('/audit-logs', [AuditLogController::class, 'index'])->name('audit-logs.index');
