<?php

namespace App\Services;

use App\Models\Inventory;
use App\Models\InventoryLog;
use App\Services\InventoryAlertNotificationService;

class InventoryDeductionService
{
    /**
     * Deduct stock using FIFO — oldest added batch first (created_at ASC).
     *
     * @return array{
     *     medicine_id: int,
     *     primary_inventory_id: int,
     *     quantity_used: float,
     *     unit_name: string,
     *     dosage_ml: float|null,
     *     deductions: array<int, array{inventory_id: int, log_qty: float, unit_name: string}>
     * }
     */
    // Diri kuhaon ang tambal gikan sa kinaunhang batch.
    public static function deductFifo(
        int $medicineId,
        float $requestedQty,
        ?float $petWeightKg,
        int $bookingId,
        string $reason = InventoryLog::REASON_USED,
        ?int $animalId = null
    ): array {
        $batches = Inventory::with(['medicine', 'unit'])
            ->availableForUse()
            ->where('medicine_id', $medicineId)
            ->orderBy('created_at', 'asc')
            ->lockForUpdate()
            ->get();

        if ($batches->isEmpty()) {
            $name = Inventory::with('medicine')->where('medicine_id', $medicineId)->first()?->medicine?->name ?? 'Medicine';
            throw new \Exception("No stock available for {$name}.");
        }

        $reference = $batches->first();
        $deductions = [];

        if ($reference->isBox() && (float) $reference->items_per_box > 0) {
            $result = self::deductBoxItems($batches, (float) $requestedQty, $bookingId, $reason, $animalId);
        } elseif ($reference->isVial()) {
            if ($petWeightKg !== null && $petWeightKg > 0) {
                // Treatment flow: dose from pet weight (ml), then FIFO across vials.
                $result = self::deductVialDosage($batches, $petWeightKg, $bookingId, $reason, $animalId);
            } else {
                // Planned qty is already in ml (from handoff). Convert ml → vial units via FIFO.
                $result = self::deductVialMl($batches, (float) $requestedQty, $bookingId, $reason, $animalId);
            }
        } else {
            $result = self::deductUnits($batches, (float) $requestedQty, $bookingId, $reason, $reference->unit?->name ?? 'unit', $animalId);
        }

        InventoryAlertNotificationService::scanMedicine($medicineId);

        return [
            'medicine_id' => $medicineId,
            'primary_inventory_id' => $result['primary_inventory_id'],
            'quantity_used' => $result['quantity_used'],
            'unit_name' => $result['unit_name'],
            'dosage_ml' => $result['dosage_ml'],
            'deductions' => $result['deductions'],
        ];
    }

    // Diri ibawas ang units sa tambal sa mga batch.
    private static function deductUnits($batches, float $unitsNeeded, int $bookingId, string $reason, string $unitName, ?int $animalId = null): array
    {
        $remaining = $unitsNeeded;
        $deductions = [];
        $primaryId = null;

        foreach ($batches as $batch) {
            if ($remaining <= 0) {
                break;
            }

            $available = (float) $batch->quantity;
            if ($available <= 0) {
                continue;
            }

            $take = min($remaining, $available);
            $batch->quantity = $available - $take;
            $batch->save();

            self::logOut($batch, $take, $bookingId, $reason, $animalId);
            $deductions[] = ['inventory_id' => $batch->id, 'log_qty' => $take, 'unit_name' => $unitName];
            $primaryId ??= $batch->id;
            $remaining -= $take;
        }

        if ($remaining > 0) {
            $name = $batches->first()->medicine?->name ?? 'Medicine';
            throw new \Exception("Insufficient stock for {$name}.");
        }

        return [
            'primary_inventory_id' => $primaryId,
            'quantity_used' => $unitsNeeded,
            'unit_name' => $unitName,
            'dosage_ml' => null,
            'deductions' => $deductions,
        ];
    }

    // Diri ibawas ang items sa box nga tambal.
    private static function deductBoxItems($batches, float $itemsNeeded, int $bookingId, string $reason, ?int $animalId = null): array
    {
        $remaining = $itemsNeeded;
        $deductions = [];
        $primaryId = null;

        foreach ($batches as $batch) {
            if ($remaining <= 0) {
                break;
            }

            $itemsPerBox = (float) $batch->items_per_box;
            if ($itemsPerBox <= 0) {
                continue;
            }

            $availableItems = (float) $batch->quantity * $itemsPerBox;
            if ($availableItems <= 0) {
                continue;
            }

            $take = min($remaining, $availableItems);
            $remainingItems = $availableItems - $take;
            $batch->quantity = $remainingItems > 0 ? $remainingItems / $itemsPerBox : 0;
            $batch->save();

            self::logOut($batch, $take, $bookingId, $reason, $animalId);
            $deductions[] = ['inventory_id' => $batch->id, 'log_qty' => $take, 'unit_name' => 'items'];
            $primaryId ??= $batch->id;
            $remaining -= $take;
        }

        if ($remaining > 0) {
            $name = $batches->first()->medicine?->name ?? 'Medicine';
            throw new \Exception("Insufficient items in boxes for {$name}.");
        }

        return [
            'primary_inventory_id' => $primaryId,
            'quantity_used' => $itemsNeeded,
            'unit_name' => 'items',
            'dosage_ml' => null,
            'deductions' => $deductions,
        ];
    }

