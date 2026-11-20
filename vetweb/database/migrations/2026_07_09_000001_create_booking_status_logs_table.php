<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('booking_status_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booking_id')->constrained('bookings')->cascadeOnDelete();
            $table->string('status', 32);
            $table->foreignId('changed_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('changed_by_name');
            $table->text('notes')->nullable();
            $table->timestamp('changed_at');
            $table->timestamps();

            $table->index(['booking_id', 'changed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('booking_status_logs');
    }
};
