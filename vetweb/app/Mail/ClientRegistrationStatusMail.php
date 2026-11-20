<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class ClientRegistrationStatusMail extends Mailable
{
    use Queueable, SerializesModels;

    // Diri tipigan ang client ug resulta sa registration.
    public function __construct(
        public string $recipientName,
        public string $status,
        public string $bodyMessage,
    ) {}

    // Diri ang subject sa email sa registration status.
    public function envelope(): Envelope
    {
        $subject = match ($this->status) {
            'approved' => 'Account Approved - El Salvador Vet Clinic',
            'pending' => 'Registration Received - El Salvador Vet Clinic',
            default => 'Account Registration Update - El Salvador Vet Clinic',
        };

        return new Envelope(
            from: config('mail.from.address'),
            subject: $subject,
        );
    }

    // Diri ang sulod sa email sa registration status.
    public function content(): Content
    {
        return new Content(
            htmlString: $this->getHtmlContent(),
        );
    }

    // Diri himuon ang HTML sa email sa registration status.
    private function getHtmlContent(): string
    {
        $name = e($this->recipientName !== '' ? $this->recipientName : 'there');
        $message = nl2br(e($this->bodyMessage));
        $title = match ($this->status) {
            'approved' => 'Account Approved',
            'pending' => 'Registration Received',
            default => 'Registration Update',
        };
        $headerColor = match ($this->status) {
            'approved' => 'linear-gradient(135deg, #059669 0%, #047857 100%)',
            'pending' => 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
            default => 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
        };

        return <<<HTML
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
        .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
        .header { background: {$headerColor}; color: #ffffff; text-align: center; padding: 28px 20px; }
        .header .brand { font-size: 22px; font-weight: bold; letter-spacing: 0.5px; }
        .header .title { margin-top: 8px; font-size: 16px; opacity: 0.95; }
        .body { padding: 28px; color: #374151; line-height: 1.6; }
        .footer { text-align: center; color: #9ca3af; font-size: 12px; padding: 20px; border-top: 1px solid #f0f0f0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="brand">El Salvador Vet Clinic</div>
            <div class="title">{$title}</div>
        </div>
        <div class="body">
            <p>Hi {$name},</p>
            <p>{$message}</p>
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
}
