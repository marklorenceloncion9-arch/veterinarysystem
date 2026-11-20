<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('inventory_logs', 'unit_name')) {
            return;
        }

        Schema::table('inventory_logs', function (Blueprint $table) {
            $table->dropColumn('unit_name');
        });
    }

    public function down(): void
    {
        if (Schema::hasColumn('inventory_logs', 'unit_name')) {
            return;
        }

        Schema::table('inventory_logs', function (Blueprint $table) {
            $table->string('unit_name')->nullable()->after('reason');
        });
    }
};
