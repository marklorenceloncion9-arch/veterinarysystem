<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\User;

class ClientApprovalService
{
    /**
     * Cancel all active bookings when a client account is rejected.
     */
    // Diri i-cancel ang aktibo nga appointment sa client.
    public static function cancelActiveAppointmentsForClient(User $client, string $reason): int
    {
        $appointments = Appointment::where('user_id', $client->id)
            ->whereNotIn('status', ['cancelled', 'completed', 'rejected'])
            ->get();

        $cancelledCount = 0;

        foreach ($appointments as $appointment) {
            $appointment->update([
                'status' => 'cancelled',
                'cancellation_reason' => $reason,
            ]);

            $fresh = $appointment->fresh();
            AppointmentStatusLogService::record(
                $fresh,
                'cancelled',
                'El Salvador Vet Clinic',
                null
            );
            AppointmentClientNotificationService::notifyCancelled($fresh, $reason);
            AppointmentBroadcastService::notify($fresh, 'cancelled');
            $cancelledCount++;
        }

        return $cancelledCount;
    }
}
