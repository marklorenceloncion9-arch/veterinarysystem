<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Cancellation reason is stored on bookings; clear duplicated log notes.
        DB::table('booking_status_logs')
            ->where('status', 'cancelled')
            ->whereNotNull('notes')
            ->update(['notes' => null]);

        // Normalize blank cancellation reasons.
        DB::table('bookings')
            ->where('status', 'cancelled')
            ->where(function ($query) {
                $query->whereNull('cancellation_reason')->orWhere('cancellation_reason', '');
            })
            ->update(['cancellation_reason' => null]);
    }

    public function down(): void
    {
        // Data cleanup is not reversed.
    }
};
