<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Species extends Model
{
    protected $fillable = ['species_name', 'type_id', 'vhc_fee'];

    protected $casts = [
        'vhc_fee' => 'decimal:2',
    ];

    // Diri ang animal type sa species.
    public function animalType()
    {
        return $this->belongsTo(AnimalType::class, 'type_id');
    }

    // Diri ang mga breed sa species.
    public function breeds()
    {
        return $this->hasMany(Breed::class);
    }
}
