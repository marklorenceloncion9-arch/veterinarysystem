<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('booking_slot_capacities', function (Blueprint $table) {
            $table->id();
            $table->date('slot_date');
            $table->time('start_time');
            $table->unsignedSmallInteger('capacity');
            $table->timestamps();
            $table->unique(['slot_date', 'start_time']);
        });

        Schema::table('bookings', function (Blueprint $table) {
            $table->unsignedSmallInteger('priority_number')->nullable()->after('duration_minutes');
        });

        $bookings = DB::table('bookings')
            ->whereIn('booking_type', ['appointment', 'walk_in'])
            ->whereNotIn('status', ['cancelled'])
            ->orderBy('booking_date')
            ->orderBy('booking_time')
            ->orderBy('created_at')
            ->orderBy('id')
            ->get(['id', 'booking_date', 'booking_time']);

        $counters = [];
        foreach ($bookings as $booking) {
            $date = substr((string) $booking->booking_date, 0, 10);
            $time = substr((string) $booking->booking_time, 0, 5);
            $key = $date.' '.$time;
            $counters[$key] = ($counters[$key] ?? 0) + 1;
            DB::table('bookings')->where('id', $booking->id)->update([
                'priority_number' => $counters[$key],
            ]);
        }
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn('priority_number');
        });

        Schema::dropIfExists('booking_slot_capacities');
    }
};
