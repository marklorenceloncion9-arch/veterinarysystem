<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Check if is_walk_in exists and fix the migration conflict
        $columns = DB::select("SHOW COLUMNS FROM bookings LIKE 'is_walk_in'");
        
        if (!empty($columns)) {
            // Column exists, so the 092620 migration succeeded
            // Just ensure appointment_type doesn't exist to avoid duplication
            $appointmentTypeColumns = DB::select("SHOW COLUMNS FROM bookings LIKE 'appointment_type'");
            if (empty($appointmentTypeColumns)) {
                // is_walk_in exists, appointment_type doesn't - complete the 093002 migration
                Schema::table('bookings', function (Blueprint $table) {
                    $table->dropColumn('is_walk_in');
                    $table->enum('appointment_type', ['walk_in', 'appointment'])->default('appointment')->after('status');
                });
            }
        }
        // If is_walk_in doesn't exist, both migrations must have been skipped/failed, which is fine
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // This migration is a fix, so we don't reverse it
    }
};
