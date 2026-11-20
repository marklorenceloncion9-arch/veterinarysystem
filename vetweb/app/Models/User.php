<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasFactory, Notifiable, HasApiTokens;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'password_setup_required',
        'lastname',
        'firstname',
        'middlename',
        'age',
        'barangay_id',
        'zone',
        'street',
        'street_latitude',
        'street_longitude',
        'facebook',
        'phone_number',
        'profile_photo_url',
        'id_document_url',
        'approval_status',
        'role',
        'email_verified_at',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
        'access_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    /**
     * Get the barangay associated with the user.
     */
    // Diri ang barangay sa user.
    public function barangay()
    {
        return $this->belongsTo(Barangay::class);
    }

    /**
     * Get the animals owned by the user.
     */
    // Diri ang mga hayop sa user.
    public function animals()
    {
        return $this->hasMany(Animal::class)->orderByDesc('created_at');
    }

    /**
     * Get the in-app notifications for this user.
     */
    // Diri ang mga notification sa user.
    public function notifications()
    {
        return $this->hasMany(Notification::class);
    }

    /**
     * Get the pets owned by the user (backward compatibility).
     */
    // Diri ang mga pet sa user.
    public function pets()
    {
        return $this->hasMany(Animal::class);
    }

    // Diri susihon kung approved na ang client.
    public function isClientApproved(): bool
    {
        return $this->approval_status === 'approved';
    }

    // Diri susihon kung naghulat pa og approval ang client.
    public function isClientPendingApproval(): bool
    {
        return $this->role === 'client' && $this->approval_status === 'pending';
    }

    // Diri ang casts sa mga field sa user.
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }
}
