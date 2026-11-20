<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Medicine extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'category_id'];

    // Diri ang category sa tambal.
    public function category()
    {
        return $this->belongsTo(Category::class);
    }

    // Diri ang mga inventory batch sa tambal.
    public function inventories(): HasMany
    {
        return $this->hasMany(Inventory::class);
    }

    // Diri ang mga log sa inventory sa tambal.
    public function inventoryLogs(): HasMany
    {
        return $this->hasMany(InventoryLog::class);
    }
}
