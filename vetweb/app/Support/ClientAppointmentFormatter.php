<?php

namespace App\Support;

use App\Models\Animal;
use App\Models\Appointment;
use App\Services\AppointmentClientNotificationService;
use App\Services\AppointmentStatusLogService;
use App\Services\BookingAnimalStatusService;

class ClientAppointmentFormatter
{
    // Diri i-format ang appointment para sa client.
    public static function format(Appointment $appointment): array
    {
        $appointment->loadMissing([
            'animal',
            'treatmentType',
            'treatmentTypes',
            'bookingServices.service',
            'symptoms',
            'statusLogs',
        ]);

        $serviceNames = $appointment->treatmentTypes
            ->pluck('type_name')
            ->filter()
            ->unique()
            ->values();

        if ($serviceNames->isEmpty() && $appointment->treatmentType?->type_name) {
            $serviceNames = collect([$appointment->treatmentType->type_name]);
        }

        $servicesByAnimalId = [];
        foreach ($appointment->bookingServices as $bookingService) {
            $animalId = $bookingService->animal_id;
            $name = $bookingService->service?->type_name;
            if (!$animalId || !$name) {
                continue;
            }
            $servicesByAnimalId[$animalId] ??= [];
            if (!in_array($name, $servicesByAnimalId[$animalId], true)) {
                $servicesByAnimalId[$animalId][] = $name;
            }
        }

        $legacySharedServices = $appointment->bookingServices
            ->filter(fn ($row) => empty($row->animal_id))
            ->map(fn ($row) => $row->service?->type_name)
            ->filter()
            ->unique()
            ->values()
            ->all();

        $bookedPets = $appointment->resolvedAnimals()
            ->map(function (Animal $animal) use ($appointment, $servicesByAnimalId, $legacySharedServices, $serviceNames) {
                $petServices = $servicesByAnimalId[$animal->id] ?? [];
                if ($petServices === [] && $legacySharedServices !== []) {
                    $petServices = $legacySharedServices;
                }
                if ($petServices === []) {
                    $petServices = $serviceNames->all();
                }

                $bookingStatus = $animal->pivot?->status
                    ?? (in_array($appointment->status, ['cancelled', 'pending'], true)
                        ? $appointment->status
                        : 'approved');

                return [
                    'id' => $animal->id,
                    'pet_name' => $animal->pet_name,
                    'species_name' => $animal->species?->species_name ?? null,
                    'breed_name' => $animal->breed?->breed_name ?? null,
                    'registration_status' => $animal->registration_status,
                    'services' => array_values($petServices),
                    'status' => $bookingStatus,
                    'cancellation_reason' => $animal->pivot?->cancellation_reason ?? null,
                ];
            })
            ->values()
            ->all();

        $petNames = collect($bookedPets)->pluck('pet_name')->filter()->values();
        $statusSummary = BookingAnimalStatusService::summaryLabel($appointment);

        return [
            'id' => $appointment->id,
            'petName' => $petNames->isNotEmpty()
                ? $petNames->implode(', ')
                : ($appointment->animal?->pet_name ?? 'Unknown'),
            'petNames' => $petNames->all(),
            'bookedPets' => $bookedPets,
            'pets' => collect($bookedPets)->map(fn ($pet) => [
                'id' => $pet['id'],
                'pet_name' => $pet['pet_name'],
            ])->values()->all(),
            'service' => $serviceNames->first(),
            'services' => $serviceNames->all(),
            'date' => $appointment->booking_date->format('Y-m-d'),
            'date_formatted' => $appointment->booking_date->format('M d, Y'),
            'time' => self::formatDisplayTime($appointment->booking_time),
            'status' => $appointment->status,
            'status_summary' => $statusSummary,
            'notes' => $appointment->notes,
            'cancellation_reason' => $appointment->cancellation_reason,
            'status_message' => AppointmentClientNotificationService::buildStatusMessage($appointment),
            'created_at' => $appointment->created_at->format('Y-m-d H:i:s'),
            'updated_at' => $appointment->updated_at->format('Y-m-d H:i:s'),
            'booking_type' => $appointment->booking_type,
            'bookingType' => $appointment->booking_type,
            'booking_type_label' => BookingTypeLabel::label($appointment->booking_type),
            'bookingTypeLabel' => BookingTypeLabel::label($appointment->booking_type),
            'symptoms' => $appointment->symptoms?->map(function ($symptom) {
                return [
                    'name' => $symptom->name,
                    'days_count' => $symptom->pivot->days_count,
                    'notes' => $symptom->pivot->notes,
                ];
            }) ?? [],
            'isBitten' => $appointment->is_bitten ?? false,
            'biteDetails' => $appointment->bite_details,
            'isDoorToDoor' => $appointment->isHomeService(),
            'meetingLatitude' => $appointment->meeting_latitude,
            'meetingLongitude' => $appointment->meeting_longitude,
            'meetingPlaceLabel' => $appointment->isHomeService() ? 'MEETING PLACE' : null,
            'meetingPlacePhotoUrl' => $appointment->meeting_place_photo_url,
            'status_history' => AppointmentStatusLogService::formatHistoryForApi($appointment, 'client'),
        ];
    }

    // Diri i-format ang oras para ipakita sa client.
    private static function formatDisplayTime(?string $bookingTime): string
    {
        $normalized = \App\Support\BookingTimeHelper::normalizeToHi($bookingTime);
        if (!$normalized || $normalized === '00:00') {
            return '';
        }

        return date('g:i A', strtotime($normalized));
    }
}
