<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            if (!Schema::hasColumn('bookings', 'meeting_place_photo_url')) {
                $table->string('meeting_place_photo_url', 500)->nullable()->after('meeting_longitude');
            }
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            if (Schema::hasColumn('bookings', 'meeting_place_photo_url')) {
                $table->dropColumn('meeting_place_photo_url');
            }
        });
    }
};
