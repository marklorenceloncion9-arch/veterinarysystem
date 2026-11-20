<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE payment_types MODIFY COLUMN payment_type ENUM(
            'pet_registration',
            'vhc_animal',
            'vhc_livestock',
            'vhc_poultry',
            'vhc_certificate'
        ) NOT NULL");

        $existingVhcAmount = DB::table('payment_types')
            ->where('payment_type', 'vhc_animal')
            ->value('amount') ?? 0;

        $now = now();

        $newTypes = [
            [
                'payment_type' => 'vhc_certificate',
                'type_name' => 'VHC Certificate',
                'amount' => 50.00,
            ],
            [
                'payment_type' => 'vhc_livestock',
                'type_name' => 'VHC Livestock',
                'amount' => $existingVhcAmount,
            ],
            [
                'payment_type' => 'vhc_poultry',
                'type_name' => 'VHC Poultry',
                'amount' => $existingVhcAmount,
            ],
        ];

        foreach ($newTypes as $type) {
            $exists = DB::table('payment_types')
                ->where('payment_type', $type['payment_type'])
                ->exists();

            if (!$exists) {
                DB::table('payment_types')->insert([
                    ...$type,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }
    }

    public function down(): void
    {
        DB::table('payment_types')
            ->whereIn('payment_type', ['vhc_livestock', 'vhc_poultry', 'vhc_certificate'])
            ->delete();

        DB::statement("ALTER TABLE payment_types MODIFY COLUMN payment_type ENUM(
            'pet_registration',
            'vhc_animal'
        ) NOT NULL");
    }
};
