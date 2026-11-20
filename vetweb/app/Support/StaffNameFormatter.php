<?php

namespace App\Support;

use App\Models\User;

class StaffNameFormatter
{
    // Diri kuhaon ang ipakita nga ngalan sa staff.
    public static function displayName(User $user): string
    {
        $parts = array_filter([
            $user->firstname,
            $user->middlename,
            $user->lastname,
        ], fn ($part) => $part !== null && trim((string) $part) !== '');

        $fullName = trim(implode(' ', $parts));
        if ($fullName !== '') {
            return $fullName;
        }

        $name = trim((string) ($user->name ?? ''));

        return $name !== '' ? $name : 'Unknown';
    }
}
