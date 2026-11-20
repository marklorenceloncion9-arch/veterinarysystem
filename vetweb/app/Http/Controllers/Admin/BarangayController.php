<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Barangay;
use Illuminate\Http\Request;

class BarangayController extends Controller
{
    /**
     * Update barangay details shown on the city map.
     */
    // Diri usbon ang detalye sa barangay.
    public function update(Request $request, Barangay $barangay)
    {
        $validated = $request->validate([
            'photo_url' => 'nullable|string|max:2048',
        ]);

        $barangay->update([
            'photo_url' => isset($validated['photo_url']) ? trim($validated['photo_url']) ?: null : $barangay->photo_url,
        ]);

        return back()->with('success', "{$barangay->name} updated successfully.");
    }
}
