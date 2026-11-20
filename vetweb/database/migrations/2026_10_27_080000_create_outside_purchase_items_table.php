<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('outside_purchase_items')) {
            return;
        }

        Schema::create('outside_purchase_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booking_id')->constrained('bookings')->cascadeOnDelete();
            $table->foreignId('animal_id')->nullable()->constrained('animals')->nullOnDelete();
            $table->string('item_name');
            $table->decimal('quantity', 10, 3);
            $table->string('status')->default('Approved by the clinic');
            $table->timestamp('issued_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('outside_purchase_items');
    }
};
