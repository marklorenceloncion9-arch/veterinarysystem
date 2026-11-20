<?php

namespace App\Services;

use App\Models\Appointment;

class BookingAnimalStatusService
{
    public const PENDING = 'pending';
    public const APPROVED = 'approved';
    public const CANCELLED = 'cancelled';

    // Diri usbon ang status sa usa ka hayop sa booking.
    public static function setAnimalStatus(
        Appointment $appointment,
        int $animalId,
        string $status,
        ?string $cancellationReason = null
    ): void {
        $entries = $appointment->bookedAnimalEntries();
        $found = false;

        foreach ($entries as &$entry) {
            if ((int) $entry['animal_id'] !== $animalId) {
                continue;
            }

            $entry['status'] = $status;
            if ($status === self::CANCELLED) {
                $entry['cancellation_reason'] = $cancellationReason;
            }
            $found = true;
            break;
        }
        unset($entry);

        if (!$found) {
            $entries[] = [
                'animal_id' => $animalId,
                'status' => $status,
                'cancellation_reason' => $status === self::CANCELLED ? $cancellationReason : null,
            ];
        }

        $appointment->setBookedAnimalEntries($entries);
    }

    // Diri i-sync ang status sa hayop sa status sa booking.
    public static function syncAnimalsToBookingStatus(
        Appointment $appointment,
        string $status,
        ?string $cancellationReason = null
    ): void {
        $entries = $appointment->bookedAnimalEntries();
        if ($entries === []) {
            return;
        }

        foreach ($entries as &$entry) {
            if ($status === self::APPROVED && ($entry['status'] ?? self::PENDING) === self::PENDING) {
                $entry['status'] = self::APPROVED;
            }

            if ($status === self::CANCELLED && ($entry['status'] ?? self::PENDING) !== self::CANCELLED) {
                $entry['status'] = self::CANCELLED;
                $entry['cancellation_reason'] = $cancellationReason;
            }
        }
        unset($entry);

        $appointment->setBookedAnimalEntries($entries);
    }

    // Diri kuhaon ang status sa booking base sa mga hayop.
    public static function deriveBookingStatus(Appointment $appointment): ?string
    {
        $entries = $appointment->fresh()?->bookedAnimalEntries() ?? $appointment->bookedAnimalEntries();
        if ($entries === []) {
            return null;
        }

        $statuses = collect($entries)->pluck('status');
        if ($statuses->every(fn ($status) => $status === self::CANCELLED)) {
            return self::CANCELLED;
        }

        $active = collect($entries)->filter(fn ($entry) => ($entry['status'] ?? self::PENDING) !== self::CANCELLED);
        if ($active->isNotEmpty() && $active->every(fn ($entry) => ($entry['status'] ?? self::PENDING) === self::APPROVED)) {
            return self::APPROVED;
        }

        return self::PENDING;
    }

    // Diri himuon ang summary label sa status sa hayop.
    public static function summaryLabel(Appointment $appointment): ?string
    {
        $entries = $appointment->bookedAnimalEntries();
        if ($entries === []) {
            return null;
        }

        $total = count($entries);
        $approved = collect($entries)->where('status', self::APPROVED)->count();
        $cancelled = collect($entries)->where('status', self::CANCELLED)->count();
        $pending = collect($entries)->filter(
            fn ($entry) => ($entry['status'] ?? self::PENDING) === self::PENDING
        )->count();

        if ($cancelled === $total) {
            return 'All Cancelled';
        }

        if ($approved === $total) {
            return 'All Approved';
        }

        if ($pending === $total) {
            return null;
        }

        if ($approved > 0 && $pending > 0 && $cancelled === 0) {
            return 'Partially Approved';
        }

        $parts = [];
        if ($approved > 0) {
            $parts[] = "{$approved} Approved";
        }
        if ($pending > 0) {
            $parts[] = "{$pending} Pending";
        }
        if ($cancelled > 0) {
            $parts[] = "{$cancelled} Cancelled";
        }

        return $parts !== [] ? implode(', ', $parts) : null;
    }

    // Diri i-apply ang status sa booking gikan sa mga hayop.
    public static function applyDerivedBookingStatus(
        Appointment $appointment,
        ?string $cancellationReason = null
    ): string {
        $appointment->refresh();
        $appointment->clearResolvedAnimals();
        $current = $appointment->status;
        $derived = self::deriveBookingStatus($appointment);

        if ($derived === null || !in_array($current, [self::PENDING, self::APPROVED], true)) {
            return $current;
        }

        if ($derived === self::APPROVED && $current === self::PENDING) {
            $appointment->update(['status' => self::APPROVED]);

            return self::APPROVED;
        }

        if ($derived === self::CANCELLED) {
            $appointment->update([
                'status' => self::CANCELLED,
                'cancellation_reason' => $cancellationReason ?: $appointment->cancellation_reason,
            ]);

            return self::CANCELLED;
        }

        return $current;
    }

    // Diri kuhaon ang mga hayop nga wala pa na-approve.
    public static function unapprovedAnimals(Appointment $appointment)
    {
        return $appointment->resolvedAnimals()->filter(function ($animal) {
            $status = $animal->pivot?->status ?? self::PENDING;

            return $status !== self::CANCELLED
                && !in_array($animal->registration_status, ['registered', 'exempt'], true);
        });
    }
}
