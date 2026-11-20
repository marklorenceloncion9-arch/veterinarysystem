<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('inventory_logs', 'reason')) {
            Schema::table('inventory_logs', function (Blueprint $table) {
                $table->string('reason')->nullable()->after('type');
            });
        }

        // Backfill: existing OUT logs came from treatments, IN logs from stock additions.
        DB::table('inventory_logs')->whereRaw('LOWER(type) = ?', ['out'])->whereNull('reason')->update(['reason' => 'used']);
        DB::table('inventory_logs')->whereRaw('LOWER(type) = ?', ['in'])->whereNull('reason')->update(['reason' => 'stock_in']);
    }

    public function down(): void
    {
        if (Schema::hasColumn('inventory_logs', 'reason')) {
            Schema::table('inventory_logs', function (Blueprint $table) {
                $table->dropColumn('reason');
            });
        }
    }
};
