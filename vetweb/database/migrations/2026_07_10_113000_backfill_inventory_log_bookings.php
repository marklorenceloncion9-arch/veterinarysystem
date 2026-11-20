<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Booking medicines are recorded when the treatment is set up, but the
     * inventory OUT log is written at completion, so timestamps can differ by
     * the treatment duration. Pair each unlinked OUT log with the most recent
     * unmatched booking_medicine of the same batch created before the log.
     */
    public function up(): void
    {
        $bookingMedicines = DB::table('booking_medicines')->orderBy('created_at')->get();
        $logs = DB::table('inventory_logs')
            ->whereRaw("LOWER(type) = 'out'")
            ->whereNull('booking_id')
            ->orderBy('created_at')
            ->get();

        $matched = [];

        foreach ($logs as $log) {
            $candidates = $bookingMedicines->filter(function ($bm) use ($log, $matched) {
                if (in_array($bm->id, $matched, true)) {
                    return false;
                }

                $sameSource = $log->inventory_id
                    ? (int) $bm->inventory_id === (int) $log->inventory_id
                    : (int) $bm->medicine_id === (int) $log->medicine_id;

                if (!$sameSource) {
                    return false;
                }

                // Allow a small grace period for flows that create the
                // booking_medicine right after the log in the same request.
                return strtotime($bm->created_at) <= strtotime($log->created_at) + 10;
            });

            $best = $candidates->sortByDesc('created_at')->first();

            if ($best) {
                $matched[] = $best->id;
                DB::table('inventory_logs')->where('id', $log->id)->update(['booking_id' => $best->booking_id]);
            }
        }
    }

    public function down(): void
    {
        // Backfilled links are indistinguishable from organic ones; nothing to undo.
    }
};
