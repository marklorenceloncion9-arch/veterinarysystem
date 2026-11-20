<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Barangay extends Model
{
    protected $fillable = [
        'name',
        'photo_url',
    ];

    /**
     * Get the users associated with this barangay.
     */
    // Diri ang mga user sa barangay.
    public function users()
    {
        return $this->hasMany(User::class);
    }

    /**
     * Get the zones within this barangay.
     */
    // Diri ang mga zone sa barangay.
    public function zones()
    {
        return $this->hasMany(Zone::class)->orderByRaw(Zone::NATURAL_ORDER);
    }
}
