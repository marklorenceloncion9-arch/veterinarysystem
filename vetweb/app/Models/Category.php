<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Category extends Model
{
    use HasFactory;

    protected $fillable = ['name'];

    // Diri ang mga tambal sa category.
    public function medicines()
    {
        return $this->hasMany(Medicine::class);
    }
}
