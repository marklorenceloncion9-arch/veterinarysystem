<?php

namespace App\Services;

use App\Events\ServiceNotificationCreated;
use App\Mail\AppointmentApprovedMail;
use App\Models\Appointment;
use App\Models\Notification;
use App\Support\BookingTimeHelper;
use App\Support\BookingTypeLabel;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class AppointmentClientNotificationService
{
    // Diri pahibaw-on ang client nga approved ang appointment.
    public static function notifyApproved(Appointment $appointment): void
    {
        $appointment->loadMissing(['user', 'animal', 'treatmentTypes']);

        $user = $appointment->user;
        if (!$user) {
            return;
        }

        $isHomeService = $appointment->isHomeService();
        $type = $isHomeService ? 'home_service_approved' : 'clinic_appointment_approved';
        $title = $isHomeService ? 'Home Service Approved' : 'Clinic Appointment Approved';
        $message = self::buildApprovedMessage($appointment);
        $petName = $appointment->petNamesLabel('your pet');
        $dateLabel = $appointment->booking_date?->format('F j, Y') ?? 'the scheduled date';
        $timeLabel = self::formatBookingTime($appointment->booking_time);
        $bookingLabel = BookingTypeLabel::label($appointment->booking_type);

        $payload = self::basePayload($appointment, 'approved');

        Notification::create([
            'user_id' => $user->id,
            'type' => $type,
            'title' => $title,
            'message' => $message,
            'data' => $payload,
        ]);

        broadcast(new ServiceNotificationCreated(
            $user->id,
            $title,
            $message,
            $payload,
            $type
        ));

        self::sendApprovedEmail($user, $petName, $dateLabel, $timeLabel, $message, $appointment, $bookingLabel);
    }

    // Diri ipadala ang email sa approved appointment.
    private static function sendApprovedEmail(
        $user,
        string $petName,
        string $dateLabel,
        string $timeLabel,
        string $message,
        Appointment $appointment,
        string $bookingLabel
    ): void {
        if (!self::canSendEmail($user->email)) {
            return;
        }

        $services = $appointment->treatmentTypes
            ?->pluck('type_name')
            ->filter()
            ->values()
            ->all() ?? [];

        $recipientName = trim(($user->firstname ?? '') . ' ' . ($user->lastname ?? ''));
        if ($recipientName === '') {
            $recipientName = (string) ($user->name ?? '');
        }

        try {
            Mail::to($user->email)->send(new AppointmentApprovedMail(
                $recipientName,
                $petName,
                $dateLabel,
                $timeLabel,
                $message,
                $services,
                $bookingLabel
            ));
        } catch (\Throwable $e) {
            Log::error("Failed to email appointment approval to {$user->email}: " . $e->getMessage());
        }
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

    // Diri pahibaw-on ang client nga na-cancel ang appointment.
    public static function notifyCancelled(Appointment $appointment, string $reason, ?string $message = null): void
    {
        $appointment->loadMissing(['user', 'animal', 'treatmentTypes']);

        $user = $appointment->user;
        if (!$user) {
            return;
        }

        $message = trim((string) $message);
        if ($message === '') {
            $message = self::buildCancelledMessage($appointment, $reason);
        }
        $isHomeService = $appointment->isHomeService();
        $type = $isHomeService ? 'home_service_cancelled' : 'clinic_appointment_cancelled';
        $title = $isHomeService ? 'Home Service Cancelled' : 'Clinic Appointment Cancelled';

        $payload = self::basePayload($appointment, 'cancelled', [
            'cancellation_reason' => trim($reason),
        ]);

        Notification::create([
            'user_id' => $user->id,
            'type' => $type,
            'title' => $title,
            'message' => $message,
            'data' => $payload,
        ]);

        broadcast(new ServiceNotificationCreated(
            $user->id,
            $title,
            $message,
            $payload,
            $type
        ));
    }

    // Diri pahibaw-on ang client nga nausab ang status sa hayop.
    public static function notifyAnimalChanged(
        Appointment $appointment,
        string $petName,
        string $status,
        ?string $reason = null
    ): void {
        $appointment->loadMissing(['user']);

        $user = $appointment->user;
        if (!$user) {
            return;
        }

        $dateLabel = $appointment->booking_date?->format('F j, Y') ?? 'the scheduled date';
        $isApproved = $status === 'approved';
        $type = $isApproved ? 'clinic_animal_approved' : 'clinic_animal_cancelled';
        $title = $isApproved
            ? "{$petName} approved"
            : "{$petName} cancelled from appointment";
        $message = $isApproved
            ? "{$petName} has been approved for your {$dateLabel} visit."
            : "{$petName} was cancelled from your {$dateLabel} appointment.";

        $reason = trim((string) $reason);
        if (!$isApproved && $reason !== '') {
            $message .= " Reason: {$reason}";
        }

        $payload = self::basePayload($appointment, $status, [
            'pet_name' => $petName,
            'cancellation_reason' => $reason !== '' ? $reason : null,
        ]);

        Notification::create([
            'user_id' => $user->id,
            'type' => $type,
            'title' => $title,
            'message' => $message,
            'data' => $payload,
        ]);

        broadcast(new ServiceNotificationCreated(
            $user->id,
            $title,
            $message,
            $payload,
            $type
        ));
    }

    /**
     * Send day-of reminders to clients with clinic or home-service bookings today.
     *
     * @return int Number of reminders sent
     */
    // Diri ipadala ang tanang pahinumdom karong adlawa.
    public static function notifyTodayReminders(): int
    {
        $today = now()->toDateString();
        $sent = 0;

        $appointments = Appointment::query()
            ->whereIn('booking_type', ['appointment', 'home_service'])
            ->whereDate('booking_date', $today)
            ->whereIn('status', ['approved', 'ongoing'])
            ->with(['user', 'animal', 'treatmentTypes'])
            ->orderBy('booking_time')
            ->get();

        foreach ($appointments as $appointment) {
            if (self::notifyToday($appointment)) {
                $sent++;
            }
        }

        return $sent;
    }

    /**
     * Notify a client that their clinic appointment or home service is today.
     * Skips if a today reminder was already sent for this appointment on this date.
     */
    // Diri pahinumdoman ang client sa appointment karon.
    public static function notifyToday(Appointment $appointment): bool
    {
        $appointment->loadMissing(['user', 'animal', 'treatmentTypes']);

        $user = $appointment->user;
        if (!$user) {
            return false;
        }

        if (!in_array($appointment->booking_type, ['appointment', 'home_service'], true)) {
            return false;
        }

        if (!in_array($appointment->status, ['approved', 'ongoing'], true)) {
            return false;
        }

        $bookingDate = $appointment->booking_date?->format('Y-m-d');
        if (!$bookingDate || $bookingDate !== now()->toDateString()) {
            return false;
        }

        $isHomeService = $appointment->isHomeService();
        $type = $isHomeService ? 'home_service_today' : 'clinic_appointment_today';

        $alreadySent = Notification::query()
            ->where('user_id', $user->id)
            ->where('type', $type)
            ->where('data->appointment_id', $appointment->id)
            ->whereDate('created_at', now()->toDateString())
            ->exists();

        if ($alreadySent) {
            return false;
        }

        $title = $isHomeService ? 'Home Service Today' : 'Clinic Appointment Today';
        $message = self::buildTodayMessage($appointment);
        $payload = self::basePayload($appointment, 'today');

        Notification::create([
            'user_id' => $user->id,
            'type' => $type,
            'title' => $title,
            'message' => $message,
            'data' => $payload,
        ]);

        broadcast(new ServiceNotificationCreated(
            $user->id,
            $title,
            $message,
            $payload,
            $type
        ));

        return true;
    }

    // Diri himuon ang mensahe sa approved appointment.
    public static function buildApprovedMessage(Appointment $appointment): string
    {
        $appointment->loadMissing(['animal', 'treatmentTypes']);

        $petName = $appointment->petNamesLabel('your pet');
        $dateLabel = $appointment->booking_date?->format('F j, Y') ?? 'the scheduled date';
        $timeLabel = self::formatBookingTime($appointment->booking_time);
        $servicesLabel = self::formatServices($appointment);

        if ($appointment->isHomeService()) {
            $base = "Your home service visit for {$petName} on {$dateLabel} at {$timeLabel} has been approved.";
            if ($servicesLabel !== '') {
                $base .= " Services: {$servicesLabel}.";
            }
            return $base . ' Our field team will visit your meeting place at the scheduled time.';
        }

        $base = "Your clinic appointment for {$petName} on {$dateLabel} at {$timeLabel} has been approved.";
        if ($servicesLabel !== '') {
            $base .= " Services: {$servicesLabel}.";
        }
        return $base . ' Please arrive at the clinic before your scheduled time.';
    }

    // Diri himuon ang mensahe sa na-cancel nga appointment.
    public static function buildCancelledMessage(Appointment $appointment, ?string $reason = null): string
    {
        $appointment->loadMissing(['animal', 'treatmentTypes']);

        $petName = $appointment->petNamesLabel('your pet');
        $dateLabel = $appointment->booking_date?->format('F j, Y') ?? 'the scheduled date';
        $timeLabel = self::formatBookingTime($appointment->booking_time);
        $servicesLabel = self::formatServices($appointment);
        $reason = trim((string) ($reason ?? $appointment->cancellation_reason ?? ''));

        if ($appointment->isHomeService()) {
            $message = "Your home service visit for {$petName} on {$dateLabel} at {$timeLabel} has been cancelled.";
        } else {
            $message = "Your clinic appointment for {$petName} on {$dateLabel} at {$timeLabel} has been cancelled.";
        }

        if ($servicesLabel !== '') {
            $message .= " Services: {$servicesLabel}.";
        }

        if ($reason !== '') {
            $message .= " Reason: {$reason}";
        }

        return $message;
    }

    // Diri himuon ang mensahe sa pahinumdom karon.
    public static function buildTodayMessage(Appointment $appointment): string
    {
        $appointment->loadMissing(['animal', 'treatmentTypes']);

        $petName = $appointment->petNamesLabel('your pet');
        $timeLabel = self::formatBookingTime($appointment->booking_time);
        $servicesLabel = self::formatServices($appointment);

        if ($appointment->isHomeService()) {
            $message = "Reminder: your home service visit for {$petName} is today at {$timeLabel}.";
            if ($servicesLabel !== '') {
                $message .= " Services: {$servicesLabel}.";
            }
            return $message . ' Please be ready at your meeting place.';
        }

        $message = "Reminder: your clinic appointment for {$petName} is today at {$timeLabel}.";
        if ($servicesLabel !== '') {
            $message .= " Services: {$servicesLabel}.";
        }
        return $message . ' Please arrive at the clinic before your scheduled time.';
    }

    // Diri himuon ang mensahe base sa status.
    public static function buildStatusMessage(Appointment $appointment): ?string
    {
        return match ($appointment->status) {
            'approved' => self::buildApprovedMessage($appointment),
            'cancelled' => self::buildCancelledMessage($appointment),
            default => null,
        };
    }

    /**
     * @param array<string, mixed> $extra
     * @return array<string, mixed>
     */
    // Diri andamon ang data sa notification sa appointment.
    private static function basePayload(Appointment $appointment, string $status, array $extra = []): array
    {
        return array_merge([
            'appointment_id' => $appointment->id,
            'pet_name' => $appointment->petNamesLabel('your pet'),
            'booking_date' => $appointment->booking_date?->format('Y-m-d'),
            'booking_time' => BookingTimeHelper::normalizeToHi($appointment->booking_time),
            'booking_type' => $appointment->booking_type,
            'booking_type_label' => BookingTypeLabel::label($appointment->booking_type),
            'status' => $status,
            'services' => $appointment->treatmentTypes
                ?->pluck('type_name')
                ->filter()
                ->values()
                ->all() ?? [],
        ], $extra);
    }

    // Diri i-format ang lista sa serbisyo.
    private static function formatServices(Appointment $appointment): string
    {
        $services = $appointment->treatmentTypes
            ?->pluck('type_name')
            ->filter()
            ->values()
            ->all() ?? [];

        return implode(', ', $services);
    }

    // Diri i-format ang oras sa booking.
    private static function formatBookingTime(?string $bookingTime): string
    {
        $normalized = BookingTimeHelper::normalizeToHi($bookingTime);
        if (!$normalized) {
            return 'the scheduled time';
        }

        try {
            return Carbon::createFromFormat('H:i', $normalized)->format('g:i A');
        } catch (\Exception $e) {
            return $normalized;
        }
    }
}
