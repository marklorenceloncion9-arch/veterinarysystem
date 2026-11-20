<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('veterinarian_profiles', function (Blueprint $table) {
            $table->id();
            $table->string('firstname');
            $table->string('lastname');
            $table->string('email')->nullable();
            $table->foreignId('barangay_id')->nullable()->constrained()->nullOnDelete();
            $table->string('zone')->nullable();
            $table->string('profile_photo_url', 2048)->nullable();
            $table->string('title')->default('Veterinarian');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('veterinarian_profiles');
    }
};
