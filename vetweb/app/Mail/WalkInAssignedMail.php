<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class WalkInAssignedMail extends Mailable
{
    use Queueable, SerializesModels;

    public string $recipientName;
    public string $petName;
    public string $clientName;
    public string $dateFormatted;
    public string $timeFormatted;
    public string $bodyMessage;

    /** @var array<int, string> */
    public array $services;

    public string $bookingTypeLabel;

    public string $subjectLine;

    /**
     * @param array<int, string> $services
     */
    // Diri tipigan ang detalye sa assigned nga walk-in.
    public function __construct(
        string $recipientName,
        string $petName,
        string $clientName,
        string $dateFormatted,
        string $timeFormatted,
        string $bodyMessage,
        array $services,
        string $bookingTypeLabel = 'Walk-in',
        string $subjectLine = 'Walk-in Service Assigned - Vetcare'
    ) {
        $this->recipientName = $recipientName;
        $this->petName = $petName;
        $this->clientName = $clientName;
        $this->dateFormatted = $dateFormatted;
        $this->timeFormatted = $timeFormatted;
        $this->bodyMessage = $bodyMessage;
        $this->services = $services;
        $this->bookingTypeLabel = $bookingTypeLabel;
        $this->subjectLine = $subjectLine;
    }

    // Diri ang subject sa email sa assigned nga booking.
    public function envelope(): Envelope
    {
        return new Envelope(
            from: config('mail.from.address'),
            subject: $this->subjectLine,
        );
    }

    // Diri ang sulod sa email sa assigned nga booking.
    public function content(): Content
    {
        return new Content(
            htmlString: $this->getHtmlContent(),
        );
    }

    // Diri himuon ang HTML sa email sa assigned nga booking.
    private function getHtmlContent(): string
    {
        $name = e($this->recipientName !== '' ? $this->recipientName : 'there');
        $pet = e($this->petName);
        $client = e($this->clientName);
        $message = nl2br(e($this->bodyMessage));
        $date = e($this->dateFormatted);
        $time = e($this->timeFormatted);
        $bookingType = e($this->bookingTypeLabel);

        $serviceChips = collect($this->services)
            ->map(fn ($service) => '<span class="chip">' . e($service) . '</span>')
            ->implode(' ');

        $servicesRow = $serviceChips !== ''
            ? <<<HTML
                <div class="row">
                    <p class="label">Services</p>
                    <p class="value">{$serviceChips}</p>
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
        .header { background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%); color: #ffffff; text-align: center; padding: 28px 20px; }
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
        .chip { display: inline-block; background: #ede9fe; color: #5b21b6; border-radius: 999px; padding: 4px 12px; font-size: 13px; font-weight: 600; margin: 2px 4px 2px 0; }
        .footer { text-align: center; color: #9ca3af; font-size: 12px; padding: 20px; border-top: 1px solid #f0f0f0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="brand">Vetcare</div>
            <div class="title">{$bookingType} Assigned</div>
        </div>

        <div class="body">
            <p class="greeting">Hi {$name},</p>
            <p class="message">{$message}</p>

            <div class="details">
                <div class="row">
                    <p class="label">Booking Type</p>
                    <p class="value">{$bookingType}</p>
                </div>
                <div class="row">
                    <p class="label">Client</p>
                    <p class="value">{$client}</p>
                </div>
                <div class="row">
                    <p class="label">Pet</p>
                    <p class="value">{$pet}</p>
                </div>
                <div class="row">
                    <p class="label">Date</p>
                    <p class="value">{$date}</p>
                </div>
                <div class="row">
                    <p class="label">Time</p>
                    <p class="value">{$time}</p>
                </div>
                {$servicesRow}
            </div>
        </div>

        <div class="footer">
            <p>Vetcare &mdash; Veterinary Services</p>
            <p>Open the Vetcare fieldman app to view this assignment.</p>
            <p>This is an automated email, please do not reply.</p>
        </div>
    </div>
</body>
</html>
HTML;
    }
}
