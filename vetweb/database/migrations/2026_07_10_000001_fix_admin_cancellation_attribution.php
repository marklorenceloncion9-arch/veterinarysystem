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
            ->orderBy('id')
            ->chunkById(100, function ($logs) {
                foreach ($logs as $log) {
                    $appointment = Appointment::find($log->booking_id);
                    if (!$appointment) {
                        continue;
                    }

                    if (!AppointmentStatusLogService::isStaffInitiatedCancellationReason($appointment->cancellation_reason)) {
                        continue;
                    }

                    $ownerId = (int) $appointment->user_id;
                    $loggedUserId = (int) ($log->changed_by_user_id ?? 0);

                    if ($ownerId > 0 && $loggedUserId === $ownerId) {
                        $log->update([
                            'changed_by_user_id' => null,
                            'changed_by_name' => 'Data Manager',
                            'notes' => null,
                        ]);
                    }
                }
            });
    }

    public function down(): void
    {
        // Attribution corrections are not reversed.
    }
};
