<?php

namespace App\Models;

use App\Support\InventoryAlertHelper;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Inventory extends Model
{
    use HasFactory;

    protected $table = 'inventory';

    protected $fillable = [
        'medicine_id',
        'batch_number',
        'quantity',
        'unit_id',
        'expiration_date',
        'volume_ml',
        'items_per_box'
    ];

    protected $casts = [
        'expiration_date' => 'date',
        'quantity' => 'decimal:3',
        'volume_ml' => 'decimal:2'
    ];

    // Diri ang tambal sa inventory batch.
    public function medicine()
    {
        return $this->belongsTo(Medicine::class);
    }

    // Diri ang unit sa inventory batch.
    public function unit()
    {
        return $this->belongsTo(Unit::class);
    }

    // Diri susihon kung box ang unit.
    public function isBox()
    {
        $unitName = strtolower(trim((string) ($this->unit?->name ?? '')));
        return in_array($unitName, ['box', 'boxes'], true);
    }

    // Diri susihon kung capsule o tablet ang unit.
    public function isCapsuleOrTablet()
    {
        $unitName = strtolower(trim((string) ($this->unit?->name ?? '')));
        return in_array($unitName, ['capsule', 'capsules', 'tablet', 'tablets'], true);
    }

    // Diri susihon kung vial ang unit.
    public function isVial()
    {
        $unitName = strtolower(trim((string) ($this->unit?->name ?? '')));
        return in_array($unitName, ['vial', 'vials'], true);
    }

    // Diri susihon kung expired na ang batch.
    public function isExpired(): bool
    {
        return InventoryAlertHelper::isBatchExpired($this);
    }

    /**
     * Batches that still have stock and are not past expiry.
     */
    // Diri i-filter ang batch nga naay stock ug dili expired.
    public function scopeAvailableForUse($query)
    {
        return $query
            ->where('quantity', '>', 0)
            ->where(function ($builder) {
                $builder->whereNull('expiration_date')
                    ->orWhereDate('expiration_date', '>=', now()->toDateString());
            });
    }

    // Diri kuwentahon ang tanang items sa batch.
    public function getTotalItems()
    {
        if ($this->isBox() && $this->items_per_box) {
            return $this->quantity * $this->items_per_box;
        }
        return $this->quantity;
    }

    // Diri kuwentahon ang dosage sa vial base sa timbang.
    public function calculateVialDosage($dogWeightKg)
    {
        if (!$this->isVial()) {
            return 0;
        }
        
        // 1kg = 0.10ml, so dosage = weight * 0.10
        $dosageMl = $dogWeightKg * 0.10;
        
        return $dosageMl;
    }

    /**
     * Get inventory batches ordered by expiration date (FIFO)
     * Oldest/soonest-to-expire batches first
     */
    // Diri kuhaon ang mga batch sa tambal sunod sa FIFO.
    public static function getInventoryBatchesFIFO($medicineId)
    {
        return self::availableForUse()
            ->where('medicine_id', $medicineId)
            ->orderBy('created_at', 'asc')
            ->get();
    }

    /**
     * Deduct inventory quantity using FIFO method
     * Returns the amount successfully deducted (may be less than requested if insufficient stock)
     */
    // Diri ibawas ang stock gikan sa kinaunhang batch.
    public static function deductInventoryFIFO($medicineId, $quantityToDeduct)
    {
        $batches = self::getInventoryBatchesFIFO($medicineId);
        $amountDeducted = 0;

        foreach ($batches as $batch) {
            if ($amountDeducted >= $quantityToDeduct) {
                break;  // We've deducted enough
            }

            $remainingToDeduct = $quantityToDeduct - $amountDeducted;
            $availableInBatch = $batch->quantity;

            if ($availableInBatch >= $remainingToDeduct) {
                // This batch has enough to fulfill the remaining request
                $batch->quantity -= $remainingToDeduct;
                $batch->save();
                $amountDeducted += $remainingToDeduct;
            } else {
                // Deplete this batch and move to next
                $amountDeducted += $availableInBatch;
                $batch->quantity = 0;
                $batch->save();
            }
        }

        return $amountDeducted;
    }
}
