<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OutsidePurchaseItem extends Model
{
    public const DEFAULT_STATUS = 'Approved by the clinic';

    // Diri i-normalize ang status nga ipakita sa resibo.
    public static function displayStatus(?string $status): string
    {
        $value = trim((string) $status);
        if ($value === '' || strcasecmp($value, 'Not available') === 0) {
            return self::DEFAULT_STATUS;
        }

        return $value;
    }

    protected $fillable = [
        'booking_id',
        'animal_id',
        'item_name',
        'quantity',
        'status',
        'issued_at',
    ];

    protected $casts = [
        'quantity' => 'decimal:3',
        'issued_at' => 'datetime',
    ];

    // Diri ang booking sa resibo nga paliton sa gawas.
    public function booking(): BelongsTo
    {
        return $this->belongsTo(Appointment::class, 'booking_id');
    }

    // Diri ang hayop nga naa sa resibo.
    public function animal(): BelongsTo
    {
        return $this->belongsTo(Animal::class, 'animal_id');
    }
}
