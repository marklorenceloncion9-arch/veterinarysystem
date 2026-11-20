<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('bookings', 'priority_number')) {
            Schema::table('bookings', function (Blueprint $table) {
                $table->dropColumn('priority_number');
            });
        }
    }

    public function down(): void
    {
        if (!Schema::hasColumn('bookings', 'priority_number')) {
            Schema::table('bookings', function (Blueprint $table) {
                $table->unsignedSmallInteger('priority_number')->nullable()->after('duration_minutes');
            });
        }
    }
};
