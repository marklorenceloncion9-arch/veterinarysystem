<?php

namespace App\Support;

use App\Models\User;

class OwnerDisplayHelper
{
    // Diri kuhaon ang ipakita nga ngalan sa tag-iya.
    public static function displayName(?User $user): string
    {
        if (!$user) {
            return 'Unknown';
        }

        $name = trim(implode(' ', array_filter([$user->firstname, $user->lastname])));

        return $name !== '' ? $name : ($user->name ?: 'Unknown');
    }

    // Diri kuhaon ang label sa approval status.
    public static function approvalLabel(?string $status): ?string
    {
        return match ($status) {
            'pending' => 'Under Review',
            'approved' => 'Approved',
            'rejected' => 'Rejected',
            default => null,
        };
    }

    /**
     * @return array<string, mixed>
     */
    // Diri i-format ang tag-iya para sa appointment.
    public static function toAppointmentUserArray(?User $user): array
    {
        if (!$user) {
            return [
                'id' => null,
                'firstname' => null,
                'lastname' => null,
                'name' => 'Unknown',
                'email' => null,
                'phone_number' => null,
                'profile_photo_url' => null,
                'barangay' => null,
                'barangay_id' => null,
                'zone' => null,
                'street' => null,
                'approval_status' => null,
                'approval_label' => null,
            ];
        }

        $user->loadMissing('barangay');

        return [
            'id' => $user->id,
            'firstname' => $user->firstname,
            'lastname' => $user->lastname,
            'name' => self::displayName($user),
            'email' => $user->email,
            'phone_number' => $user->phone_number,
            'profile_photo_url' => $user->profile_photo_url,
            'barangay' => $user->barangay?->name,
            'barangay_id' => $user->barangay_id,
            'zone' => $user->zone,
            'street' => $user->street,
            'street_latitude' => $user->street_latitude,
            'street_longitude' => $user->street_longitude,
            'approval_status' => $user->approval_status,
            'approval_label' => self::approvalLabel($user->approval_status),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    // Diri i-format ang naka-login nga user para sa frontend.
    public static function toAuthUserArray(User $user): array
    {
        $user->loadMissing('barangay');

        return [
            'id' => $user->id,
            'name' => self::displayName($user),
            'email' => $user->email,
            'firstname' => $user->firstname,
            'lastname' => $user->lastname,
            'middlename' => $user->middlename,
            'age' => $user->age,
            'phone_number' => $user->phone_number,
            'facebook' => $user->facebook,
            'barangay_id' => $user->barangay_id,
            'barangay' => $user->barangay?->name,
            'zone' => $user->zone,
            'street' => $user->street,
            'street_latitude' => $user->street_latitude,
            'street_longitude' => $user->street_longitude,
            'profile_photo_url' => $user->profile_photo_url,
            'created_at' => optional($user->created_at)?->toIso8601String(),
            'role' => $user->role,
            'approval_status' => $user->approval_status,
            'approval_label' => self::approvalLabel($user->approval_status),
            'account_under_review' => $user->role === 'client' && $user->approval_status === 'pending',
        ];
    }
}
