<?php

namespace App\Services;

use App\Events\ServiceNotificationCreated;
use App\Mail\WalkInAssignedMail;
use App\Models\Appointment;
use App\Models\Notification;
use App\Models\User;
use App\Support\BookingTimeHelper;
use App\Support\TreatmentStaff;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class AppointmentFieldmanNotificationService
{
    // Diri pahibaw-on ang fieldman sa assigned nga walk-in.
    public static function notifyWalkInAssigned(Appointment $appointment): void
    {
        self::notifyAssigned($appointment, 'walk_in');
    }

    // Diri pahibaw-on ang fieldman sa assigned nga home service.
    public static function notifyHomeServiceAssigned(Appointment $appointment): void
    {
        self::notifyAssigned($appointment, 'home_service');
    }

    // Diri pahibaw-on ang fieldman sa assigned nga clinical.
    public static function notifyClinicalAssigned(Appointment $appointment): void
    {
        self::notifyAssigned($appointment, 'appointment');
    }

    // Diri pahibaw-on tanang assigned nga fieldman.
    public static function notifyAssigned(Appointment $appointment, string $bookingType): void
    {
        $appointment->loadMissing(['assignedFieldmen', 'user', 'animal', 'treatmentTypes']);

        foreach ($appointment->assignedFieldmen as $fieldman) {
            self::createInAppNotification($fieldman, $appointment, $bookingType);
            self::sendAssignedEmail($fieldman, $appointment, $bookingType);
        }
    }

    // Diri himuon ang in-app notification sa fieldman.
    private static function createInAppNotification(User $fieldman, Appointment $appointment, string $bookingType): void
    {
        $copy = self::assignmentCopy($bookingType);
        $type = match ($bookingType) {
            'home_service' => 'home_service_assigned',
            'appointment' => 'clinic_appointment_assigned',
            default => 'walk_in_assigned',
        };

        if (self::hasRecentAssignmentNotification($fieldman, $appointment, $type)) {
            return;
        }

        $petName = $appointment->petNamesLabel('the pet');
        $client = $appointment->user;
        $clientName = $client
            ? TreatmentStaff::displayName($client)
            : 'Client';
        $dateLabel = $appointment->booking_date?->format('F j, Y') ?? 'today';
        $timeLabel = self::formatBookingTime($appointment->booking_time);
        $title = $copy['label'] . ' Assigned';
        $message = "You have been assigned a {$copy['noun']} for {$petName} ({$clientName}) on {$dateLabel} at {$timeLabel}.";
        $services = $appointment->treatmentTypes
            ?->pluck('type_name')
            ->filter()
            ->values()
            ->all() ?? [];

        $payload = [
            'appointment_id' => $appointment->id,
            'pet_name' => $petName,
            'booking_date' => $appointment->booking_date?->format('Y-m-d'),
            'booking_time' => BookingTimeHelper::normalizeToHi($appointment->booking_time ?? ''),
            'booking_type' => $appointment->booking_type,
            'booking_type_label' => $copy['label'],
            'status' => $appointment->status,
            'services' => $services,
        ];

        Notification::create([
            'user_id' => $fieldman->id,
            'type' => $type,
            'title' => $title,
            'message' => $message,
            'data' => $payload,
        ]);

        try {
            broadcast(new ServiceNotificationCreated(
                $fieldman->id,
                $title,
                $message,
                $payload,
                $type
            ));
        } catch (\Throwable $e) {
            Log::error("Failed to broadcast {$copy['noun']} assignment to user {$fieldman->id}: " . $e->getMessage());
        }
    }

    // Diri susihon kung bag-o lang napahibaw-an ang fieldman.
    private static function hasRecentAssignmentNotification(User $fieldman, Appointment $appointment, string $type): bool
    {
        return Notification::query()
            ->where('user_id', $fieldman->id)
            ->where('type', $type)
            ->where('created_at', '>=', now()->subMinutes(5))
            ->latest('id')
            ->limit(10)
            ->get()
            ->contains(fn (Notification $notification) => (int) ($notification->data['appointment_id'] ?? 0) === (int) $appointment->id);
    }

    // Diri ipadala ang email sa assigned nga fieldman.
    private static function sendAssignedEmail(User $fieldman, Appointment $appointment, string $bookingType): void
    {
        if (!self::canSendEmail($fieldman->email)) {
            return;
        }

        $copy = self::assignmentCopy($bookingType);
        $recipientName = TreatmentStaff::displayName($fieldman);
        $petName = $appointment->petNamesLabel('the pet');
        $client = $appointment->user;
        $clientName = $client
            ? TreatmentStaff::displayName($client)
            : 'Client';
        $dateLabel = $appointment->booking_date?->format('F j, Y') ?? 'today';
        $timeLabel = self::formatBookingTime($appointment->booking_time);
        $message = "You have been assigned a {$copy['noun']} for {$petName} ({$clientName}) on {$dateLabel} at {$timeLabel}. Please open the Vetcare fieldman app to view the details.";

        $services = $appointment->treatmentTypes
            ?->pluck('type_name')
            ->filter()
            ->values()
            ->all() ?? [];

        try {
            Mail::to($fieldman->email)->send(new WalkInAssignedMail(
                $recipientName,
                $petName,
                $clientName,
                $dateLabel,
                $timeLabel,
                $message,
                $services,
                $copy['label'],
                $copy['subject']
            ));
        } catch (\Throwable $e) {
            Log::error("Failed to email {$copy['noun']} assignment to {$fieldman->email}: " . $e->getMessage());
        }
    }

    /**
     * @return array{label: string, noun: string, subject: string}
     */
    // Diri ang text sa assignment base sa booking type.
    private static function assignmentCopy(string $bookingType): array
    {
        return match ($bookingType) {
            'home_service' => [
                'label' => 'Home Service',
                'noun' => 'home service visit',
                'subject' => 'Home Service Assigned - Vetcare',
            ],
            'appointment' => [
                'label' => 'Clinic Appointment',
                'noun' => 'clinic appointment',
                'subject' => 'Clinic Appointment Assigned - Vetcare',
            ],
            default => [
                'label' => 'Walk-in',
                'noun' => 'walk-in service',
                'subject' => 'Walk-in Service Assigned - Vetcare',
            ],
        };
    }

    // Diri i-format ang oras sa booking.
    private static function formatBookingTime(?string $bookingTime): string
    {
        $normalized = BookingTimeHelper::normalizeToHi($bookingTime ?? '');

        if ($normalized === '') {
            return 'the scheduled time';
        }

        return date('g:i A', strtotime($normalized));
    }

    // Diri susihon kung pwede padad-an og email.
    private static function canSendEmail(?string $email): bool
    {
        if (empty($email)) {
            return false;
        }

        if (str_ends_with(strtolower($email), '@vetcare.local')) {
            return false;
        }

        return filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
    }
}
