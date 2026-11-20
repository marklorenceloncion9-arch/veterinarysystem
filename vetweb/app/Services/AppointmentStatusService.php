<?php

namespace App\Services;

use App\Models\Appointment;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class AppointmentStatusService
{
    public const PAST_DAY_CANCELLATION_REASON = 'Your appointment date has passed. You can reschedule anytime or any day.';

    /**
     * Cancel approved clinic appointments whose date is already in the past.
     */
    // Diri padaganon ang automatic nga pag-cancel sa appointment.
    public static function runScheduledUpdates(): array
    {
        return [
            'promoted' => 0,
            'cancelled' => self::cancelPastApprovedClinicalAppointments(),
        ];
    }

    /**
     * @deprecated Auto-promotion stays off. Status changes to ongoing are manual.
     */
    // Diri dili na himuong ongoing ang approved nga oras na.
    public static function promoteDueApprovedToOngoing(): int
    {
        return 0;
    }

    /**
     * Cancel approved clinical appointments after their scheduled day has passed.
     */
    // Diri i-cancel ang approved nga clinical appointment nga milabay na ang adlaw.
    public static function cancelNoShowAppointments(): int
    {
        return self::cancelPastApprovedClinicalAppointments();
    }

    // Diri i-cancel ang tanang approved nga clinical appointment nga milabay na ang petsa.
    public static function cancelPastApprovedClinicalAppointments(): int
    {
        $today = now()->toDateString();
        $reason = self::PAST_DAY_CANCELLATION_REASON;
        $cancelled = 0;

        $appointments = Appointment::query()
            ->where('booking_type', 'appointment')
            ->where('status', 'approved')
            ->whereDate('booking_date', '<', $today)
            ->orderBy('id')
            ->get();

        foreach ($appointments as $appointment) {
            try {
                DB::transaction(function () use ($appointment, $reason) {
                    $appointment->update([
                        'status' => 'cancelled',
                        'cancellation_reason' => $reason,
                    ]);

                    BookingAnimalStatusService::syncAnimalsToBookingStatus(
                        $appointment,
                        BookingAnimalStatusService::CANCELLED,
                        $reason
                    );

                    $fresh = $appointment->fresh();

                    AppointmentStatusLogService::record(
                        $fresh,
                        'cancelled',
                        'Clinic',
                        null,
                        $reason
                    );

                    AppointmentClientNotificationService::notifyCancelled($fresh, $reason, $reason);
                });

                AppointmentBroadcastService::notify($appointment->fresh(), 'cancelled');
                $cancelled++;
            } catch (\Throwable $e) {
                Log::error('Failed to auto-cancel past clinical appointment', [
                    'appointment_id' => $appointment->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return $cancelled;
    }
}
