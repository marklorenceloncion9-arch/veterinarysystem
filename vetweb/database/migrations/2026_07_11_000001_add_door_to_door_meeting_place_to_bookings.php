<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->boolean('is_door_to_door')->default(false)->after('booking_type');
            $table->decimal('meeting_latitude', 10, 7)->nullable()->after('is_door_to_door');
            $table->decimal('meeting_longitude', 10, 7)->nullable()->after('meeting_latitude');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn(['is_door_to_door', 'meeting_latitude', 'meeting_longitude']);
        });
    }
};
