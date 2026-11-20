<?php

use App\Models\Appointment;
use App\Models\BookingStatusLog;
use App\Services\AppointmentStatusLogService;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        BookingStatusLog::query()
            ->where('status', 'cancelled')
            ->whereNull('changed_by_user_id')
            ->whereIn('changed_by_name', ['System', 'Staff'])
            ->orderBy('id')
            ->chunkById(100, function ($logs) {
                foreach ($logs as $log) {
                    $appointment = Appointment::find($log->booking_id);
                    if (!$appointment?->user_id) {
                        continue;
                    }

                    $notes = strtolower(trim((string) $log->notes));
                    $isClinicCancellation = $notes !== ''
                        && (
                            str_contains($notes, 'the clinic is unavailable')
                            || str_contains($notes, 'please book a new appointment')
                        );

                    if ($isClinicCancellation) {
                        continue;
                    }

                    $log->update([
                        'changed_by_user_id' => $appointment->user_id,
                        'changed_by_name' => AppointmentStatusLogService::resolveActorName(null, $appointment->user_id),
                    ]);
                }
            });
    }

    public function down(): void
    {
        // No rollback for corrected attribution data.
    }
};
