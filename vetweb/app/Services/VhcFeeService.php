<?php

namespace App\Services;

use App\Models\AnimalType;
use App\Models\PaymentType;
use App\Models\RevenueHistory;
use App\Models\Species;
use App\Models\SpeciesVhcFeeHistory;
use Carbon\Carbon;

class VhcFeeService
{
    // Diri kuhaon ang VHC fees sa petsa.
    public function getFees(?Carbon $date = null): array
    {
        $date = $date ?? now();

        return [
            'certificate' => $this->getFeeForType('vhc_certificate', $date),
            'livestock' => $this->getFeeForType('vhc_livestock', $date),
            'poultry' => $this->getFeeForType('vhc_poultry', $date),
        ];
    }

    // Diri kuhaon ang VHC species nga gi-grupo.
    public function getVhcSpeciesGrouped(): array
    {
        $livestockTypeId = AnimalType::where('type_name', 'Livestock')->value('id');
        $poultryTypeId = AnimalType::where('type_name', 'Poultry')->value('id');

        $query = Species::with('animalType')
            ->whereIn('type_id', array_filter([$livestockTypeId, $poultryTypeId]))
            ->orderBy('species_name');

        $species = $query->get();

        return [
            'livestock' => $species->where('type_id', $livestockTypeId)->values(),
            'poultry' => $species->where('type_id', $poultryTypeId)->values(),
        ];
    }

    /**
     * @param  array<int, array{species_id: int, male_count: int, female_count: int}>  $livestockEntries
     */
    // Diri kuwentahon ang total nga bayad sa VHC.
    public function calculateAmount(array $livestockEntries, ?Carbon $date = null): float
    {
        $date = $date ?? now();
        $typeFees = $this->getFees($date);
        $total = (float) $typeFees['certificate'];

        if (empty($livestockEntries)) {
            return round($total, 2);
        }

        $speciesIds = collect($livestockEntries)->pluck('species_id')->filter()->unique()->values();
        $speciesById = Species::with('animalType')
            ->whereIn('id', $speciesIds)
            ->get()
            ->keyBy('id');

        foreach ($livestockEntries as $entry) {
            $species = $speciesById->get($entry['species_id'] ?? null);
            if (!$species) {
                continue;
            }

            $headCount = (int) ($entry['male_count'] ?? 0) + (int) ($entry['female_count'] ?? 0);
            $total += $headCount * $this->getSpeciesFee($species, $typeFees, $date);
        }

        return round($total, 2);
    }

    // Diri kuhaon ang VHC fee sa usa ka species.
    public function getSpeciesFee(Species $species, ?array $typeFees = null, ?Carbon $date = null): float
    {
        $date = $date ?? now();
        $typeFees = $typeFees ?? $this->getFees($date);

        $historyFee = SpeciesVhcFeeHistory::where('species_id', $species->id)
            ->where('effective_date', '<=', $date)
            ->orderBy('effective_date', 'desc')
            ->orderBy('id', 'desc')
            ->first();

        if ($historyFee) {
            return (float) $historyFee->new_amount;
        }

        $futureHistory = SpeciesVhcFeeHistory::where('species_id', $species->id)
            ->where('effective_date', '>', $date)
            ->orderBy('effective_date', 'asc')
            ->first();

        if ($futureHistory) {
            return (float) $futureHistory->old_amount;
        }

        if ($species->vhc_fee !== null && (float) $species->vhc_fee > 0) {
            return (float) $species->vhc_fee;
        }

        $typeName = $species->animalType?->type_name;

        if ($typeName === 'Livestock') {
            return (float) $typeFees['livestock'];
        }

        if ($typeName === 'Poultry') {
            return (float) $typeFees['poultry'];
        }

        return 0;
    }

    // Diri kuhaon ang bayad sa payment type sa petsa.
    private function getFeeForType(string $paymentType, Carbon $date): float
    {
        $type = PaymentType::where('payment_type', $paymentType)->first();

        if (!$type) {
            return 0;
        }

        $historyEntry = RevenueHistory::where('payment_type_id', $type->id)
            ->where('effective_date', '<=', $date)
            ->orderBy('effective_date', 'desc')
            ->orderBy('id', 'desc')
            ->first();

        if ($historyEntry) {
            return (float) $historyEntry->new_amount;
        }

        $futureHistory = RevenueHistory::where('payment_type_id', $type->id)
            ->where('effective_date', '>', $date)
            ->orderBy('effective_date', 'asc')
            ->first();

        if ($futureHistory) {
            return (float) $futureHistory->old_amount;
        }

        return (float) $type->amount;
    }
}
