<?php

namespace App\Support;

use DateTimeInterface;

class VaccinationSchedule
{
    public const FIRST = 'first';

    public const BOOSTER = 'booster';

    public static function years(?string $doseType): int
    {
        return $doseType === self::BOOSTER ? 3 : 1;
    }

    public static function normalizeDose(?string $doseType): ?string
    {
        return in_array($doseType, [self::FIRST, self::BOOSTER], true) ? $doseType : null;
    }

    public static function dateString(mixed $value): ?string
    {
        if ($value instanceof DateTimeInterface) {
            return $value->format('Y-m-d');
        }

        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        return substr($value, 0, 10);
    }

    public static function validUntil(mixed $lastDate, ?string $doseType): ?string
    {
        $date = self::dateString($lastDate);
        if (! $date) {
            return null;
        }

        return \Carbon\Carbon::parse($date)->addYears(self::years($doseType))->toDateString();
    }

    /**
     * First recorded vaccination lasts 1 year. A later date is the booster and lasts 3 years.
     * An explicit first/booster choice on this save is kept.
     */
    public static function resolveDose(
        mixed $currentDate,
        mixed $originalDate,
        ?string $currentDose,
        ?string $originalDose,
        bool $doseWasChosen
    ): ?string {
        $current = self::dateString($currentDate);
        if (! $current) {
            return null;
        }

        $chosen = self::normalizeDose($currentDose);
        if ($doseWasChosen && $chosen) {
            return $chosen;
        }

        $original = self::dateString($originalDate);
        if ($original && $original !== $current) {
            return self::BOOSTER;
        }

        return self::normalizeDose($originalDose) ?? $chosen ?? self::FIRST;
    }
}
