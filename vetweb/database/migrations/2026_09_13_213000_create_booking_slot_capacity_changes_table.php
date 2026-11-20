<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('booking_slot_capacity_changes', function (Blueprint $table) {
            $table->id();
            $table->date('slot_date');
            $table->foreignId('changed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('summary');
            $table->json('before_slots');
            $table->json('after_slots');
            $table->timestamps();

            $table->index(['created_at']);
            $table->index(['slot_date', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('booking_slot_capacity_changes');
    }
};
