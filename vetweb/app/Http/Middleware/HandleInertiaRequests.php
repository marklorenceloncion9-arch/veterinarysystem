<?php

namespace App\Http\Middleware;

use Illuminate\Http\Request;
use Inertia\Middleware;
use App\Models\Animal;
use App\Models\Appointment;
use App\Models\User;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    // Diri kuhaon ang asset version para sa Inertia.
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    // Diri ang data nga i-share sa tanang Inertia page.
    public function share(Request $request): array
    {
        return [
            ...parent::share($request),
            'flash' => [
                'success' => $request->session()->get('success'),
                'error' => $request->session()->get('error'),
            ],
            'csrf_token' => csrf_token(),
            'mapboxToken' => env('VITE_MAPBOX_TOKEN'),
            'cloudinary' => [
                'cloudName' => config('services.cloudinary.cloud_name'),
                'uploadPreset' => config('services.cloudinary.upload_preset'),
            ],
            'clientRegistrationCounts' => fn () => $request->is('admin/*')
                ? [
                    'pending' => User::where('role', 'client')->where('approval_status', 'pending')->count(),
                    'rejected' => User::where('role', 'client')->where('approval_status', 'rejected')->count(),
                    'pending_pets' => Animal::query()->pendingRegistration()->count(),
                ]
                : null,
            'adminNavCounts' => fn () => $request->is('admin/*')
                ? [
                    'pending_appointments' => $this->openBookingCount('appointment'),
                    'pending_home_services' => $this->openBookingCount('home_service'),
                ]
                : null,
            'auth' => [
                'user' => $request->user() ? [
                    'id' => $request->user()->id,
                    'name' => trim(($request->user()->firstname ?? '') . ' ' . ($request->user()->lastname ?? ''))
                        ?: ($request->user()->name ?: 'Admin'),
                    'email' => $request->user()->email,
                    'role' => $request->user()->role,
                    'profile_photo_url' => $request->user()->profile_photo_url,
                ] : null,
            ],
        ];
    }

    /**
     * Pending bookings plus today's visits that are still open.
     * A booking that is both pending and scheduled today is counted once.
     */
    // Diri ihapon ang bukas nga booking sa matag type.
    private function openBookingCount(string $bookingType): int
    {
        $today = now()->toDateString();

        return Appointment::query()
            ->where('booking_type', $bookingType)
            ->where(function ($query) use ($today) {
                $query->where('status', 'pending')
                    ->orWhere(function ($query) use ($today) {
                        $query->whereDate('booking_date', $today)
                            ->whereNotIn('status', ['cancelled', 'completed']);
                    });
            })
            ->count();
    }
}
