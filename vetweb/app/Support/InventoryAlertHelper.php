<?php

namespace App\Support;

use App\Models\Inventory;
use Carbon\Carbon;

class InventoryAlertHelper
{
    // Diri ipakita ang stock isip buo nga numero.
    public static function displayWholeUnits(float $value): int
    {
        if ($value <= 0) {
            return 0;
        }

        return (int) ceil($value - 0.0000001);
    }

    // Diri ang limit para ingnon nga low stock.
    public static function lowStockThreshold(): int
    {
        return (int) config('inventory.low_stock_threshold', 5);
    }

    // Diri ang petsa para ingnon nga hapit ma-expire.
    public static function expiringSoonCutoff(): Carbon
    {
        $months = (int) config('inventory.expiring_soon_months', 3);

        return now()->startOfDay()->addMonths($months);
    }

    // Diri susihon kung out of stock na.
    public static function isOutOfStock(float $onHand): bool
    {
        return self::displayWholeUnits($onHand) <= 0;
    }

    // Diri susihon kung low stock na.
    public static function isLowStock(float $onHand): bool
    {
        $units = self::displayWholeUnits($onHand);

        return $units > 0 && $units <= self::lowStockThreshold();
    }

    // Diri susihon kung expired na ang batch.
    public static function isBatchExpired(Inventory $batch): bool
    {
        if ((float) $batch->quantity <= 0 || !$batch->expiration_date) {
            return false;
        }

        return $batch->expiration_date->startOfDay()->lt(now()->startOfDay());
    }

    // Diri susihon kung hapit na ma-expire ang batch.
    public static function isBatchExpiringSoon(Inventory $batch): bool
    {
        if ((float) $batch->quantity <= 0 || !$batch->expiration_date) {
            return false;
        }

        $today = now()->startOfDay();
        $expiry = $batch->expiration_date->startOfDay();

        return $expiry->gte($today) && $expiry->lte(self::expiringSoonCutoff());
    }
}
