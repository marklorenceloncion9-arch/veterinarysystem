<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // booking_type was a MySQL ENUM('walk_in', 'appointment'). Convert it to a
        // plain string so a third value ('home_service') — and any future ones —
        // can be added without another ALTER TABLE ... MODIFY ENUM migration.
        DB::statement("ALTER TABLE bookings MODIFY booking_type VARCHAR(20) NOT NULL DEFAULT 'appointment'");

        DB::table('bookings')
            ->where('booking_type', 'appointment')
            ->where('is_door_to_door', true)
            ->update(['booking_type' => 'home_service']);

        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn('is_door_to_door');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->boolean('is_door_to_door')->default(false)->after('booking_type');
        });

        DB::table('bookings')
            ->where('booking_type', 'home_service')
            ->update(['is_door_to_door' => true, 'booking_type' => 'appointment']);

        DB::statement("ALTER TABLE bookings MODIFY booking_type ENUM('walk_in', 'appointment') NOT NULL DEFAULT 'appointment'");
    }
};
