<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('booking_animals')) {
            return;
        }

        if (!Schema::hasColumn('booking_animals', 'status')) {
            Schema::table('booking_animals', function (Blueprint $table) {
                $table->string('status', 20)->default('pending')->after('animal_id');
            });
        }

        if (!Schema::hasColumn('booking_animals', 'cancellation_reason')) {
            Schema::table('booking_animals', function (Blueprint $table) {
                $table->text('cancellation_reason')->nullable()->after('status');
            });
        }

        if (Schema::hasTable('bookings')) {
            DB::table('booking_animals')
                ->orderBy('id')
                ->chunkById(200, function ($rows) {
                    foreach ($rows as $row) {
                        $bookingStatus = DB::table('bookings')->where('id', $row->booking_id)->value('status');
                        $animalStatus = match ($bookingStatus) {
                            'cancelled' => 'cancelled',
                            'approved', 'processing', 'ongoing', 'completed' => 'approved',
                            default => 'pending',
                        };

                        DB::table('booking_animals')->where('id', $row->id)->update([
                            'status' => $animalStatus,
                            'updated_at' => now(),
                        ]);
                    }
                });
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('booking_animals')) {
            return;
        }

        Schema::table('booking_animals', function (Blueprint $table) {
            if (Schema::hasColumn('booking_animals', 'cancellation_reason')) {
                $table->dropColumn('cancellation_reason');
            }
            if (Schema::hasColumn('booking_animals', 'status')) {
                $table->dropColumn('status');
            }
        });
    }
};
