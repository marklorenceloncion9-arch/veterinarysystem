<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Drop barangay service scheduling tables/columns after the feature was removed.
     */
    public function up(): void
    {
        if (Schema::hasTable('notifications') && Schema::hasColumn('notifications', 'service_schedule_id')) {
            $this->dropForeignKeyIfExists('notifications', 'service_schedule_id');

            Schema::table('notifications', function (Blueprint $table) {
                $table->dropColumn('service_schedule_id');
            });
        }

        Schema::dropIfExists('service_schedules');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (!Schema::hasTable('service_schedules')) {
            Schema::create('service_schedules', function (Blueprint $table) {
                $table->id();
                $table->string('title');
                $table->text('message')->nullable();
                $table->date('schedule_date');
                $table->json('barangay_ids');
                $table->json('barangay_names')->nullable();
                $table->json('service_ids')->nullable();
                $table->json('service_names')->nullable();
                $table->unsignedInteger('recipients_count')->default(0);
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->index('schedule_date');
            });
        }

        if (Schema::hasTable('notifications') && !Schema::hasColumn('notifications', 'service_schedule_id')) {
            Schema::table('notifications', function (Blueprint $table) {
                $table->foreignId('service_schedule_id')
                    ->nullable()
                    ->after('user_id')
                    ->constrained('service_schedules')
                    ->nullOnDelete();
            });
        }
    }

    private function dropForeignKeyIfExists(string $table, string $column): void
    {
        $database = DB::getDatabaseName();

        $foreignKeys = DB::select(
            'SELECT CONSTRAINT_NAME
             FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = ?
               AND TABLE_NAME = ?
               AND COLUMN_NAME = ?
               AND REFERENCED_TABLE_NAME IS NOT NULL',
            [$database, $table, $column]
        );

        foreach ($foreignKeys as $foreignKey) {
            DB::statement(sprintf(
                'ALTER TABLE `%s` DROP FOREIGN KEY `%s`',
                $table,
                $foreignKey->CONSTRAINT_NAME
            ));
        }

        $indexes = DB::select(
            'SHOW INDEX FROM `'.$table.'` WHERE Column_name = ? AND Key_name != ?',
            [$column, 'PRIMARY']
        );

        $dropped = [];
        foreach ($indexes as $index) {
            if (in_array($index->Key_name, $dropped, true)) {
                continue;
            }

            try {
                DB::statement(sprintf(
                    'ALTER TABLE `%s` DROP INDEX `%s`',
                    $table,
                    $index->Key_name
                ));
                $dropped[] = $index->Key_name;
            } catch (\Throwable) {
                // Index may already be gone with the foreign key.
            }
        }
    }
};
