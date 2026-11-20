<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('outside_purchase_items')) {
            return;
        }

        DB::table('outside_purchase_items')
            ->where('status', 'Not available')
            ->update(['status' => 'Approved by the clinic']);

        DB::statement("ALTER TABLE outside_purchase_items MODIFY status VARCHAR(255) NOT NULL DEFAULT 'Approved by the clinic'");
    }

    public function down(): void
    {
        if (!Schema::hasTable('outside_purchase_items')) {
            return;
        }

        DB::table('outside_purchase_items')
            ->where('status', 'Approved by the clinic')
            ->update(['status' => 'Not available']);

        DB::statement("ALTER TABLE outside_purchase_items MODIFY status VARCHAR(255) NOT NULL DEFAULT 'Not available'");
    }
};
