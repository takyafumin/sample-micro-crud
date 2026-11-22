<?php

namespace App\Providers;

use App\Models\Assignee;
use App\Models\Task;
use App\Observers\AssigneeObserver;
use App\Observers\TaskObserver;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Task::observe(TaskObserver::class);
        Assignee::observe(AssigneeObserver::class);
    }
}
