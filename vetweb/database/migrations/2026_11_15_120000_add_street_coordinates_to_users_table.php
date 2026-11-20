<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->decimal('street_latitude', 10, 7)->nullable()->after('street');
            $table->decimal('street_longitude', 10, 7)->nullable()->after('street_latitude');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['street_latitude', 'street_longitude']);
        });
    }
};
