<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('booking_medicines')) {
            return;
        }

        if (!Schema::hasColumn('booking_medicines', 'animal_id')) {
            Schema::table('booking_medicines', function (Blueprint $table) {
                $table->foreignId('animal_id')
                    ->nullable()
                    ->after('booking_id')
                    ->constrained('animals')
                    ->nullOnDelete();
            });
        }

        if (!Schema::hasColumn('booking_medicines', 'animal_id')) {
            return;
        }

        $bookings = DB::table('bookings')
            ->whereNotNull('animal_id')
            ->get(['id', 'animal_id']);

        foreach ($bookings as $booking) {
            DB::table('booking_medicines')
                ->where('booking_id', $booking->id)
                ->whereNull('animal_id')
                ->update(['animal_id' => $booking->animal_id]);
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('booking_medicines') || !Schema::hasColumn('booking_medicines', 'animal_id')) {
            return;
        }

        Schema::table('booking_medicines', function (Blueprint $table) {
            $table->dropConstrainedForeignId('animal_id');
        });
    }
};
