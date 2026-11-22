<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->foreignId('assignee_id')->nullable()->after('assignee')
                ->constrained('assignees')->nullOnDelete();
        });

        // Migrate the existing free-text assignee names into the new assignees
        // master table, then point each task at the matching row. Treat '' the
        // same as NULL: the new assignees.name column requires a real name.
        $names = DB::table('tasks')->whereNotNull('assignee')->where('assignee', '!=', '')
            ->distinct()->pluck('assignee');

        foreach ($names as $name) {
            $assigneeId = DB::table('assignees')->insertGetId([
                'name' => $name,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            DB::table('tasks')->where('assignee', $name)->update(['assignee_id' => $assigneeId]);
        }

        Schema::table('tasks', function (Blueprint $table) {
            $table->dropColumn('assignee');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('tasks', function (Blueprint $table) {
            $table->string('assignee')->nullable()->after('status');
        });

        // SQLite doesn't support UPDATE ... JOIN, so backfill per assignee row.
        DB::table('assignees')->orderBy('id')->each(function ($assignee) {
            DB::table('tasks')->where('assignee_id', $assignee->id)->update(['assignee' => $assignee->name]);
        });

        Schema::table('tasks', function (Blueprint $table) {
            $table->dropConstrainedForeignId('assignee_id');
        });
    }
};
