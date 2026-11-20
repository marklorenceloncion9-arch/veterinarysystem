<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\VetUnavailability;
use App\Support\BookingTimeHelper;
use Carbon\Carbon;
use Illuminate\Support\Collection;

class VetUnavailabilityService
{
    /**
     * Find active appointments that overlap the blocked period for a date/type.
     */
    // Diri pangitaon ang appointment nga mobangga sa pagkawala sa vet.
    public static function findConflictingAppointments(string $date, string $type): Collection
    {
        $blockedRanges = VetUnavailability::getBlockedRangesForType($type);

        return Appointment::with(['animal', 'user'])
            ->whereDate('booking_date', $date)
            ->whereIn('status', BookingTimeHelper::blockingStatuses())
            ->get()
            ->filter(fn (Appointment $appointment) => self::appointmentConflictsWithBlockedRanges($appointment, $blockedRanges))
            ->values();
    }

    /**
     * @param  array<int, array{start_minutes: int, duration_minutes: int}>  $blockedRanges
     */
    // Diri susihon kung sulod sa blocked nga oras ang appointment.
    public static function appointmentConflictsWithBlockedRanges(Appointment $appointment, array $blockedRanges): bool
    {
        if (empty($blockedRanges)) {
            return false;
        }

        $start = BookingTimeHelper::normalizeToHi($appointment->booking_time);
        if (!$start) {
            return false;
        }

        $startMinutes = BookingTimeHelper::timeToMinutes($start);
        if ($startMinutes === null) {
            return false;
        }

        $duration = BookingTimeHelper::resolveDurationMinutes($appointment->duration_minutes);

        foreach ($blockedRanges as $range) {
            if (BookingTimeHelper::rangesOverlap(
                $startMinutes,
                $duration,
                $range['start_minutes'],
                $range['duration_minutes']
            )) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    // Diri i-format ang mga nagbangga nga appointment.
    public static function formatConflictingAppointments(Collection $appointments): array
    {
        return $appointments
            ->map(fn (Appointment $appointment) => self::formatConflictingAppointment($appointment))
            ->values()
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    // Diri i-format ang usa ka nagbangga nga appointment.
    public static function formatConflictingAppointment(Appointment $appointment): array
    {
        $time = BookingTimeHelper::normalizeToHi($appointment->booking_time);
        $timeLabel = self::formatBookingTimeLabel($time);

        $user = $appointment->user;
        $clientName = trim(($user->firstname ?? '') . ' ' . ($user->lastname ?? ''));
        if ($clientName === '') {
            $clientName = (string) ($user?->name ?? 'Unknown client');
        }

        return [
            'id' => $appointment->id,
            'pet_name' => $appointment->animal?->pet_name ?? 'Unknown pet',
            'client_name' => $clientName,
            'booking_time' => $time,
            'booking_time_label' => $timeLabel,
            'status' => $appointment->status,
        ];
    }

    // Diri himuon ang rason sa pag-cancel tungod sa vet.
    public static function buildCancellationReason(?string $adminReason): string
    {
        $adminReason = trim((string) $adminReason);

        if ($adminReason !== '') {
            return "The clinic is unavailable on your scheduled date: {$adminReason}. Please book a new appointment.";
        }

        return 'The clinic is unavailable on your scheduled date. Please book a new appointment.';
    }

    // Diri i-cancel ang mga appointment nga nagbangga.
    public static function cancelConflictingAppointments(string $date, string $type, string $reason): int
    {
        $appointments = self::findConflictingAppointments($date, $type);
        $cancelledCount = 0;

        foreach ($appointments as $appointment) {
            if ($appointment->status === 'cancelled') {
                continue;
            }

            $appointment->update([
                'status' => 'cancelled',
                'cancellation_reason' => $reason,
            ]);

            $fresh = $appointment->fresh();
            AppointmentStatusLogService::record(
                $fresh,
                'cancelled',
                'Clinic',
                null
            );
            AppointmentClientNotificationService::notifyCancelled($fresh, $reason);
            AppointmentBroadcastService::notify($fresh, 'cancelled');
            $cancelledCount++;
        }

        return $cancelledCount;
    }

    // Diri i-format ang label sa oras sa booking.
    private static function formatBookingTimeLabel(?string $bookingTime): string
    {
        $normalized = BookingTimeHelper::normalizeToHi($bookingTime);
        if (!$normalized) {
            return 'Unknown time';
        }

        try {
            return Carbon::createFromFormat('H:i', $normalized)->format('g:i A');
        } catch (\Exception $e) {
            return $normalized;
        }
    }
}
