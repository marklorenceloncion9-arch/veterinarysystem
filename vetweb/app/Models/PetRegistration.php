<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PetRegistration extends Model
{
    use HasFactory;

    protected $table = 'pet_registrations';

    protected $fillable = [
        'animal_id',
        'client_id',
        'payment_type_id',
        'amount',
        'status',
        'payment_method',
        'paid_at',
        'notes',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'paid_at' => 'datetime',
    ];

    // Diri ang hayop sa pet registration.
    public function animal()
    {
        return $this->belongsTo(Animal::class, 'animal_id');
    }

    // Diri ang pet sa registration.
    public function pet()
    {
        return $this->belongsTo(Animal::class, 'animal_id');
    }

    // Diri ang client sa pet registration.
    public function client()
    {
        return $this->belongsTo(User::class, 'client_id');
    }

    // Diri ang payment type sa pet registration.
    public function paymentType()
    {
        return $this->belongsTo(PaymentType::class);
    }
}
