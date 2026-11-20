<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VeterinarianProfile extends Model
{
    protected $fillable = [
        'firstname',
        'lastname',
        'email',
        'barangay_id',
        'zone',
        'profile_photo_url',
        'title',
    ];

    // Diri ang barangay sa vet profile.
    public function barangay()
    {
        return $this->belongsTo(Barangay::class);
    }

    // Diri kuhaon ang ipakita nga ngalan sa vet.
    public function displayName(): string
    {
        return trim(($this->firstname ?? '') . ' ' . ($this->lastname ?? ''));
    }
}
