<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('booking_status_logs')
            ->whereIn('changed_by_name', ['Staff', 'System'])
            ->update(['changed_by_name' => 'Data Manager']);
    }

    public function down(): void
    {
        // Not reversed.
    }
};
