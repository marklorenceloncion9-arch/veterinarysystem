<?php

use Illuminate\Database\Migrations\Migration;

/**
 * Historical no-op: previously backfilled inventory_logs.unit_name.
 * That column was later dropped; kept so migrate history stays consistent.
 */
return new class extends Migration
{
    public function up(): void
    {
        //
    }

    public function down(): void
    {
        //
    }
};
