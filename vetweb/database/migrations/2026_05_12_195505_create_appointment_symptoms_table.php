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
        Schema::create('appointment_symptoms', function (Blueprint $table) {
            $table->id();
            $table->foreignId('appointment_id')->constrained('bookings')->onDelete('cascade');
            $table->foreignId('symptom_id')->constrained()->onDelete('cascade');
            $table->integer('days_count')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            
            $table->index(['appointment_id', 'symptom_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('appointment_symptoms');
    }
};
