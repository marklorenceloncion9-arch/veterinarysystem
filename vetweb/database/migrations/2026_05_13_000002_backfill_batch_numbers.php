<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Backfill batch_number for existing inventory records
        $inventories = DB::table('inventory')
            ->whereNull('batch_number')
            ->orderBy('medicine_id')
            ->orderBy('created_at')
            ->get();

        foreach ($inventories as $inventory) {
            $batchNumber = 'BATCH-' . $inventory->medicine_id . '-' . date('Ymd', strtotime($inventory->created_at)) . '-' . str_pad($inventory->id, 5, '0', STR_PAD_LEFT);
            
            DB::table('inventory')
                ->where('id', $inventory->id)
                ->update(['batch_number' => $batchNumber]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Clear batch numbers on rollback
        DB::table('inventory')->update(['batch_number' => null]);
    }
};
