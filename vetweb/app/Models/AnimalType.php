<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AnimalType extends Model
{
    protected $fillable = ['type_name'];

    // Diri ang mga species ubos sa animal type.
    public function species()
    {
        return $this->hasMany(Species::class, 'type_id');
    }
}
