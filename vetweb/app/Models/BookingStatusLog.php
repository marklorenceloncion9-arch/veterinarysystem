<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BookingStatusLog extends Model
{
    protected $fillable = [
        'booking_id',
        'status',
        'changed_by_user_id',
        'changed_by_name',
        'notes',
        'changed_at',
    ];

    protected $casts = [
        'changed_at' => 'datetime',
    ];

    // Diri ang booking sa status log.
    public function booking(): BelongsTo
    {
        return $this->belongsTo(Appointment::class, 'booking_id');
    }

    // Diri ang user nga nag-usab sa status.
    public function changedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'changed_by_user_id');
    }
}
