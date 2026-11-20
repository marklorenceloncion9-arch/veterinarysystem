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
            ->whereIn('status', ['ongoing', 'completed', 'processing'])
            ->orderBy('id')
            ->chunkById(100, function ($logs) {
                foreach ($logs as $log) {
                    $appointment = Appointment::find($log->booking_id);
                    if (!$appointment) {
                        continue;
                    }

                    $storedName = trim((string) $log->changed_by_name);
                    $administeredBy = trim((string) $appointment->administered_by);

                    if ($administeredBy === '' || strcasecmp($storedName, $administeredBy) !== 0) {
                        continue;
                    }

                    $log->update([
                        'changed_by_name' => $log->status === 'completed'
                            ? AppointmentStatusLogService::BUDGET_OFFICER_ACTOR_LABEL
                            : AppointmentStatusLogService::ADMIN_ACTOR_LABEL,
                    ]);
                }
            });
    }

    public function down(): void
    {
        // Not reversed.
    }
};
