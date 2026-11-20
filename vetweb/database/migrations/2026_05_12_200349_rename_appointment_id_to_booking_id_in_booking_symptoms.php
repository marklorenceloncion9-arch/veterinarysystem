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
        // Check if appointment_id exists before renaming
        if (Schema::hasColumn('booking_symptoms', 'appointment_id')) {
            Schema::table('booking_symptoms', function (Blueprint $table) {
                $table->renameColumn('appointment_id', 'booking_id');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('booking_symptoms', function (Blueprint $table) {
            $table->renameColumn('booking_id', 'appointment_id');
        });
    }
};
