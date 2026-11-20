<?php

namespace App\Support;

use Carbon\Carbon;

class BookingTimeHelper
{
    /**
     * Time grid granularity in minutes (booking and walk-in slot pickers).
     */
    public const SLOT_INCREMENT_MINUTES = 60;

    /**
     * Legacy default when duration_minutes is not set on a booking.
     */
    public const SLOT_DURATION_MINUTES = 20;

    public const MORNING_START_MINUTES = 8 * 60;

    public const MORNING_END_MINUTES = 12 * 60;

    public const AFTERNOON_START_MINUTES = 13 * 60;

    public const AFTERNOON_END_MINUTES = 17 * 60;

    /**
     * Slot start times for a clinic day, in SLOT_INCREMENT_MINUTES steps.
     *
     * @return list<array{time: string, label: string, period: string, hour: string}>
     */
    // Diri kuhaon ang sugod sa mga slot sa clinic.
    public static function clinicSlotStarts(): array
    {
        $slots = [];
        $windows = [
            ['start' => self::MORNING_START_MINUTES, 'end' => self::MORNING_END_MINUTES, 'period' => 'morning'],
            ['start' => self::AFTERNOON_START_MINUTES, 'end' => self::AFTERNOON_END_MINUTES, 'period' => 'afternoon'],
        ];

        foreach ($windows as $window) {
            for ($m = $window['start']; $m < $window['end']; $m += self::SLOT_INCREMENT_MINUTES) {
                $time = sprintf('%02d:%02d', intdiv($m, 60), $m % 60);
                $slots[] = [
                    'time' => $time,
                    'label' => date('h:i A', strtotime($time)),
                    'period' => $window['period'],
                    'hour' => sprintf('%02d', intdiv($m, 60)),
                ];
            }
        }

        return $slots;
    }

    /**
     * Normalize any time value to HH:MM (24-hour).
     */
    // Diri i-format ang oras sa H:i.
    public static function normalizeToHi(?string $time): ?string
    {
        if ($time === null || $time === '') {
            return null;
        }

        $time = trim($time);

        if (preg_match('/^\d{2}:\d{2}$/', $time)) {
            return $time;
        }

        if (preg_match('/^(\d{2}:\d{2}):\d{2}$/', $time, $matches)) {
            return $matches[1];
        }

        try {
            return Carbon::parse($time)->format('H:i');
        } catch (\Exception $e) {
            return null;
        }
    }

    /**
     * Statuses that block a time slot from being booked again.
     */
    // Diri ang mga status nga mo-okupar sa slot.
    public static function blockingStatuses(): array
    {
        return ['pending', 'approved', 'processing', 'ongoing'];
    }

    /**
     * Resolve effective duration for a booking record or raw minutes.
     */
    // Diri kuhaon ang gidugayon sa booking sa minutos.
    public static function resolveDurationMinutes(?int $durationMinutes): int
    {
        if ($durationMinutes !== null && $durationMinutes > 0) {
            return $durationMinutes;
        }

        return self::SLOT_DURATION_MINUTES;
    }

    /**
     * Convert HH:MM to minutes since midnight.
     */
    // Diri himuong minutos ang oras.
    public static function timeToMinutes(string $time): ?int
    {
        $normalized = self::normalizeToHi($time);
        if (!$normalized) {
            return null;
        }

        [$hours, $minutes] = array_map('intval', explode(':', $normalized));

        return ($hours * 60) + $minutes;
    }

    /**
     * All slot start times on the booking grid covered by [start, start + duration).
     */
    // Diri kuhaon ang mga slot nga maokupar sa booking.
    public static function occupiedSlotTimes(string $startTime, int $durationMinutes): array
    {
        $startMinutes = self::timeToMinutes($startTime);
        if ($startMinutes === null || $durationMinutes <= 0) {
            return [];
        }

        $slots = [];
        for ($m = $startMinutes; $m < $startMinutes + $durationMinutes; $m += self::SLOT_INCREMENT_MINUTES) {
            $slots[] = sprintf('%02d:%02d', intdiv($m, 60), $m % 60);
        }

        return $slots;
    }

