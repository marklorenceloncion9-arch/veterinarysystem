<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vhc_clients', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('contact_number')->nullable();
            $table->timestamps();
        });

        Schema::table('vhc_records', function (Blueprint $table) {
            $table->foreignId('vhc_client_id')->nullable()->after('id')->constrained('vhc_clients')->cascadeOnDelete();
        });

        $records = DB::table('vhc_records')->orderBy('id')->get();
        $clientMap = [];

        foreach ($records as $record) {
            $key = strtolower(trim($record->name)) . '|' . ($record->contact_number ?? '');

            if (! isset($clientMap[$key])) {
                $clientMap[$key] = DB::table('vhc_clients')->insertGetId([
                    'name' => $record->name,
                    'contact_number' => $record->contact_number,
                    'created_at' => $record->created_at ?? now(),
                    'updated_at' => $record->updated_at ?? now(),
                ]);
            }

            DB::table('vhc_records')
                ->where('id', $record->id)
                ->update(['vhc_client_id' => $clientMap[$key]]);
        }

        DB::statement('ALTER TABLE vhc_records MODIFY vhc_client_id BIGINT UNSIGNED NOT NULL');
    }

    public function down(): void
    {
        Schema::table('vhc_records', function (Blueprint $table) {
            $table->dropConstrainedForeignId('vhc_client_id');
        });

        Schema::dropIfExists('vhc_clients');
    }
};
