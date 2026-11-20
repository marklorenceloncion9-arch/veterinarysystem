<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('animals', function (Blueprint $table) {
            if (!Schema::hasColumn('animals', 'rabies_dose_type')) {
                $table->string('rabies_dose_type', 20)->nullable()->after('rabies_last_vaccination');
            }
            if (!Schema::hasColumn('animals', 'dhppl_dose_type')) {
                $table->string('dhppl_dose_type', 20)->nullable()->after('dhppl_last_vaccination');
            }
            if (!Schema::hasColumn('animals', 'other_vaccine_dose_type')) {
                $table->string('other_vaccine_dose_type', 20)->nullable()->after('other_vaccine_last_vaccination');
            }
        });
    }

    public function down(): void
    {
        Schema::table('animals', function (Blueprint $table) {
            foreach (['rabies_dose_type', 'dhppl_dose_type', 'other_vaccine_dose_type'] as $column) {
                if (Schema::hasColumn('animals', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
