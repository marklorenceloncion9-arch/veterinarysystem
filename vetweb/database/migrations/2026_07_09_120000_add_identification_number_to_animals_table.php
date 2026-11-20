<?php

use App\Models\Animal;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('animals', function (Blueprint $table) {
            $table->string('identification_number', 32)->nullable()->unique()->after('pet_name');
        });

        Animal::query()
            ->whereNull('identification_number')
            ->whereHas('animalRegistrations', fn ($query) => $query->where('status', 'paid'))
            ->orderBy('id')
            ->each(fn (Animal $animal) => $animal->assignIdentificationNumber());
    }

    public function down(): void
    {
        Schema::table('animals', function (Blueprint $table) {
            $table->dropUnique(['identification_number']);
            $table->dropColumn('identification_number');
        });
    }
};
