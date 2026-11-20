<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('booking_fieldmen')) {
            Schema::create('booking_fieldmen', function (Blueprint $table) {
                $table->id();
                $table->foreignId('booking_id')->constrained('bookings')->cascadeOnDelete();
                $table->foreignId('fieldman_id')->constrained('users')->cascadeOnDelete();
                $table->timestamps();
                $table->unique(['booking_id', 'fieldman_id']);
            });
        }

        if (Schema::hasColumn('bookings', 'assigned_fieldman_id')) {
            DB::table('bookings')
                ->whereNotNull('assigned_fieldman_id')
                ->orderBy('id')
                ->chunkById(100, function ($bookings) {
                    foreach ($bookings as $booking) {
                        DB::table('booking_fieldmen')->updateOrInsert(
                            [
                                'booking_id' => $booking->id,
                                'fieldman_id' => $booking->assigned_fieldman_id,
                            ],
                            [
                                'created_at' => now(),
                                'updated_at' => now(),
                            ]
                        );
                    }
                });

            Schema::table('bookings', function (Blueprint $table) {
                $table->dropConstrainedForeignId('assigned_fieldman_id');
            });
        }
    }

    public function down(): void
    {
        if (!Schema::hasColumn('bookings', 'assigned_fieldman_id')) {
            Schema::table('bookings', function (Blueprint $table) {
                $table->foreignId('assigned_fieldman_id')
                    ->nullable()
                    ->after('meeting_place_photo_url')
                    ->constrained('users')
                    ->nullOnDelete();
            });

            $assignments = DB::table('booking_fieldmen')
                ->select('booking_id', DB::raw('MIN(fieldman_id) as fieldman_id'))
                ->groupBy('booking_id')
                ->get();

            foreach ($assignments as $assignment) {
                DB::table('bookings')
                    ->where('id', $assignment->booking_id)
                    ->update(['assigned_fieldman_id' => $assignment->fieldman_id]);
            }
        }

        Schema::dropIfExists('booking_fieldmen');
    }
};
