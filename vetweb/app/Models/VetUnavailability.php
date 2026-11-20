<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class VetUnavailability extends Model
{
    use HasFactory;

    protected $table = 'vet_unavailabilities';

    protected $fillable = [
        'unavailable_date',
        'reason',
        'type',
        'created_by',
    ];

    protected $casts = [
        'unavailable_date' => 'date',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    /**
     * Get all unavailable dates as an array of date strings
     */
    // Diri kuhaon ang mga petsa nga wala ang vet.
    public static function getUnavailableDates(): array
    {
        return self::pluck('unavailable_date')->map(function ($date) {
            return $date->format('Y-m-d');
        })->toArray();
    }

    /**
     * Get unavailability record for a specific date.
     */
    // Diri kuhaon ang unavailability sa petsa.
    public static function getForDate(string $date): ?self
    {
        return self::where('unavailable_date', $date)->first();
    }

    /**
     * Blocked minute ranges for a date based on admin availability settings.
     *
     * @return array<int, array{start_minutes: int, duration_minutes: int}>
     */
    // Diri kuhaon ang mga oras nga blocked sa petsa.
    public static function getBlockedRangesForDate(string $date): array
    {
        $record = self::getForDate($date);
        if (!$record) {
            return [];
        }

        return self::getBlockedRangesForType($record->type);
    }

    /**
     * Blocked minute ranges for an unavailability type (before it is saved).
     *
     * @return array<int, array{start_minutes: int, duration_minutes: int}>
     */
    // Diri kuhaon ang oras nga blocked base sa type.
    public static function getBlockedRangesForType(string $type): array
    {
        return match ($type) {
            'full_day' => [
                ['start_minutes' => 0, 'duration_minutes' => 24 * 60],
            ],
            'morning' => [
                ['start_minutes' => 8 * 60, 'duration_minutes' => 4 * 60],
            ],
            'afternoon' => [
                ['start_minutes' => 13 * 60, 'duration_minutes' => 4 * 60],
            ],
            default => [],
        };
    }

    /**
     * Check if a specific date is fully unavailable (not bookable at all).
     */
    // Diri susihon kung wala gyud ang vet tibuok adlaw.
    public static function isFullyUnavailable(string $date): bool
    {
        $record = self::getForDate($date);

        return $record !== null && $record->type === 'full_day';
    }

    /**
     * Check if a specific date is unavailable
     */
    // Diri susihon kung wala ang vet sa petsa.
    public static function isUnavailable(string $date): bool
    {
        return self::where('unavailable_date', $date)->exists();
    }

    /**
     * Get unavailable dates for a date range
     */
    // Diri kuhaon ang unavailability sulod sa range sa petsa.
    public static function getUnavailableForRange(string $startDate, string $endDate): array
    {
        return self::whereBetween('unavailable_date', [$startDate, $endDate])
            ->get()
            ->map(function ($item) {
                return [
                    'date' => $item->getRawOriginal('unavailable_date'),
                    'reason' => $item->reason,
                    'type' => $item->type,
                ];
            })
            ->toArray();
    }
}
