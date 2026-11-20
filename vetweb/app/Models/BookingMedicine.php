<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BookingMedicine extends Model
{
    use HasFactory;

    protected $fillable = [
        'booking_id',
        'animal_id',
        'inventory_id',
        'medicine_id',
        'quantity_used',
        'unit_name',
        'dosage_ml',
    ];

    protected $casts = [
        'quantity_used' => 'decimal:3',
        'dosage_ml' => 'decimal:2',
    ];

    // Diri ang booking sa tambal.
    public function booking(): BelongsTo
    {
        return $this->belongsTo(Appointment::class, 'booking_id');
    }

    // Diri ang hayop nga gihatagan og tambal.
    public function animal(): BelongsTo
    {
        return $this->belongsTo(Animal::class, 'animal_id');
    }

    // Diri ang batch sa inventory sa tambal.
    public function inventory(): BelongsTo
    {
        return $this->belongsTo(Inventory::class);
    }

    // Diri ang tambal nga gigamit.
    public function medicine(): BelongsTo
    {
        return $this->belongsTo(Medicine::class);
    }
}
