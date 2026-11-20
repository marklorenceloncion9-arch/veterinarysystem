<?php

use App\Models\Appointment;
use App\Models\BookingStatusLog;
use App\Services\AppointmentStatusLogService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Appointment::with('user')
            ->whereDoesntHave('statusLogs')
            ->orderBy('id')
            ->chunkById(100, function ($appointments) {
                foreach ($appointments as $appointment) {
                    DB::transaction(function () use ($appointment) {
                        $clientName = AppointmentStatusLogService::resolveActorName(
                            null,
                            $appointment->user_id
                        );

                        BookingStatusLog::create([
                            'booking_id' => $appointment->id,
                            'status' => 'pending',
                            'changed_by_user_id' => $appointment->user_id,
                            'changed_by_name' => $clientName,
                            'notes' => null,
                            'changed_at' => $appointment->created_at ?? now(),
                        ]);

                        if ($appointment->status !== 'pending') {
                            $actorName = in_array($appointment->status, ['ongoing', 'completed'], true)
                                ? ($appointment->administered_by ?: 'Staff')
                                : ($appointment->status === 'cancelled' ? 'Clinic' : 'Staff');

                            BookingStatusLog::create([
                                'booking_id' => $appointment->id,
                                'status' => $appointment->status,
                                'changed_by_user_id' => null,
                                'changed_by_name' => $actorName,
                                'notes' => $appointment->cancellation_reason,
                                'changed_at' => $appointment->updated_at ?? now(),
                            ]);
                        }
                    });
                }
            });
    }

    public function down(): void
    {
        // No rollback for backfilled data.
    }
};
