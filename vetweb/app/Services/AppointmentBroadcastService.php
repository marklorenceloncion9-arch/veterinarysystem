<?php

namespace App\Services;

use App\Events\AppointmentChanged;
use App\Models\Appointment;
use App\Support\AdminAppointmentFormatter;
use App\Support\BookingTypeLabel;

class AppointmentBroadcastService
{
    /**
     * Broadcast a live update to the admin panel (appointments + walk-in services).
     */
    // Diri i-broadcast ang pag-usab sa appointment.
    public static function notify(Appointment $appointment, string $action): void
    {
        $payload = AdminAppointmentFormatter::format($appointment);
        $payload['booking_type'] = $appointment->booking_type;
        $payload['booking_type_label'] = BookingTypeLabel::label($appointment->booking_type);

        broadcast(new AppointmentChanged($action, $payload));
    }
}
