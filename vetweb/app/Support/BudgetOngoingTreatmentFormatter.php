<?php

namespace App\Support;

use App\Models\Animal;
use App\Models\Appointment;

class BudgetOngoingTreatmentFormatter
{
    // Diri i-format ang ongoing nga treatment para sa budget.
    public static function format(Appointment $appointment): array
    {
        $appointment->loadMissing([
            'animal.species',
            'animal.breed',
            'user',
            'treatmentType',
            'treatmentTypes',
            'bookingServices.service',
            'bookingMedicines.inventory.medicine.category',
            'bookingMedicines.medicine.category',
            'outsidePurchaseItems',
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

        $outsideItems = $appointment->outsidePurchaseItems
            ->map(fn ($item) => AdminAppointmentFormatter::formatOutsidePurchaseItem($item))
            ->unique(fn ($item) => mb_strtolower((string) $item['name']).'|'.$item['quantity'].'|'.mb_strtolower((string) $item['status']))
            ->values()
            ->all();

        $plannedItems = $appointment->bookingMedicines->map(function ($bookingMedicine) {
            $inventory = $bookingMedicine->inventory;
            $categoryName = $bookingMedicine->medicine?->category?->name
                ?? $inventory?->medicine?->category?->name;

            return [
                'animal_id' => $bookingMedicine->animal_id ? (int) $bookingMedicine->animal_id : null,
                'inventory_id' => $bookingMedicine->inventory_id,
                'medicine_name' => $bookingMedicine->medicine?->name ?? $inventory?->medicine?->name ?? 'Unknown Medicine',
                'category_name' => $categoryName,
                'quantity_used' => $bookingMedicine->quantity_used,
                'quantity_display' => QuantityFormatter::formatTreatmentDisplay($bookingMedicine, $inventory),
                'unit_name' => $bookingMedicine->unit_name,
                'dosage_ml' => $bookingMedicine->dosage_ml,
                'is_vial' => $inventory?->isVial() ?? false,
                'is_box' => $inventory?->isBox() ?? false,
            ];
        })->values()->all();

        $hasAssignedAnimalItems = collect($plannedItems)->contains(
            fn ($item) => ($item['animal_id'] ?? null) !== null
        );

        $bookedPets = $appointment->resolvedAnimals()
            ->map(function (Animal $animal) use ($appointment, $servicesByAnimalId, $legacySharedServices, $serviceNames, $plannedItems, $hasAssignedAnimalItems) {
                $petServices = $servicesByAnimalId[$animal->id] ?? [];
                if ($petServices === [] && $legacySharedServices !== []) {
                    $petServices = $legacySharedServices;
                }
                if ($petServices === []) {
                    $petServices = $serviceNames->all();
                }

                $petWeight = (float) ($animal->weight ?? 0);
                $petPlannedItems = $hasAssignedAnimalItems
                    ? collect($plannedItems)
                        ->filter(fn ($item) => (int) ($item['animal_id'] ?? 0) === (int) $animal->id)
                        ->map(fn ($item) => self::adjustPlannedItemForPetWeight($item, $petWeight))
                        ->values()
                        ->all()
                    : self::plannedItemsForPet($plannedItems, $petServices, $petWeight);

                return [
                    'id' => $animal->id,
                    'pet_name' => $animal->pet_name,
                    'species' => $animal->species?->species_name ?? $animal->species,
                    'breed' => $animal->breed?->breed_name ?? $animal->breed,
                    'registration_status' => $animal->registration_status,
                    'weight' => $animal->weight,
                    'administered_by' => TreatmentStaff::formatAdministeredByLabel(
                        $animal->pivot?->administered_by,
                        $appointment
                    ),
                    'services' => array_values($petServices),
                    'planned_items' => $petPlannedItems,
                ];
            })
            ->values()
            ->all();

        if (!$hasAssignedAnimalItems) {
            self::assignUnmatchedPlannedItems($bookedPets, $plannedItems);
        }

        $assignedInventoryIds = collect($bookedPets)
            ->flatMap(fn ($pet) => collect($pet['planned_items'] ?? [])->pluck('inventory_id'))
            ->unique()
            ->all();

        $unassignedPlannedItems = collect($plannedItems)
            ->filter(fn ($item) => !in_array($item['inventory_id'], $assignedInventoryIds, true))
            ->values()
            ->all();

        $primaryPet = $bookedPets[0] ?? null;
        $uniqueServices = collect($bookedPets)
            ->flatMap(fn ($pet) => $pet['services'] ?? [])
            ->filter()
            ->unique()
            ->values()
            ->all();

        $symptoms = [];
        try {
            $symptoms = \DB::table('booking_symptoms')
                ->join('symptoms', 'booking_symptoms.symptom_id', '=', 'symptoms.id')
                ->where('booking_symptoms.booking_id', $appointment->id)
                ->select('symptoms.name', 'booking_symptoms.days_count', 'booking_symptoms.notes')
                ->get()
                ->map(fn ($symptom) => [
                    'name' => $symptom->name,
                    'days_count' => $symptom->days_count,
                    'notes' => $symptom->notes,
                ])
                ->all();
        } catch (\Exception $e) {
            \Log::error('Error loading symptoms for appointment ' . $appointment->id . ': ' . $e->getMessage());
        }

        return [
            'id' => $appointment->id,
            'status' => $appointment->status,
            'pet_count' => count($bookedPets),
            'booked_pets' => $bookedPets,
            'user' => OwnerDisplayHelper::toAppointmentUserArray($appointment->user),
            'animal' => $primaryPet ? [
                'id' => $primaryPet['id'],
                'pet_name' => $primaryPet['pet_name'],
                'species' => $primaryPet['species'],
                'breed' => $primaryPet['breed'],
                'registration_status' => $primaryPet['registration_status'],
                'weight' => $primaryPet['weight'],
            ] : ($appointment->animal ? [
                'id' => $appointment->animal->id,
                'pet_name' => $appointment->animal->pet_name,
                'species' => $appointment->animal->species?->species_name ?? $appointment->animal->species,
                'breed' => $appointment->animal->breed?->breed_name ?? $appointment->animal->breed,
                'registration_status' => $appointment->animal->registration_status,
                'weight' => $appointment->animal->weight,
            ] : null),
            'treatment_type' => $appointment->treatmentType,
            'treatment_types' => $appointment->treatmentTypes,
            'service' => $uniqueServices[0] ?? $serviceNames->first(),
            'services' => $uniqueServices,
            'date' => $appointment->booking_date->format('Y-m-d'),
            'time' => $appointment->booking_time,
            'duration_minutes' => BookingTimeHelper::resolveDurationMinutes($appointment->duration_minutes),
            'notes' => $appointment->notes,
            'administered_by' => TreatmentStaff::formatAdministeredByLabel(
                $appointment->administered_by,
                $appointment
            ),
            'planned_items' => $plannedItems,
            'unassigned_planned_items' => $unassignedPlannedItems,
            'outside_items' => $outsideItems,
            'symptoms' => $symptoms,
            'is_bitten' => $appointment->is_bitten ?? false,
            'bite_details' => $appointment->bite_details,
            'created_at' => $appointment->created_at->format('Y-m-d H:i:s'),
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $plannedItems
     * @param  list<string>  $petServices
     * @return list<array<string, mixed>>
     */
    // Diri kuhaon ang planned nga tambal sa hayop.
    private static function plannedItemsForPet(array $plannedItems, array $petServices, float $petWeight): array
    {
        return collect($plannedItems)
            ->filter(fn ($item) => ServiceInventoryCategories::itemMatchesServices(
                $item['category_name'] ?? null,
                $petServices
            ))
            ->map(fn ($item) => self::adjustPlannedItemForPetWeight($item, $petWeight))
            ->values()
            ->all();
    }

    /**
     * @param  list<array<string, mixed>>  $bookedPets
     * @param  list<array<string, mixed>>  $plannedItems
     */
    // Diri i-assign ang planned nga tambal nga walay tag-iya.
    private static function assignUnmatchedPlannedItems(array &$bookedPets, array $plannedItems): void
    {
        if ($bookedPets === [] || $plannedItems === []) {
            return;
        }

        $assignedInventoryIds = collect($bookedPets)
            ->flatMap(fn ($pet) => collect($pet['planned_items'] ?? [])->pluck('inventory_id'))
            ->unique()
            ->all();

        $unmatched = collect($plannedItems)
            ->filter(fn ($item) => !in_array($item['inventory_id'], $assignedInventoryIds, true))
            ->values()
            ->all();

        if ($unmatched === []) {
            return;
        }

        $treatmentPetIndexes = [];
        foreach ($bookedPets as $index => $pet) {
            if (ServiceInventoryCategories::petHasTreatmentService($pet['services'] ?? [])) {
                $treatmentPetIndexes[] = $index;
            }
        }

        $targetIndexes = $treatmentPetIndexes !== []
            ? $treatmentPetIndexes
            : (count($bookedPets) === 1 ? [0] : []);

        foreach ($targetIndexes as $index) {
            $petWeight = (float) ($bookedPets[$index]['weight'] ?? 0);
            foreach ($unmatched as $item) {
                $bookedPets[$index]['planned_items'][] = self::adjustPlannedItemForPetWeight($item, $petWeight);
            }
        }
    }

    /**
     * @param  array<string, mixed>  $item
     * @return array<string, mixed>
     */
    // Diri i-adjust ang tambal base sa timbang sa hayop.
    private static function adjustPlannedItemForPetWeight(array $item, float $petWeight): array
    {
        if (empty($item['is_vial']) || $petWeight <= 0) {
            return $item;
        }

        $dosageMl = round($petWeight * 0.10, 2);
        $item['dosage_ml'] = $dosageMl;
        $item['quantity_display'] = QuantityFormatter::format($dosageMl, 2) . ' ml';

        return $item;
    }
}
