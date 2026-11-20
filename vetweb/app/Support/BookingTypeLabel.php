<?php

namespace App\Support;

class BookingTypeLabel
{
    /**
     * Human-readable label for a booking's `booking_type` value.
     */
    // Diri kuhaon ang label sa booking type.
    public static function label(?string $bookingType): string
    {
        return match ($bookingType) {
            'walk_in' => 'Walk-in',
            'home_service' => 'Home Service',
            default => 'Clinical Appointment',
        };
    }
}
