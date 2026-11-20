<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BookingSlotCapacityChange extends Model
{
    use HasFactory;

    protected $fillable = [
        'slot_date',
        'changed_by',
        'summary',
        'before_slots',
        'after_slots',
    ];

    protected $casts = [
        'slot_date' => 'date',
        'before_slots' => 'array',
        'after_slots' => 'array',
    ];

    // Diri ang user nga nag-usab sa slot capacity.
    public function changer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'changed_by');
    }
}
