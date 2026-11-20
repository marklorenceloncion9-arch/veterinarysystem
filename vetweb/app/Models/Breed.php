<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Breed extends Model
{
    protected $fillable = ['breed_name', 'species_id'];

    // Diri ang species sa breed.
    public function species()
    {
        return $this->belongsTo(Species::class);
    }
}
