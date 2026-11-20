<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Unit extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'is_liquid'];

    protected $casts = [
        'is_liquid' => 'boolean'
    ];

    // Diri ang mga inventory batch sa unit.
    public function inventories()
    {
        return $this->hasMany(Inventory::class);
    }
}
