<?php

namespace App\Services;

use App\Events\ServiceNotificationCreated;
use App\Mail\RegistrationFeeChangedMail;
use App\Models\Notification;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class RegistrationFeeNotificationService
{
    // Diri pahibaw-on ang mga client sa bag-ong registration fee.
    public static function notifyClients(
        float $oldAmount,
        float $newAmount,
        Carbon $effectiveDate,
        ?string $reason = null
    ): int {
        $effectiveDateLabel = $effectiveDate->format('F j, Y');
        $oldFormatted = self::formatCurrency($oldAmount);
        $newFormatted = self::formatCurrency($newAmount);
        $message = self::buildMessage($oldFormatted, $newFormatted, $effectiveDateLabel, $reason);

        $payload = [
            'old_amount' => $oldAmount,
            'new_amount' => $newAmount,
            'old_amount_formatted' => $oldFormatted,
            'new_amount_formatted' => $newFormatted,
            'effective_date' => $effectiveDate->toDateString(),
            'effective_date_formatted' => $effectiveDateLabel,
            'reason' => $reason,
        ];

        $title = 'Pet Registration Fee Updated';
        $notifiedCount = 0;

        User::query()
            ->where('role', 'client')
            ->where('approval_status', 'approved')
            ->orderBy('id')
            ->chunkById(100, function ($clients) use (
                $title,
                $message,
                $payload,
                $oldFormatted,
                $newFormatted,
                $effectiveDateLabel,
                $reason,
                &$notifiedCount
            ) {
                foreach ($clients as $client) {
                    Notification::create([
                        'user_id' => $client->id,
                        'type' => 'registration_fee_changed',
                        'title' => $title,
                        'message' => $message,
                        'data' => $payload,
                    ]);

                    broadcast(new ServiceNotificationCreated(
                        $client->id,
                        $title,
                        $message,
                        $payload,
                        'registration_fee_changed'
                    ));

                    self::sendEmail(
                        $client,
                        $oldFormatted,
                        $newFormatted,
                        $effectiveDateLabel,
                        $message,
                        $reason
                    );

                    $notifiedCount++;
                }
            });

        return $notifiedCount;
    }

    // Diri himuon ang mensahe sa bag-ong fee.
    private static function buildMessage(
        string $oldFormatted,
        string $newFormatted,
        string $effectiveDateLabel,
        ?string $reason
    ): string {
        $message = "The pet registration fee has been updated from {$oldFormatted} to {$newFormatted}, effective {$effectiveDateLabel}.";

        $reason = trim((string) $reason);
        if ($reason !== '') {
            $message .= " Reason: {$reason}";
        }

        return $message;
    }

    // Diri ipadala ang email sa bag-ong fee.
    private static function sendEmail(
        User $user,
        string $oldFormatted,
        string $newFormatted,
        string $effectiveDateLabel,
        string $message,
        ?string $reason
    ): void {
        if (!self::canSendEmail($user->email)) {
            return;
        }

        $recipientName = trim(($user->firstname ?? '') . ' ' . ($user->lastname ?? ''));
        if ($recipientName === '') {
            $recipientName = (string) ($user->name ?? '');
        }

        try {
            Mail::to($user->email)->send(new RegistrationFeeChangedMail(
                $recipientName,
                $oldFormatted,
                $newFormatted,
                $effectiveDateLabel,
                $message,
                $reason
            ));
        } catch (\Throwable $e) {
            Log::error("Failed to email registration fee update to {$user->email}: " . $e->getMessage());
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

    // Diri i-format ang kantidad isip peso.
    private static function formatCurrency(float $amount): string
    {
        return '₱' . number_format($amount, 2);
    }
}
