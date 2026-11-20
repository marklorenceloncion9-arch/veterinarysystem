<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use Carbon\Carbon;
use Illuminate\Http\Request;

class DashboardCalendarController extends Controller
{
    /**
     * Bookings grouped by day for one month, so the dashboard calendar can show
     * how busy each day is and list the visits when a day is selected.
     */
    // Diri kuhaon ang mga booking sa bulan, gi-group matag adlaw, para sa calendar.
    public function bookings(Request $request)
    {
        $validated = $request->validate([
            'year' => 'required|integer|min:2000|max:2100',
            'month' => 'required|integer|min:1|max:12',
        ]);

        $start = Carbon::create((int) $validated['year'], (int) $validated['month'], 1)->startOfMonth();
        $end = $start->copy()->endOfMonth();

        $days = [];

        Appointment::query()
            ->with(['user', 'animal'])
            ->whereBetween('booking_date', [$start->toDateString(), $end->toDateString()])
            ->whereNotIn('status', ['cancelled', 'rejected'])
            ->orderBy('booking_date')
            ->orderBy('booking_time')
            ->get()
            ->each(function ($booking) use (&$days) {
                $key = $booking->booking_date->toDateString();
                $time = $booking->booking_time ? substr((string) $booking->booking_time, 0, 5) : null;
                $client = $booking->user;
                $clientName = $client
                    ? (trim(($client->firstname ?? '') . ' ' . ($client->lastname ?? '')) ?: ($client->name ?: 'Client'))
                    : 'Client';

                $days[$key]['count'] = ($days[$key]['count'] ?? 0) + 1;
                $days[$key]['items'][] = [
                    'id' => $booking->id,
                    'time' => $time ? Carbon::createFromFormat('H:i', $time)->format('g:i A') : 'No time',
                    'pet' => $booking->petNamesLabel('Pet'),
                    'client' => $clientName,
                    'status' => (string) $booking->status,
                    'type' => (string) $booking->booking_type,
                ];
            });

        return response()->json([
            'success' => true,
            'days' => (object) $days,
        ]);
    }
}
