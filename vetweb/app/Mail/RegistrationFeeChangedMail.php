<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class RegistrationFeeChangedMail extends Mailable
{
    use Queueable, SerializesModels;

    // Diri tipigan ang detalye sa nausab nga registration fee.
    public function __construct(
        public string $recipientName,
        public string $oldAmountFormatted,
        public string $newAmountFormatted,
        public string $effectiveDateFormatted,
        public string $bodyMessage,
        public ?string $reason = null,
    ) {}

    // Diri ang subject sa email sa bag-ong registration fee.
    public function envelope(): Envelope
    {
        return new Envelope(
            from: config('mail.from.address'),
            subject: 'Pet Registration Fee Update - El Salvador Vet Clinic',
        );
    }

    // Diri ang sulod sa email sa bag-ong registration fee.
    public function content(): Content
    {
        return new Content(
            htmlString: $this->getHtmlContent(),
        );
    }

    // Diri himuon ang HTML sa email sa registration fee.
    private function getHtmlContent(): string
    {
        $name = e($this->recipientName !== '' ? $this->recipientName : 'there');
        $message = nl2br(e($this->bodyMessage));
        $oldAmount = e($this->oldAmountFormatted);
        $newAmount = e($this->newAmountFormatted);
        $effectiveDate = e($this->effectiveDateFormatted);

        $reasonRow = $this->reason !== null && trim($this->reason) !== ''
            ? <<<HTML
                <div class="row">
                    <p class="label">Reason</p>
                    <p class="value reason">{$this->escapeMultiline($this->reason)}</p>
                </div>
            HTML
            : '';

        return <<<HTML
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
        .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
        .header { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #ffffff; text-align: center; padding: 28px 20px; }
        .header .brand { font-size: 22px; font-weight: bold; letter-spacing: 0.5px; }
        .header .title { margin-top: 8px; font-size: 16px; opacity: 0.95; }
        .body { padding: 28px 28px 8px; color: #374151; line-height: 1.6; }
        .greeting { font-size: 16px; margin: 0 0 12px; }
        .message { color: #4b5563; margin: 0 0 20px; }
        .details { background: #f9fafb; border: 1px solid #eef0f3; border-radius: 10px; padding: 18px 20px; margin: 8px 0 20px; }
        .row { margin-bottom: 14px; }
        .row:last-child { margin-bottom: 0; }
        .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; color: #9ca3af; margin: 0 0 4px; }
        .value { font-size: 15px; font-weight: 600; color: #111827; margin: 0; }
        .value.reason { font-weight: 500; font-size: 14px; line-height: 1.5; }
        .footer { text-align: center; color: #9ca3af; font-size: 12px; padding: 20px; border-top: 1px solid #f0f0f0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="brand">El Salvador Vet Clinic</div>
            <div class="title">Pet Registration Fee Update</div>
        </div>

        <div class="body">
            <p class="greeting">Hi {$name},</p>
            <p class="message">{$message}</p>

            <div class="details">
                <div class="row">
                    <p class="label">Previous Fee</p>
                    <p class="value">{$oldAmount}</p>
                </div>
                <div class="row">
                    <p class="label">New Fee</p>
                    <p class="value">{$newAmount}</p>
                </div>
                <div class="row">
                    <p class="label">Effective Date</p>
                    <p class="value">{$effectiveDate}</p>
                </div>
                {$reasonRow}
            </div>
        </div>

        <div class="footer">
            <p>El Salvador Vet Clinic &mdash; Veterinary Services</p>
            <p>This is an automated email, please do not reply.</p>
        </div>
    </div>
</body>
</html>
HTML;
    }

    // Diri i-escape ang text ug ilisan ang newline og br.
    private function escapeMultiline(string $text): string
    {
        return nl2br(e(trim($text)));
    }
}
