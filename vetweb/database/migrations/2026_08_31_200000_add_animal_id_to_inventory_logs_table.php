<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('inventory_logs')) {
            return;
        }

        if (!Schema::hasColumn('inventory_logs', 'animal_id')) {
            Schema::table('inventory_logs', function (Blueprint $table) {
                $table->foreignId('animal_id')
                    ->nullable()
                    ->after('booking_id')
                    ->constrained('animals')
                    ->nullOnDelete();
            });
        }

        $this->backfillFromBookingMedicines();
    }

    private function backfillFromBookingMedicines(): void
    {
        if (!Schema::hasColumn('inventory_logs', 'animal_id') || !Schema::hasTable('booking_medicines')) {
            return;
        }

        $logs = DB::table('inventory_logs')
            ->whereNull('animal_id')
            ->whereNotNull('booking_id')
            ->whereRaw('LOWER(type) = ?', ['out'])
            ->orderBy('id')
            ->get(['id', 'booking_id', 'medicine_id']);

        $assignedByKey = [];

        foreach ($logs as $log) {
            $medicines = DB::table('booking_medicines')
                ->where('booking_id', $log->booking_id)
                ->where('medicine_id', $log->medicine_id)
                ->whereNotNull('animal_id')
                ->orderBy('id')
                ->get(['id', 'animal_id']);

            if ($medicines->isEmpty()) {
                continue;
            }

            $key = $log->booking_id . ':' . $log->medicine_id;
            $offset = $assignedByKey[$key] ?? 0;
            $match = $medicines[$offset % $medicines->count()] ?? $medicines->first();
            $assignedByKey[$key] = $offset + 1;

            if ($match?->animal_id) {
                DB::table('inventory_logs')
                    ->where('id', $log->id)
                    ->update(['animal_id' => $match->animal_id]);
            }
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('inventory_logs') || !Schema::hasColumn('inventory_logs', 'animal_id')) {
            return;
        }

        Schema::table('inventory_logs', function (Blueprint $table) {
            $table->dropConstrainedForeignId('animal_id');
        });
    }
};
