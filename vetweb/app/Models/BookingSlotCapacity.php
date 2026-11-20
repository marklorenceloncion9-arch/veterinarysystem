<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BookingSlotCapacity extends Model
{
    use HasFactory;

    protected $fillable = [
        'slot_date',
        'start_time',
        'capacity',
    ];

    protected $casts = [
        'slot_date' => 'date',
        'capacity' => 'integer',
    ];
}
