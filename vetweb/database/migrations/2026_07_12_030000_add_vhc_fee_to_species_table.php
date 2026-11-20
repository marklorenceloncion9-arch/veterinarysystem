<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('species', function (Blueprint $table) {
            $table->decimal('vhc_fee', 10, 2)->default(0)->after('species_name');
        });

        Schema::create('species_vhc_fee_history', function (Blueprint $table) {
            $table->id();
            $table->foreignId('species_id')->constrained('species')->cascadeOnDelete();
            $table->decimal('old_amount', 10, 2);
            $table->decimal('new_amount', 10, 2);
            $table->date('effective_date');
            $table->string('reason')->nullable();
            $table->foreignId('changed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        $livestockFee = DB::table('payment_types')->where('payment_type', 'vhc_livestock')->value('amount') ?? 0;
        $poultryFee = DB::table('payment_types')->where('payment_type', 'vhc_poultry')->value('amount') ?? 0;

        $livestockTypeId = DB::table('animal_types')->where('type_name', 'Livestock')->value('id');
        $poultryTypeId = DB::table('animal_types')->where('type_name', 'Poultry')->value('id');

        if ($livestockTypeId) {
            DB::table('species')->where('type_id', $livestockTypeId)->update(['vhc_fee' => $livestockFee]);
        }

        if ($poultryTypeId) {
            DB::table('species')->where('type_id', $poultryTypeId)->update(['vhc_fee' => $poultryFee]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('species_vhc_fee_history');

        Schema::table('species', function (Blueprint $table) {
            $table->dropColumn('vhc_fee');
        });
    }
};
