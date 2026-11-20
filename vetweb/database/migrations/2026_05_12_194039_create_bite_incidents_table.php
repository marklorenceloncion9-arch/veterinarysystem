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
        Schema::create('bite_incidents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('appointment_id')->constrained('bookings')->onDelete('cascade');
            $table->text('bite_details')->nullable();
            $table->timestamps();
            
            $table->index('appointment_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('bite_incidents');
    }
};
