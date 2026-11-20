<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('bookings') && !Schema::hasColumn('bookings', 'booked_animals')) {
            Schema::table('bookings', function (Blueprint $table) {
                $table->json('booked_animals')->nullable()->after('animal_id');
            });
        }

        if (Schema::hasTable('booking_animals') && Schema::hasColumn('bookings', 'booked_animals')) {
            $grouped = [];
            DB::table('booking_animals')->orderBy('id')->each(function ($row) use (&$grouped) {
                $grouped[$row->booking_id][] = [
                    'animal_id' => (int) $row->animal_id,
                    'status' => $row->status ?: 'pending',
                    'cancellation_reason' => $row->cancellation_reason,
                ];
            });

            foreach ($grouped as $bookingId => $entries) {
                DB::table('bookings')->where('id', $bookingId)->update([
                    'booked_animals' => json_encode(array_values($entries)),
                ]);
            }
        }

        if (Schema::hasColumn('bookings', 'booked_animals') && Schema::hasColumn('bookings', 'animal_id')) {
            DB::table('bookings')
                ->whereNull('booked_animals')
                ->whereNotNull('animal_id')
                ->orderBy('id')
                ->chunkById(200, function ($bookings) {
                    foreach ($bookings as $booking) {
                        $status = match ($booking->status) {
                            'cancelled' => 'cancelled',
                            'approved', 'processing', 'ongoing', 'completed' => 'approved',
                            default => 'pending',
                        };

                        DB::table('bookings')->where('id', $booking->id)->update([
                            'booked_animals' => json_encode([[
                                'animal_id' => (int) $booking->animal_id,
                                'status' => $status,
                                'cancellation_reason' => $booking->status === 'cancelled'
                                    ? ($booking->cancellation_reason ?? null)
                                    : null,
                            ]]),
                        ]);
                    }
                });
        }

        Schema::dropIfExists('booking_animals');
    }

    public function down(): void
    {
        if (!Schema::hasTable('booking_animals')) {
            Schema::create('booking_animals', function (Blueprint $table) {
                $table->id();
                $table->foreignId('booking_id')->constrained('bookings')->cascadeOnDelete();
                $table->foreignId('animal_id')->constrained('animals')->cascadeOnDelete();
                $table->string('status', 20)->default('pending');
                $table->text('cancellation_reason')->nullable();
                $table->timestamps();
                $table->unique(['booking_id', 'animal_id']);
            });
        }

        if (Schema::hasColumn('bookings', 'booked_animals')) {
            DB::table('bookings')->orderBy('id')->chunkById(200, function ($bookings) {
                $now = now();
                $rows = [];
                foreach ($bookings as $booking) {
                    $entries = json_decode($booking->booked_animals ?? '[]', true) ?: [];
                    foreach ($entries as $entry) {
                        $animalId = (int) ($entry['animal_id'] ?? 0);
                        if ($animalId <= 0) {
                            continue;
                        }
                        $rows[] = [
                            'booking_id' => $booking->id,
                            'animal_id' => $animalId,
                            'status' => $entry['status'] ?? 'pending',
                            'cancellation_reason' => $entry['cancellation_reason'] ?? null,
                            'created_at' => $now,
                            'updated_at' => $now,
                        ];
                    }
                }
                if (!empty($rows)) {
                    DB::table('booking_animals')->insertOrIgnore($rows);
                }
            });

            Schema::table('bookings', function (Blueprint $table) {
                $table->dropColumn('booked_animals');
            });
        }
    }
};
