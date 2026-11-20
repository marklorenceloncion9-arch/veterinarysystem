<?php

namespace App\Support;

use App\Models\Animal;
use App\Models\OutsidePurchaseItem;
use App\Models\Appointment;
use App\Services\AppointmentStatusLogService;
use App\Services\BookingAnimalStatusService;
use App\Support\OwnerDisplayHelper;
use Carbon\Carbon;

class AdminAppointmentFormatter
{
    // Diri i-format ang appointment para sa admin.
    public static function format(Appointment $appointment): array
    {
        $appointment->loadMissing([
            'user.barangay',
            'assignedFieldmen',
            'animal.species',
            'animal.breed',
            'treatmentTypes',
            'treatmentType',
            'bookingServices.service',
            'bookingMedicines.inventory.medicine',
            'bookingMedicines.medicine',
            'outsidePurchaseItems',
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

        // Legacy rows without animal_id: apply shared services to every pet.
        $legacySharedServices = $appointment->bookingServices
            ->filter(fn ($row) => empty($row->animal_id))
            ->map(fn ($row) => $row->service?->type_name)
            ->filter()
            ->unique()
            ->values()
            ->all();

        $allTreatmentItems = $appointment->bookingMedicines
            ->map(fn ($bookingMedicine) => self::formatTreatmentItem($bookingMedicine))
            ->values()
            ->all();

        $outsidePurchaseItems = $appointment->outsidePurchaseItems
            ->map(fn ($item) => self::formatOutsidePurchaseItem($item))
            ->values()
            ->all();

        $pets = $appointment->resolvedAnimals()
            ->map(function (Animal $animal) use ($appointment, $servicesByAnimalId, $legacySharedServices, $serviceNames, $allTreatmentItems, $outsidePurchaseItems) {
                $pet = self::formatPet($animal);
                $petServices = $servicesByAnimalId[$animal->id] ?? [];
                if (empty($petServices) && !empty($legacySharedServices)) {
                    $petServices = $legacySharedServices;
                }
                if (empty($petServices)) {
                    $petServices = $serviceNames->all();
                }
                $pet['services'] = array_values($petServices);
                $pet['booking_status'] = $animal->pivot?->status
                    ?? (in_array($appointment->status, ['cancelled', 'pending'], true)
                        ? $appointment->status
                        : 'approved');
                $pet['cancellation_reason'] = $animal->pivot?->cancellation_reason ?? null;
                $pet['administered_by'] = self::resolveAdministeredByLabel(
                    $animal->pivot?->administered_by,
                    $appointment
                );
                $pet['treatment_items'] = collect($allTreatmentItems)
                    ->filter(fn ($item) => (int) ($item['animal_id'] ?? 0) === (int) $animal->id)
                    ->values()
                    ->all();
                $pet['outside_purchase_items'] = collect($outsidePurchaseItems)
                    ->filter(fn ($item) => (int) ($item['animal_id'] ?? 0) === (int) $animal->id)
                    ->values()
                    ->all();
                return $pet;
            })
            ->values()
            ->all();

        $primaryPet = $pets[0] ?? ($appointment->animal ? self::formatPet($appointment->animal) : null);
        $statusSummary = BookingAnimalStatusService::summaryLabel($appointment);

        return [
            'id' => $appointment->id,
            'status' => $appointment->status,
            'status_summary' => $statusSummary,
            'booking_type' => $appointment->booking_type,
            'user' => OwnerDisplayHelper::toAppointmentUserArray($appointment->user),
            'pet' => $primaryPet,
            'pets' => $pets,
            'service' => $serviceNames->first(),
            'services' => $serviceNames->toArray(),
            'date' => $appointment->booking_date->format('Y-m-d'),
            'time' => $appointment->booking_time,
            'duration_minutes' => BookingTimeHelper::resolveDurationMinutes($appointment->duration_minutes),
            'is_door_to_door' => $appointment->isHomeService(),
            'meeting_latitude' => $appointment->meeting_latitude,
            'meeting_longitude' => $appointment->meeting_longitude,
            'meeting_place_label' => $appointment->isHomeService() ? 'MEETING PLACE' : null,
            'meeting_place_photo_url' => $appointment->meeting_place_photo_url,
            'assigned_fieldman_ids' => $appointment->assignedFieldmen
                ->pluck('id')
                ->map(fn ($id) => (int) $id)
                ->values()
                ->all(),
            'assigned_fieldmen' => $appointment->assignedFieldmen->map(function ($fieldman) {
                return [
                    'id' => $fieldman->id,
                    'name' => trim(implode(' ', array_filter([
                        $fieldman->firstname,
                        $fieldman->lastname,
                    ]))) ?: $fieldman->name,
                    'email' => $fieldman->email,
                ];
            })->values()->all(),
            'notes' => $appointment->notes,
            'cancellation_reason' => $appointment->cancellation_reason,
            'administered_by' => self::resolveAdministeredByLabel(
                $appointment->administered_by,
                $appointment
            ),
            'complaint' => [
                'is_bitten' => $appointment->is_bitten ?? false,
                'bite_details' => $appointment->bite_details,
                'symptoms' => $appointment->symptoms?->map(function ($symptom) {
                    return [
                        'name' => $symptom->name,
                        'days_count' => $symptom->pivot->days_count ?? 0,
                        'notes' => $symptom->pivot->notes,
                    ];
                }) ?? [],
            ],
            'treatment_items' => $allTreatmentItems,
            'outside_purchase_items' => $outsidePurchaseItems,
            'created_at' => $appointment->created_at->format('Y-m-d H:i:s'),
            'updated_at' => $appointment->updated_at->format('Y-m-d H:i:s'),
            'status_history' => AppointmentStatusLogService::formatHistoryForApi($appointment),
        ];
    }

    // Diri kuhaon ang label kinsa ang nagtambal.
    public static function resolveAdministeredByLabel(?string $stored, Appointment $appointment): ?string
    {
        $formatted = TreatmentStaff::formatAdministeredByLabel($stored, $appointment);
        if ($formatted) {
            return $formatted;
        }

        $appointment->loadMissing('assignedFieldmen');
        $names = $appointment->assignedFieldmen
            ->map(fn ($fieldman) => TreatmentStaff::displayName($fieldman))
            ->filter()
            ->unique()
            ->values();

        if ($names->isEmpty()) {
            return null;
        }

        if ($names->count() === 1) {
            return TreatmentStaff::formatAdministeredByLabel($names->first(), $appointment);
        }

        return $names->implode(', ');
    }

    // Diri i-format ang hayop para sa admin.
    public static function formatPet(Animal $animal): array
    {
        return [
            'id' => $animal->id,
            'name' => $animal->pet_name,
            'pet_name' => $animal->pet_name,
            'identification_number' => $animal->identification_number,
            'species' => $animal->species?->species_name ?? $animal->species,
            'breed' => $animal->breed?->breed_name ?? $animal->breed,
            'registration_status' => $animal->registration_status,
            'color' => $animal->color,
            'weight' => self::formatDecimal($animal->weight),
            'age' => self::formatPetAge($animal->birthdate),
            'birthdate' => $animal->birthdate
                ? Carbon::parse($animal->birthdate)->format('Y-m-d')
                : null,
            'sex' => $animal->sex,
            'markings' => $animal->markings,
            'pet_photo_url' => $animal->pet_photo_url,
            'markings_photo_url' => $animal->markings_photo_url,
            'services' => [],
            'administered_by' => null,
            'treatment_items' => [],
        ];
    }

    // Diri i-format ang usa ka tambal sa treatment.
    public static function formatTreatmentItem($bookingMedicine): array
    {
        $inventory = $bookingMedicine->inventory;
        $medicine = $bookingMedicine->medicine;

        return [
            'animal_id' => $bookingMedicine->animal_id ? (int) $bookingMedicine->animal_id : null,
            'medicine_name' => $medicine?->name ?? 'Unknown Medicine',
            'quantity_used' => QuantityFormatter::formatTreatmentDisplay($bookingMedicine, $inventory),
            'unit_name' => $bookingMedicine->unit_name,
        ];
    }

    // Diri i-format ang tambal nga paliton sa gawas.
    public static function formatOutsidePurchaseItem($item): array
    {
        return [
            'animal_id' => $item->animal_id ? (int) $item->animal_id : null,
            'name' => $item->item_name,
            'quantity' => self::formatDecimal($item->quantity),
            'status' => OutsidePurchaseItem::displayStatus($item->status),
            'issued_at' => $item->issued_at?->toIso8601String(),
        ];
    }

    // Diri i-format ang decimal nga numero.
    private static function formatDecimal($value): int|float|null
    {
        if ($value === null || $value === '') {
            return null;
        }

        $num = (float) $value;

        return fmod($num, 1.0) === 0.0 ? (int) round($num) : round($num, 2);
    }

    // Diri kuwentahon ang edad sa hayop gikan sa birthdate.
    public static function formatPetAge(?string $birthdate): ?string
    {
        if (!$birthdate) {
            return null;
        }

        try {
            $birthDate = Carbon::parse($birthdate);
            $now = Carbon::now();

            if (!$birthDate->isPast()) {
                return 'Not born yet';
            }

            $years = (int) $birthDate->diffInYears($now);
            $months = (int) $birthDate->diffInMonths($now) % 12;

            if ($years === 0) {
                if ($months === 0) {
                    $days = (int) $birthDate->diffInDays($now);
                    return $days . ' day' . ($days !== 1 ? 's' : '') . ' old';
                }

                return $months . ' month' . ($months !== 1 ? 's' : '') . ' old';
            }

            return $years . ' year' . ($years !== 1 ? 's' : '') . ' old';
        } catch (\Exception $e) {
            return 'Unknown';
        }
    }
}
