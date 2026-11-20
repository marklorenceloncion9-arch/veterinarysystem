<?php

namespace App\Support;

use App\Models\Service;
use App\Models\Appointment;

class ServiceDurationHelper
{
    public const DEFAULT_MINUTES = 10;

    private const DURATIONS = [
        'vitamin supplements' => 10,
        'vitamin supplement' => 10,
        'vaccination' => 10,
        'deworming' => 10,
        'treatment' => 10,
        'castration' => 40,
        'spay' => 60,
    ];

    // Diri kuhaon ang minutos sa serbisyo base sa ngalan.
    public static function minutesForServiceName(?string $typeName): int
    {
        $key = strtolower(trim((string) $typeName));
        if ($key === '') {
            return self::DEFAULT_MINUTES;
        }

        foreach (self::DURATIONS as $name => $minutes) {
            if ($key === $name || str_contains($key, $name)) {
                return $minutes;
            }
        }

        return self::DEFAULT_MINUTES;
    }

    /**
     * @param  iterable<int|string|Service|array{type_name?: string}>  $services
     */
    // Diri kuwentahon ang total nga minutos sa mga serbisyo.
    public static function totalMinutesForServices(iterable $services): int
    {
        $total = 0;

        foreach ($services as $service) {
            if ($service instanceof Service) {
                $total += self::minutesForServiceName($service->type_name);
                continue;
            }

            if (is_array($service)) {
                $total += self::minutesForServiceName($service['type_name'] ?? null);
                continue;
            }

            if (is_string($service)) {
                $total += self::minutesForServiceName($service);
            }
        }

        return $total > 0 ? $total : self::DEFAULT_MINUTES;
    }

    /**
     * @param  array<int>  $serviceIds
     */
    // Diri kuwentahon ang minutos gikan sa service IDs.
    public static function totalMinutesForServiceIds(array $serviceIds): int
    {
        if ($serviceIds === []) {
            return self::DEFAULT_MINUTES;
        }

        $services = Service::whereIn('id', $serviceIds)->get(['id', 'type_name']);

        return self::totalMinutesForServices($services);
    }

    // Diri kuwentahon ang gidugayon sa appointment.
    public static function resolveForAppointment(Appointment $appointment): int
    {
        $appointment->loadMissing('treatmentTypes');

        if ($appointment->treatmentTypes->isNotEmpty()) {
            return self::totalMinutesForServices($appointment->treatmentTypes);
        }

        return BookingTimeHelper::resolveDurationMinutes($appointment->duration_minutes);
    }
}
