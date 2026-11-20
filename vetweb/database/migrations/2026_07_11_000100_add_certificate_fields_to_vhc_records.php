<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vhc_records', function (Blueprint $table) {
            $table->string('age')->nullable()->after('name');
            $table->string('color')->nullable()->after('age');
            $table->string('contact_number')->nullable()->after('color');
            $table->string('animals_origin')->nullable()->after('origin');
            $table->string('slh')->nullable()->after('destination');
            $table->date('issued_on')->nullable()->after('slh');
            $table->date('valid_till')->nullable()->after('issued_on');
            $table->string('paid_under')->nullable()->after('valid_till');
            $table->decimal('amount_paid', 10, 2)->nullable()->after('paid_under');
            $table->string('issued_at')->nullable()->after('amount_paid');
            $table->string('inspected_by')->nullable()->after('issued_at');
        });
    }

    public function down(): void
    {
        Schema::table('vhc_records', function (Blueprint $table) {
            $table->dropColumn([
                'age',
                'color',
                'contact_number',
                'animals_origin',
                'slh',
                'issued_on',
                'valid_till',
                'paid_under',
                'amount_paid',
                'issued_at',
                'inspected_by',
            ]);
        });
    }
};
