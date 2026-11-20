<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\BookingSlotCapacity;
use App\Models\BookingSlotCapacityChange;
use App\Support\BookingTimeHelper;
use Illuminate\Support\Collection;

class BookingSlotService
{
    public const DEFAULT_CAPACITY = 5;

    public const MAX_CAPACITY = 50;

    public const CLINIC_TYPES = ['appointment', 'walk_in'];

    // Diri susihon kung clinic booking ang type.
    public static function isClinicBooking(?string $bookingType): bool
    {
        return in_array($bookingType, self::CLINIC_TYPES, true);
    }

    // Diri i-format ang oras sa H:i.
    public static function normalizeTime(?string $time): ?string
    {
        return BookingTimeHelper::normalizeToHi($time);
    }

    // Diri kuhaon ang capacity sa slot sa petsa ug oras.
    public static function capacityFor(string $date, string $time): int
    {
        $normalized = self::normalizeTime($time);
        if (!$normalized) {
            return self::DEFAULT_CAPACITY;
        }

        $row = BookingSlotCapacity::query()
            ->whereDate('slot_date', $date)
            ->whereRaw("TIME_FORMAT(start_time, '%H:%i') = ?", [$normalized])
            ->first();

        if ($row) {
            return max(0, (int) $row->capacity);
        }

        return self::DEFAULT_CAPACITY;
    }

    // Diri ihapon ang booking sa slot.
    public static function bookedCount(string $date, string $time, ?int $ignoreBookingId = null, bool $lock = false): int
    {
        $normalized = self::normalizeTime($time);
        if (!$normalized) {
            return 0;
        }

        return self::clinicBookingsForDate($date, $ignoreBookingId, $lock)
            ->filter(fn (Appointment $booking) => self::normalizeTime($booking->booking_time) === $normalized)
            ->count();
    }

    // Diri kuwentahon ang nahabilin nga slot.
    public static function remaining(string $date, string $time, ?int $ignoreBookingId = null, bool $lock = false): int
    {
        return max(0, self::capacityFor($date, $time) - self::bookedCount($date, $time, $ignoreBookingId, $lock));
    }

    // Diri mo-error kung puno na ang slot.
    public static function availabilityError(
        string $date,
        string $time,
        ?int $ignoreBookingId = null,
        bool $lock = false
    ): ?string {
        if (self::remaining($date, $time, $ignoreBookingId, $lock) > 0) {
            return null;
        }

        return 'This time is fully booked. Please choose another time.';
    }

    /**
     * @param  list<array<string, mixed>>  $slots
     * @return list<array<string, mixed>>
     */
    // Diri idugang ang capacity info sa mga slot.
    public static function decorateSlots(array $slots, string $date, bool $applyCapacity = true): array
    {
        $bookings = $applyCapacity ? self::clinicBookingsForDate($date) : collect();

        return array_map(function (array $slot) use ($date, $applyCapacity, $bookings) {
            $time = self::normalizeTime($slot['time'] ?? null) ?: ($slot['time'] ?? '');
            $capacity = $applyCapacity ? self::capacityFor($date, $time) : null;
            $booked = $applyCapacity
                ? $bookings->filter(fn (Appointment $booking) => self::normalizeTime($booking->booking_time) === $time)->count()
                : 0;
            $remaining = $applyCapacity ? max(0, (int) $capacity - $booked) : null;
            $fullyBooked = $applyCapacity && $remaining === 0;

            $slot['capacity'] = $capacity;
            $slot['booked'] = $booked;
            $slot['remaining'] = $remaining;
            $slot['fully_booked'] = $fullyBooked;
            $slot['unlimited'] = !$applyCapacity;
            if ($applyCapacity && $fullyBooked) {
                $slot['available'] = false;
                $slot['occupied'] = true;
            }

            return $slot;
        }, $slots);
    }

    /**
     * @return list<array<string, mixed>>
     */
    // Diri kuhaon ang sugod sa matag oras nga slot.
    public static function hourlySlotStarts(): array
    {
        return array_values(array_filter(
            BookingTimeHelper::clinicSlotStarts(),
            fn (array $slot) => substr((string) ($slot['time'] ?? ''), -2) === '00'
        ));
    }

    // Diri ihapon ang oras nga slot sa adlaw.
    public static function hourlySlotCount(): int
    {
        return count(self::hourlySlotStarts());
    }

    // Diri kuhaon ang pinakadaghan nga capacity sa adlaw.
    public static function maxDayCapacity(): int
    {
        return self::MAX_CAPACITY * max(1, self::hourlySlotCount());
    }

    // Diri kuhaon ang slots sa adlaw para sa admin.
    public static function adminDaySlots(string $date): array
    {
        return self::decorateSlots(self::hourlySlotStarts(), $date, true);
    }

    // Diri i-set ang capacity sa usa ka slot.
    public static function setCapacity(string $date, string $time, int $capacity): BookingSlotCapacity
    {
        $normalized = self::normalizeTime($time);
        $capacity = max(0, min(self::MAX_CAPACITY, $capacity));

        return BookingSlotCapacity::updateOrCreate(
            [
                'slot_date' => $date,
                'start_time' => $normalized,
            ],
            [
                'capacity' => $capacity,
            ]
        );
    }

    // Diri i-set ang capacity sa tibuok adlaw.
    public static function setDayCapacity(string $date, int $capacity): void
    {
        self::distributeDayCapacity($date, $capacity);
    }

    // Diri bahinon ang capacity sa adlaw sa matag slot.
    public static function distributeDayCapacity(string $date, int $total): void
    {
        foreach (self::splitDayCapacities($total) as $slot) {
            self::setCapacity($date, $slot['time'], $slot['capacity']);
        }
    }

