<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\OwnerDisplayHelper;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class UserController extends Controller
{
    /**
     * Get user profile
     */
    // Diri kuhaon ang profile sa naka-login nga user.
    public function profile(Request $request)
    {
        $user = $request->user()->loadMissing('barangay');
        
        return response()->json([
            'success' => true,
            'user' => OwnerDisplayHelper::toAuthUserArray($user),
        ]);
    }

    /**
     * Update user profile
     */
    // Diri usbon ang profile sa user.
    public function update(Request $request)
    {
        $user = $request->user();
        
        $validator = Validator::make($request->all(), [
            'name' => 'sometimes|string|max:255',
            'firstname' => 'sometimes|string|max:255',
            'lastname' => 'sometimes|string|max:255',
            'middlename' => 'sometimes|string|max:255',
            'age' => 'sometimes|integer|min:0|max:150',
            'phone_number' => 'sometimes|string|max:20',
            'facebook' => 'sometimes|string|max:255',
            'barangay_id' => 'sometimes|exists:barangays,id',
            'zone' => 'sometimes|string|max:255',
            'street' => 'sometimes|nullable|string|max:255',
            'street_latitude' => 'sometimes|nullable|numeric|between:-90,90',
            'street_longitude' => 'sometimes|nullable|numeric|between:-180,180',
            'profile_photo_url' => 'sometimes|nullable|url|max:2048',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'error' => 'Validation failed',
                'messages' => $validator->errors()
            ], 422);
        }

        $user->update($request->only([
            'name', 'firstname', 'lastname', 'middlename', 
            'age', 'phone_number', 'facebook', 'barangay_id', 'zone', 'street',
            'street_latitude', 'street_longitude', 'profile_photo_url'
        ]));

        return response()->json([
            'success' => true,
            'user' => OwnerDisplayHelper::toAuthUserArray($user->fresh()),
        ]);
    }
}
