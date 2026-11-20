<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        DB::statement("ALTER TABLE users MODIFY role ENUM('data_manager', 'budget_officer', 'owner', 'client', 'fieldman') NOT NULL DEFAULT 'data_manager'");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::table('users')
            ->where('role', 'fieldman')
            ->update(['role' => 'data_manager']);

        DB::statement("ALTER TABLE users MODIFY role ENUM('data_manager', 'budget_officer', 'owner', 'client') NOT NULL DEFAULT 'data_manager'");
    }
};
