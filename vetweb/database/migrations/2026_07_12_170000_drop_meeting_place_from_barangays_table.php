<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('barangays', function (Blueprint $table) {
            if (Schema::hasColumn('barangays', 'meeting_place')) {
                $table->dropColumn('meeting_place');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('barangays', function (Blueprint $table) {
            if (!Schema::hasColumn('barangays', 'meeting_place')) {
                $table->string('meeting_place')->nullable()->after('photo_url');
            }
        });
    }
};
