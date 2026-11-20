<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('booking_animals')) {
            Schema::create('booking_animals', function (Blueprint $table) {
                $table->id();
                $table->foreignId('booking_id')->constrained('bookings')->cascadeOnDelete();
                $table->foreignId('animal_id')->constrained('animals')->cascadeOnDelete();
                $table->timestamps();
                $table->unique(['booking_id', 'animal_id']);
            });
        }

        // Backfill existing single-animal bookings into the pivot.
        if (Schema::hasColumn('bookings', 'animal_id')) {
            DB::table('bookings')
                ->whereNotNull('animal_id')
                ->orderBy('id')
                ->chunkById(200, function ($bookings) {
                    $now = now();
                    $rows = [];
                    foreach ($bookings as $booking) {
                        $rows[] = [
                            'booking_id' => $booking->id,
                            'animal_id' => $booking->animal_id,
                            'created_at' => $now,
                            'updated_at' => $now,
                        ];
                    }
                    if (!empty($rows)) {
                        DB::table('booking_animals')->insertOrIgnore($rows);
                    }
                });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('booking_animals');
    }
};
