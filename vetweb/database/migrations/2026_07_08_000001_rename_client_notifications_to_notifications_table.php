<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('client_notifications') && !Schema::hasTable('notifications')) {
            Schema::rename('client_notifications', 'notifications');
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('notifications') && !Schema::hasTable('client_notifications')) {
            Schema::rename('notifications', 'client_notifications');
        }
    }
};
