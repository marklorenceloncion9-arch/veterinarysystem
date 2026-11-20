<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            if (!Schema::hasColumn('bookings', 'assigned_fieldman_id')) {
                $table->foreignId('assigned_fieldman_id')
                    ->nullable()
                    ->after('meeting_place_photo_url')
                    ->constrained('users')
                    ->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            if (Schema::hasColumn('bookings', 'assigned_fieldman_id')) {
                $table->dropConstrainedForeignId('assigned_fieldman_id');
            }
        });
    }
};