    /**
     * @return list<array{time: string, label: string, capacity: int}>
     */
    // Diri kuwentahon ang bahin sa capacity sa matag slot.
    public static function splitDayCapacities(int $total): array
    {
        $slots = self::hourlySlotStarts();
        $count = count($slots);
        if ($count === 0) {
            return [];
        }

        $total = max(0, min(self::maxDayCapacity(), $total));
        $base = intdiv($total, $count);
        $remainder = $total % $count;

        return array_values(array_map(function (array $slot, int $index) use ($base, $remainder) {
            return [
                'time' => $slot['time'],
                'label' => $slot['label'] ?? $slot['time'],
                'capacity' => min(self::MAX_CAPACITY, $base + ($index < $remainder ? 1 : 0)),
            ];
        }, $slots, array_keys($slots)));
    }

    /**
     * @return list<array{time: string, label: string, capacity: int}>
     */
    // Diri kuhaon ang karon nga capacity sa matag slot.
    public static function snapshotCapacities(string $date): array
    {
        return array_map(function (array $slot) use ($date) {
            return [
                'time' => $slot['time'],
                'label' => $slot['label'] ?? $slot['time'],
                'capacity' => self::capacityFor($date, $slot['time']),
            ];
        }, self::hourlySlotStarts());
    }

    /**
     * @param  list<array<string, mixed>>  $slots
     */
    // Diri i-save ang slots sa adlaw ug ang history.
    public static function saveDaySlots(string $date, array $slots, ?int $userId = null, ?string $summary = null): ?BookingSlotCapacityChange
    {
        $before = self::snapshotCapacities($date);
        $allowed = [];
        foreach (self::hourlySlotStarts() as $slot) {
            $allowed[$slot['time']] = $slot;
        }

        foreach ($slots as $slot) {
            $time = self::normalizeTime($slot['time'] ?? null);
            if (!$time || !isset($allowed[$time])) {
                continue;
            }
            self::setCapacity($date, $time, (int) ($slot['capacity'] ?? 0));
        }

        $after = self::snapshotCapacities($date);
        if ($before === $after) {
            return null;
        }

        return BookingSlotCapacityChange::create([
            'slot_date' => $date,
            'changed_by' => $userId,
            'summary' => $summary ?: self::changeSummary($before, $after),
            'before_slots' => $before,
            'after_slots' => $after,
        ]);
    }

    /**
     * @return list<array<string, mixed>>
     */
    // Diri kuhaon ang bag-ong mga pag-usab sa capacity.
    public static function recentChanges(?string $date = null, int $limit = 25): array
    {
        $query = BookingSlotCapacityChange::query()
            ->with('changer:id,firstname,lastname,name')
            ->orderByDesc('created_at')
            ->orderByDesc('id');

        if ($date) {
            $query->whereDate('slot_date', $date);
        }

        return $query->limit($limit)->get()->map(function (BookingSlotCapacityChange $change) {
            $changer = $change->changer;
            $name = trim(implode(' ', array_filter([
                $changer?->firstname,
                $changer?->lastname,
            ]))) ?: ($changer?->name ?: 'Admin');

            return [
                'id' => $change->id,
                'date' => $change->slot_date?->format('Y-m-d'),
                'summary' => $change->summary,
                'changed_by_name' => $name,
                'before_slots' => $change->before_slots ?: [],
                'after_slots' => $change->after_slots ?: [],
                'created_at' => optional($change->created_at)?->toIso8601String(),
            ];
        })->all();
    }

    /**
     * @param  list<array{time?: string, label?: string, capacity?: int}>  $before
     * @param  list<array{time?: string, label?: string, capacity?: int}>  $after
     */
    // Diri himuon ang summary sa pag-usab sa capacity.
    public static function changeSummary(array $before, array $after): string
    {
        $beforeByTime = [];
        foreach ($before as $slot) {
            $time = self::normalizeTime($slot['time'] ?? null);
            if ($time) {
                $beforeByTime[$time] = $slot;
            }
        }

        $changed = [];
        $afterTotal = 0;
        foreach ($after as $slot) {
            $time = self::normalizeTime($slot['time'] ?? null);
            if (!$time) {
                continue;
            }
            $newCapacity = (int) ($slot['capacity'] ?? 0);
            $afterTotal += $newCapacity;
            $oldCapacity = (int) ($beforeByTime[$time]['capacity'] ?? self::DEFAULT_CAPACITY);
            if ($oldCapacity === $newCapacity) {
                continue;
            }
            $label = $slot['label'] ?? $beforeByTime[$time]['label'] ?? $time;
            $changed[] = $label.' '.$oldCapacity.' → '.$newCapacity;
        }

        if (count($changed) >= self::hourlySlotCount()) {
            return 'Set day total to '.$afterTotal.' and split across '.self::hourlySlotCount().' hours';
        }

        if ($changed === []) {
            return 'Updated slot capacities';
        }

        return implode(', ', array_slice($changed, 0, 4)).(count($changed) > 4 ? '…' : '');
    }

    /**
     * @return Collection<int, Appointment>
     */
    // Diri kuhaon ang clinic bookings sa petsa.
    private static function clinicBookingsForDate(string $date, ?int $ignoreBookingId = null, bool $lock = false): Collection
    {
        $query = Appointment::query()
            ->whereDate('booking_date', $date)
            ->whereIn('booking_type', self::CLINIC_TYPES)
            ->whereNotIn('status', ['cancelled']);

        if ($ignoreBookingId) {
            $query->where('id', '!=', $ignoreBookingId);
        }

        if ($lock) {
            $query->lockForUpdate();
        }

        return $query->get(['id', 'booking_time', 'status', 'booking_type']);
    }
}
