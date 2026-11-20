<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('booking_services')) {
            return;
        }

        if (!Schema::hasColumn('booking_services', 'animal_id')) {
            Schema::table('booking_services', function (Blueprint $table) {
                $table->foreignId('animal_id')
                    ->nullable()
                    ->after('service_type_id')
                    ->constrained('animals')
                    ->nullOnDelete();
            });
        }

        // Backfill animal_id from the booking's primary animal (and duplicate
        // rows for additional booking_animals so each pet keeps the services).
        $bookings = DB::table('bookings')
            ->whereNotNull('animal_id')
            ->orderBy('id')
            ->get(['id', 'animal_id']);

        foreach ($bookings as $booking) {
            $serviceIds = DB::table('booking_services')
                ->where('booking_id', $booking->id)
                ->pluck('service_type_id')
                ->unique()
                ->values()
                ->all();

            if (empty($serviceIds)) {
                continue;
            }

            $animalIds = DB::table('booking_animals')
                ->where('booking_id', $booking->id)
                ->pluck('animal_id')
                ->unique()
                ->values()
                ->all();

            if (empty($animalIds)) {
                $animalIds = [$booking->animal_id];
            }

            // Clear old shared rows, then insert per-animal service rows.
            DB::table('booking_services')->where('booking_id', $booking->id)->delete();

            $now = now();
            $rows = [];
            foreach ($animalIds as $animalId) {
                foreach ($serviceIds as $serviceId) {
                    $rows[] = [
                        'booking_id' => $booking->id,
                        'service_type_id' => $serviceId,
                        'animal_id' => $animalId,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ];
                }
            }

            if (!empty($rows)) {
                DB::table('booking_services')->insert($rows);
            }
        }

        // Prefer unique per booking + animal + service when possible.
        Schema::table('booking_services', function (Blueprint $table) {
            try {
                $table->unique(['booking_id', 'animal_id', 'service_type_id'], 'booking_services_booking_animal_service_unique');
            } catch (\Throwable $e) {
                // Index may already exist or legacy duplicates remain.
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('booking_services') || !Schema::hasColumn('booking_services', 'animal_id')) {
            return;
        }

        Schema::table('booking_services', function (Blueprint $table) {
            try {
                $table->dropUnique('booking_services_booking_animal_service_unique');
            } catch (\Throwable $e) {
                // ignore
            }
        });

        Schema::table('booking_services', function (Blueprint $table) {
            $table->dropConstrainedForeignId('animal_id');
        });
    }
};
