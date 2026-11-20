<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class OtpCode extends Model
{
    use HasFactory;

    protected $fillable = [
        'email',
        'code',
        'purpose',
        'expires_at',
        'is_used',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
        'is_used' => 'boolean',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    /**
     * Check if OTP is valid
     */
    // Diri susihon kung valid pa ang OTP.
    public function isValid(): bool
    {
        return !$this->is_used && $this->expires_at->isFuture();
    }

    /**
     * Mark OTP as used
     */
    // Diri markahan nga nagamit na ang OTP.
    public function markAsUsed(): void
    {
        $this->update(['is_used' => true]);
    }

    /**
     * Generate a new 6-digit OTP
     */
    // Diri himuon ang random nga OTP code.
    public static function generateCode(): string
    {
        return str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    }

    /**
     * Create OTP for email
     */
    // Diri himuon ang bag-ong OTP para sa email.
    public static function createForEmail(string $email, string $purpose = 'password_reset', int $expiresInMinutes = 10): self
    {
        // Invalidate old unused OTPs
        self::where('email', $email)
            ->where('purpose', $purpose)
            ->where('is_used', false)
            ->update(['is_used' => true]);

        return self::create([
            'email' => $email,
            'code' => self::generateCode(),
            'purpose' => $purpose,
            'expires_at' => now()->addMinutes($expiresInMinutes),
            'is_used' => false,
        ]);
    }

    /**
     * Verify OTP for email
     */
    // Diri susihon ang OTP sa email ug katuyoan.
    public static function verify(string $email, string $code, string $purpose = 'password_reset'): ?self
    {
        $otp = self::where('email', $email)
            ->where('code', $code)
            ->where('purpose', $purpose)
            ->where('is_used', false)
            ->where('expires_at', '>', now())
            ->first();

        return $otp;
    }
}
