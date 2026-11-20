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
        Schema::table('inventory', function (Blueprint $table) {
            // Add batch_number to track different purchases/batches
            $table->string('batch_number')->nullable()->after('medicine_id');
            // Add index for batch tracking and FIFO sorting
            $table->index(['medicine_id', 'expiration_date', 'created_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('inventory', function (Blueprint $table) {
            $table->dropIndex(['medicine_id', 'expiration_date', 'created_at']);
            $table->dropColumn('batch_number');
        });
    }
};
