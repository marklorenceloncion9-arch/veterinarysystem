<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('inventory_logs', 'booking_id')) {
            Schema::table('inventory_logs', function (Blueprint $table) {
                $table->foreignId('booking_id')->nullable()->after('inventory_id')->constrained('bookings')->nullOnDelete();
            });
        }

        // Backfill: treatment deductions were written in the same request as their
        // booking_medicines row, so match on inventory + a small timestamp window.
        DB::statement("
            UPDATE inventory_logs il
            JOIN booking_medicines bm ON bm.inventory_id = il.inventory_id
                AND ABS(TIMESTAMPDIFF(SECOND, bm.created_at, il.created_at)) <= 10
            SET il.booking_id = bm.booking_id
            WHERE LOWER(il.type) = 'out' AND il.booking_id IS NULL
        ");

        // Older logs have no inventory_id; fall back to matching on medicine.
        DB::statement("
            UPDATE inventory_logs il
            JOIN booking_medicines bm ON bm.medicine_id = il.medicine_id
                AND ABS(TIMESTAMPDIFF(SECOND, bm.created_at, il.created_at)) <= 10
            SET il.booking_id = bm.booking_id
            WHERE LOWER(il.type) = 'out' AND il.booking_id IS NULL
        ");
    }

    public function down(): void
    {
        if (Schema::hasColumn('inventory_logs', 'booking_id')) {
            Schema::table('inventory_logs', function (Blueprint $table) {
                $table->dropConstrainedForeignId('booking_id');
            });
        }
    }
};