    // Diri ibawas ang vial base sa timbang sa hayop.
    private static function deductVialDosage($batches, float $petWeightKg, int $bookingId, string $reason, ?int $animalId = null): array
    {
        $dosageMl = round($petWeightKg * 0.10, 2);

        return self::deductVialMl($batches, $dosageMl, $bookingId, $reason, $animalId);
    }

    // Diri ibawas ang ml sa vial sa mga batch.
    private static function deductVialMl($batches, float $dosageMl, int $bookingId, string $reason, ?int $animalId = null): array
    {
        $remainingMl = $dosageMl;
        $deductions = [];
        $primaryId = null;

        foreach ($batches as $batch) {
            if ($remainingMl <= 0) {
                break;
            }

            $volumePerVial = (float) $batch->volume_ml;
            if ($volumePerVial <= 0) {
                throw new \Exception("Volume (ml) is required for vial item {$batch->medicine?->name}.");
            }

            $availableMl = (float) $batch->quantity * $volumePerVial;
            if ($availableMl <= 0) {
                continue;
            }

            $takeMl = min($remainingMl, $availableMl);
            $deductVials = round($takeMl / $volumePerVial, 3);
            $batch->quantity = max(0, (float) $batch->quantity - $deductVials);
            $batch->save();

            self::logOut($batch, $takeMl, $bookingId, $reason, $animalId);
            $deductions[] = ['inventory_id' => $batch->id, 'log_qty' => $takeMl, 'unit_name' => 'ml'];
            $primaryId ??= $batch->id;
            $remainingMl -= $takeMl;
        }

        if ($remainingMl > 0.001) {
            $name = $batches->first()->medicine?->name ?? 'Medicine';
            throw new \Exception("Insufficient stock for {$name}.");
        }

        return [
            'primary_inventory_id' => $primaryId,
            'quantity_used' => $dosageMl,
            'unit_name' => 'ml',
            'dosage_ml' => $dosageMl,
            'deductions' => $deductions,
        ];
    }

    // Diri i-log ang stock out sa batch.
    private static function logOut(Inventory $batch, float $qty, int $bookingId, string $reason, ?int $animalId = null): void
    {
        InventoryLog::create([
            'medicine_id' => $batch->medicine_id,
            'inventory_id' => $batch->id,
            'booking_id' => $bookingId,
            'animal_id' => $animalId,
            'change_qty' => -$qty,
            'type' => 'OUT',
            'reason' => $reason,
        ]);
    }

    /**
     * Resolve the oldest available batch for a medicine (for planning records).
     */
    // Diri kuhaon ang kinaunhang batch nga naay stock.
    public static function oldestBatch(int $medicineId): ?Inventory
    {
        return Inventory::availableForUse()
            ->where('medicine_id', $medicineId)
            ->orderBy('created_at', 'asc')
            ->first();
    }

    /**
     * Deduct on-hand quantity using the same FIFO rule as budget officer treatment:
     * oldest usable batch first (created_at ASC). Quantity is in inventory units
     * (vials / boxes / units). Logs stay consistent with stock-out: items for boxes, ml for vials.
     *
     * @return array{primary_inventory: Inventory, log: InventoryLog}
     */
    // Diri ibawas ang quantity sunod sa FIFO.
    public static function deductQuantityFifo(
        int $medicineId,
        float $quantity,
        string $reason = InventoryLog::REASON_DAMAGED
    ): array {
        $batches = Inventory::with(['medicine', 'unit'])
            ->availableForUse()
            ->where('medicine_id', $medicineId)
            ->orderBy('created_at', 'asc')
            ->lockForUpdate()
            ->get();

        if ($batches->isEmpty()) {
            $name = Inventory::with('medicine')->where('medicine_id', $medicineId)->first()?->medicine?->name ?? 'Medicine';
            throw new \Exception("No stock available for {$name}.");
        }

        $remaining = $quantity;
        $primary = null;
        $firstLog = null;

        foreach ($batches as $batch) {
            if ($remaining <= 0.0000001) {
                break;
            }

            $available = (float) $batch->quantity;
            if ($available <= 0) {
                continue;
            }

            $take = min($remaining, $available);
            $logQty = $take;
            if ($batch->isBox() && $batch->items_per_box > 0) {
                $logQty = $take * (float) $batch->items_per_box;
            } elseif ($batch->isVial() && (float) $batch->volume_ml > 0) {
                $logQty = round($take * (float) $batch->volume_ml, 2);
            }

            $batch->quantity = $available - $take;
            $batch->save();

            $log = InventoryLog::create([
                'medicine_id' => $batch->medicine_id,
                'inventory_id' => $batch->id,
                'change_qty' => -$logQty,
                'type' => 'OUT',
                'reason' => $reason,
            ]);

            $primary ??= $batch;
            $firstLog ??= $log;
            $remaining -= $take;
        }

        if ($remaining > 0.0000001 || !$primary || !$firstLog) {
            $name = $batches->first()->medicine?->name ?? 'Medicine';
            throw new \Exception("Insufficient stock for {$name}.");
        }

        InventoryAlertNotificationService::scanMedicine($medicineId);

        return [
            'primary_inventory' => $primary,
            'log' => $firstLog,
        ];
    }
}
