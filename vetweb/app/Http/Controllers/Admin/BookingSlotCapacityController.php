<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\BookingSlotService;
use Illuminate\Http\Request;

class BookingSlotCapacityController extends Controller
{
    // Diri ipakita ang slot capacity sa gipili nga petsa.
    public function show(Request $request)
    {
        $validated = $request->validate([
            'date' => 'required|date',
        ]);

        $date = $validated['date'];

        return response()->json($this->payload($date));
    }

    // Diri i-save ang bag-ong slot capacity sa petsa.
    public function update(Request $request)
    {
        $validated = $request->validate([
            'date' => 'required|date',
            'slots' => 'required|array|min:1',
            'slots.*.time' => 'required|date_format:H:i',
            'slots.*.capacity' => 'required|integer|min:0|max:'.BookingSlotService::MAX_CAPACITY,
            'summary' => 'nullable|string|max:255',
        ]);

        $date = $validated['date'];

        BookingSlotService::saveDaySlots(
            $date,
            $validated['slots'],
            $request->user()?->id,
            $validated['summary'] ?? null
        );

        return response()->json($this->payload($date, true));
    }

    /**
     * @return array<string, mixed>
     */
    // Diri andamon ang slots ug history sa capacity sa petsa.
    private function payload(string $date, bool $saved = false): array
    {
        $slots = BookingSlotService::adminDaySlots($date);

        return [
            'success' => true,
            'saved' => $saved,
            'date' => $date,
            'default_capacity' => BookingSlotService::DEFAULT_CAPACITY,
            'max_capacity' => BookingSlotService::MAX_CAPACITY,
            'hour_count' => BookingSlotService::hourlySlotCount(),
            'max_day_capacity' => BookingSlotService::maxDayCapacity(),
            'slots' => $slots,
            'history' => BookingSlotService::recentChanges(),
        ];
    }
}
