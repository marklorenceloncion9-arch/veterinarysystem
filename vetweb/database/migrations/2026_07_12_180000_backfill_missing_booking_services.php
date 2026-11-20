<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Backfill booking_services from bookings.service_type_id when the pivot row is missing.
     * Those bookings previously showed as "General Check-up" / empty in the admin list.
     */
    public function up(): void
    {
        $orphans = DB::table('bookings as b')
            ->leftJoin('booking_services as bs', 'bs.booking_id', '=', 'b.id')
            ->whereNull('bs.id')
            ->whereNotNull('b.service_type_id')
            ->select('b.id', 'b.service_type_id')
            ->get();

        $now = now();

        foreach ($orphans as $orphan) {
            $serviceExists = DB::table('services')->where('id', $orphan->service_type_id)->exists();
            if (!$serviceExists) {
                continue;
            }

            DB::table('booking_services')->insertOrIgnore([
                'booking_id' => $orphan->id,
                'service_type_id' => $orphan->service_type_id,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        // Irreversible data repair — no-op.
    }
};
