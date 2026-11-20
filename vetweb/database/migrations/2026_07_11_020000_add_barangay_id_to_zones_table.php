<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Zones are barangay-specific (each barangay numbers its own zones),
     * so rebuild the table scoped by barangay_id. The old global rows
     * (Zone 1-3) are dropped; ZoneSeeder reseeds per barangay.
     */
    public function up(): void
    {
        Schema::dropIfExists('zones');

        Schema::create('zones', function (Blueprint $table) {
            $table->id();
            $table->foreignId('barangay_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->timestamps();

            $table->unique(['barangay_id', 'name']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('zones');

        Schema::create('zones', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->timestamps();
        });
    }
};
