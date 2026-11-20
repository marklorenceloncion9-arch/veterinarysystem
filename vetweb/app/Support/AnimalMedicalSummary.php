<?php

namespace App\Support;

use App\Models\Animal;
use App\Models\Appointment;
use Illuminate\Support\Collection;

class AnimalMedicalSummary
{
    // Diri himuon ang medical summary sa hayop.
    public static function forAnimal(Animal $animal, int $historyLimit = 8): array
    {
        $fullHistory = self::buildHistory($animal);
        $history = $fullHistory->take($historyLimit)->values();
        $lastService = $history->first();

        return [
            'medical_profile' => self::buildMedicalProfile($animal),
            'last_service' => $lastService ? [
                'service_type' => $lastService['service_type'],
                'date' => $lastService['treatment_date'] ?? $lastService['created_at'],
                'administered_by' => $lastService['administered_by'],
            ] : null,
            'history' => $history->all(),
            'history_count' => $fullHistory->count(),
        ];
    }

    /**
     * Pet treatment history from completed bookings and the medicines actually used.
     */
    // Diri himuon ang treatment history sa hayop.
    public static function buildHistory(Animal $animal): Collection
    {
        try {
            $animalId = (int) $animal->id;
            $bookings = Appointment::where('status', '!=', 'cancelled')
                ->where(function ($query) use ($animalId) {
                    $query->where(function ($visit) use ($animalId) {
                        $visit->whereIn('status', ['processing', 'ongoing', 'completed'])
                            ->where(function ($match) use ($animalId) {
                                $match->where('animal_id', $animalId)
                                    ->orWhereHas('bookingMedicines', fn ($medicines) => $medicines->where('animal_id', $animalId))
                                    ->orWhereJsonContains('booked_animals', ['animal_id' => $animalId]);
                            });
                    })->orWhereHas('outsidePurchaseItems', fn ($items) => $items->where('animal_id', $animalId));
                })
                ->with([
                    'treatmentTypes',
                    'bookingServices.service',
                    'bookingMedicines.medicine',
                    'outsidePurchaseItems',
                ])
                ->orderByDesc('booking_date')
                ->orderByDesc('created_at')
                ->get();
        } catch (\Exception $e) {
            \Log::error('Error fetching booking history: ' . $e->getMessage());
            $bookings = collect();
        }

        return $bookings->map(function (Appointment $booking) use ($animal) {
            $animalId = (int) $animal->id;
            $entry = collect($booking->bookedAnimalEntries())
                ->first(fn ($row) => (int) ($row['animal_id'] ?? 0) === $animalId);

            $petServices = $booking->bookingServices
                ->filter(fn ($row) => (int) ($row->animal_id ?? 0) === $animalId)
                ->map(fn ($row) => $row->service?->type_name)
                ->filter()
                ->unique()
                ->values();

            if ($petServices->isEmpty()) {
                $petServices = $booking->treatmentTypes->pluck('type_name')->filter()->unique()->values();
            }

            $medicines = $booking->bookingMedicines
                ->filter(function ($bm) use ($booking, $animalId) {
                    if ($bm->animal_id === null) {
                        return (int) $booking->animal_id === $animalId;
                    }

                    return (int) $bm->animal_id === $animalId;
                })
                ->map(function ($bm) {
                    return [
                        'id' => $bm->id,
                        'medicine_name' => $bm->medicine?->name ?? 'Unknown medicine',
                        'quantity' => QuantityFormatter::format($bm->quantity_used ?? $bm->quantity),
                        'unit' => $bm->unit_name ?? $bm->unit?->name,
                    ];
                })
                ->values();

            $outsideItems = $booking->outsidePurchaseItems
                ->filter(fn ($item) => (int) ($item->animal_id ?? 0) === $animalId)
                ->map(function ($item) {
                    return [
                        'id' => $item->id,
                        'name' => $item->item_name,
                        'quantity' => QuantityFormatter::format($item->quantity),
                        'status' => \App\Models\OutsidePurchaseItem::displayStatus($item->status),
                        'issued_at' => $item->issued_at?->toDateTimeString(),
                    ];
                })
                ->unique(fn ($item) => mb_strtolower((string) $item['name']).'|'.$item['quantity'].'|'.mb_strtolower((string) $item['status']))
                ->values();

            return [
                'id' => $booking->id,
                'service_type' => $petServices->join(', ') ?: 'Treatment',
                'booking_type' => $booking->booking_type,
                'booking_type_label' => match ($booking->booking_type) {
                    'home_service' => 'Home service',
                    'appointment' => 'Appointment',
                    'walk_in' => 'Walk-in',
                    default => null,
                },
                'treatment_date' => $booking->booking_date?->format('Y-m-d'),
                'treatment_time' => self::formatTreatmentTime($booking->booking_time),
                'created_at' => $booking->created_at?->toDateTimeString(),
                'administered_by' => $entry['administered_by'] ?? $booking->administered_by,
                'notes' => $booking->notes,
                'medicines' => $medicines,
                'outside_items' => $outsideItems,
            ];
        });
    }

    // Diri i-format ang oras sa treatment.
    private static function formatTreatmentTime(mixed $bookingTime): ?string
    {
        $normalized = BookingTimeHelper::normalizeToHi(is_string($bookingTime) ? $bookingTime : (string) ($bookingTime ?? ''));
        if (!$normalized || $normalized === '00:00') {
            return null;
        }

        return date('g:i A', strtotime($normalized));
    }

    // Diri himuon ang medical profile sa hayop.
    public static function buildMedicalProfile(Animal $animal): array
    {
        return [
            'reproductive_status' => $animal->reproductive_status,
            'weeks_months' => $animal->weeks_months,
            'diet' => $animal->diet,
            'diet_other' => $animal->diet_other,
            'dewormed' => $animal->dewormed,
            'last_deworming_date' => $animal->last_deworming_date?->format('Y-m-d'),
            'dewormer_name' => $animal->dewormer_name,
            'rabies_vaccine' => $animal->rabies_vaccine,
            'rabies_last_vaccination' => $animal->rabies_last_vaccination?->format('Y-m-d'),
            'rabies_dose_type' => $animal->rabies_dose_type,
            'rabies_valid_until' => $animal->rabies_valid_until,
            'dhppl_vaccine' => $animal->dhppl_vaccine,
            'dhppl_last_vaccination' => $animal->dhppl_last_vaccination?->format('Y-m-d'),
            'dhppl_dose_type' => $animal->dhppl_dose_type,
            'dhppl_valid_until' => $animal->dhppl_valid_until,
            'other_vaccine_name' => $animal->other_vaccine_name,
            'other_vaccine_last_vaccination' => $animal->other_vaccine_last_vaccination?->format('Y-m-d'),
            'other_vaccine_dose_type' => $animal->other_vaccine_dose_type,
            'other_vaccine_valid_until' => $animal->other_vaccine_valid_until,
        ];
    }
}