    /**
     * Whether a slot start time falls inside any blocked range.
     *
     * @param  array<int, array{start_minutes: int, duration_minutes: int}>  $ranges
     */
    // Diri susihon kung sulod sa range ang minutos.
    public static function minutesFallInRanges(?int $slotMinutes, array $ranges): bool
    {
        if ($slotMinutes === null) {
            return false;
        }

        foreach ($ranges as $range) {
            if ($slotMinutes >= $range['start_minutes']
                && $slotMinutes < $range['start_minutes'] + $range['duration_minutes']) {
                return true;
            }
        }

        return false;
    }

    /**
     * Whether a candidate booking overlaps any existing blocked range.
     */
    // Diri susihon kung nagsapaw ang oras sa booking.
    public static function rangesOverlap(
        int $candidateStartMinutes,
        int $candidateDurationMinutes,
        int $existingStartMinutes,
        int $existingDurationMinutes
    ): bool {
        $candidateEnd = $candidateStartMinutes + $candidateDurationMinutes;
        $existingEnd = $existingStartMinutes + $existingDurationMinutes;

        return $candidateStartMinutes < $existingEnd && $existingStartMinutes < $candidateEnd;
    }

    /**
     * Whether every increment slot in the requested range is free.
     *
     * @param  array<int, array{start_minutes: int, duration_minutes: int}>  $blockedRanges
     */
    // Diri susihon kung bakante ang range sa oras.
    public static function isRangeAvailable(
        string $startTime,
        int $durationMinutes,
        array $blockedRanges,
        ?string $date = null,
        ?string $currentTime = null
    ): bool {
        $startMinutes = self::timeToMinutes($startTime);
        if ($startMinutes === null || $durationMinutes <= 0) {
            return false;
        }

        $endMinutes = $startMinutes + $durationMinutes;

        foreach ($blockedRanges as $range) {
            if (self::rangesOverlap($startMinutes, $durationMinutes, $range['start_minutes'], $range['duration_minutes'])) {
                return false;
            }
        }

        if ($date !== null && $currentTime !== null) {
            $today = now()->format('Y-m-d');
            if ($date === $today) {
                $currentMinutes = self::timeToMinutes($currentTime);
                if ($currentMinutes !== null && $startMinutes < $currentMinutes) {
                    return false;
                }
            }
        }

        // Must fit within clinic hours: 8:00-12:00 and 13:00-17:00
        if (!self::fitsWithinClinicHours($startMinutes, $endMinutes)) {
            return false;
        }

        return true;
    }

    // Diri susihon kung sulod sa oras sa clinic.
    public static function fitsWithinClinicHours(int $startMinutes, int $endMinutes): bool
    {
        $morningStart = self::MORNING_START_MINUTES;
        $morningEnd = self::MORNING_END_MINUTES;
        $afternoonStart = self::AFTERNOON_START_MINUTES;
        $afternoonEnd = self::AFTERNOON_END_MINUTES;

        $inMorning = $startMinutes >= $morningStart && $endMinutes <= $morningEnd;
        $inAfternoon = $startMinutes >= $afternoonStart && $endMinutes <= $afternoonEnd;

        return $inMorning || $inAfternoon;
    }

    /**
     * Initial status for a walk-in. Always pending — staff move to ongoing manually.
     */
    // Diri kuhaon ang unang status sa walk-in.
    public static function walkInInitialStatus(string $bookingDate, string $bookingTime): string
    {
        return 'processing';
    }

    // Diri susihon kung nagdagan na karon ang slot.
    public static function isSlotActive(string $bookingDate, ?string $bookingTime, ?int $durationMinutes = null): bool
    {
        $time = self::normalizeToHi($bookingTime);
        if (!$time) {
            return false;
        }

        $duration = self::resolveDurationMinutes($durationMinutes);
        $scheduledAt = Carbon::parse($bookingDate . ' ' . $time);
        $slotEnd = $scheduledAt->copy()->addMinutes($duration);

        return Carbon::now()->between($scheduledAt, $slotEnd);
    }

    // Diri susihon kung adlaw sa booking ang petsa.
    public static function isBookingScheduleDay($bookingDate): bool
    {
        if ($bookingDate === null || $bookingDate === '') {
            return false;
        }

        $date = $bookingDate instanceof Carbon
            ? $bookingDate
            : Carbon::parse($bookingDate);

        return $date->isSameDay(now());
    }
}
