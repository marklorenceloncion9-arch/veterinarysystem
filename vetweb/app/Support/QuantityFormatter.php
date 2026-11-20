<?php

namespace App\Support;

use App\Models\BookingMedicine;
use App\Models\Inventory;

class QuantityFormatter
{
    // Diri i-format ang quantity nga walay sobra nga decimal.
    public static function format($value, int $maxDecimals = 3): int|float
    {
        if ($value === null || $value === '') {
            return 0;
        }

        $num = (float) $value;

        if (fmod($num, 1.0) === 0.0) {
            return (int) round($num);
        }

        return (float) rtrim(rtrim(number_format($num, $maxDecimals, '.', ''), '0'), '.');
    }

    // Diri i-format ang quantity sa tambal para ipakita.
    public static function formatTreatmentDisplay(BookingMedicine $bookingMedicine, ?Inventory $inventory): string
    {
        if ($inventory && $inventory->isBox()) {
            return self::format($bookingMedicine->quantity_used) . ' items';
        }

        if ($inventory && $inventory->isVial()) {
            return $bookingMedicine->dosage_ml
                ? self::format($bookingMedicine->dosage_ml, 2) . ' ml'
                : self::format($bookingMedicine->quantity_used) . ' vials';
        }

        return self::format($bookingMedicine->quantity_used) . ' ' . ($bookingMedicine->unit_name ?: 'units');
    }
}
