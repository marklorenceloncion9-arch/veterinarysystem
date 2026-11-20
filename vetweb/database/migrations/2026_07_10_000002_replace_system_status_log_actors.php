<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('booking_status_logs')
            ->where('changed_by_name', 'System')
            ->update(['changed_by_name' => 'Data Manager']);
    }

    public function down(): void
    {
        // Not reversed.
    }
};
