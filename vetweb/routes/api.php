<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\AnimalController;
use App\Http\Controllers\Api\AppointmentController;
use App\Models\Barangay;
use App\Models\Zone;
use App\Models\Service;
use App\Services\ServiceAvailabilityService;
use App\Models\VetUnavailability;
use App\Models\User;
use App\Models\Animal;
use App\Models\Appointment;
use App\Models\AppointmentService;
use App\Models\Symptom;
use Illuminate\Support\Facades\DB;
use App\Http\Middleware\TokenAuthMiddleware;
use App\Support\AdminAppointmentFormatter;
use App\Support\AnimalMedicalSummary;
use App\Support\BookingTimeHelper;
use App\Support\BookingTypeLabel;
use App\Support\ServiceDurationHelper;
use App\Support\TreatmentStaff;
use App\Services\AppointmentStatusLogService;
use Carbon\Carbon;

// API routes for mobile app authentication
Route::prefix('mobile')->group(function () {
    // Public routes
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/register', [AuthController::class, 'register']);
    Route::get('/check-email', [AuthController::class, 'checkEmail']);
    Route::get('/check-name', [AuthController::class, 'checkName']);
    Route::post('/claim-account', [AuthController::class, 'claimAccount']);
    
    // OTP routes
    Route::post('/send-otp', [AuthController::class, 'sendOtp']);
    Route::post('/verify-otp', [AuthController::class, 'verifyOtp']);
    Route::post('/reset-password-otp', [AuthController::class, 'resetPasswordWithOtp']);
    Route::post('/claim-account-otp', [AuthController::class, 'claimAccountWithOtp']);
    
    Route::get('/barangays', function () {
        return response()->json([
            'success' => true,
            'barangays' => Barangay::orderBy('name')->get(['id', 'name'])
        ]);
    });

    // Zones are barangay-specific; pass ?barangay_id= to get one barangay's
    // zones, or omit it to get all (each row carries its barangay_id).
    Route::get('/zones', function (Request $request) {
        $zones = Zone::query()
            ->when($request->filled('barangay_id'), fn ($query) => $query->where('barangay_id', $request->barangay_id))
            ->orderByRaw(Zone::NATURAL_ORDER)
            ->get(['id', 'barangay_id', 'name']);

        return response()->json([
            'success' => true,
            'zones' => $zones,
        ]);
    });

    // Add a new zone from the mobile app (e.g. registration screen) so the
    // list can grow without shipping an app update.
    Route::post('/zones', function (Request $request) {
        $validated = $request->validate([
            'barangay_id' => 'required|exists:barangays,id',
            'name' => 'required|string|max:255|unique:zones,name,NULL,id,barangay_id,' . $request->barangay_id,
        ]);

        $zone = Zone::create($validated);

        return response()->json([
            'success' => true,
            'zone' => $zone,
        ], 201);
    });

    // Get services for appointments (mobile)
    Route::get('/services', function (ServiceAvailabilityService $availabilityService) {
        return response()->json([
            'success' => true,
            'services' => $availabilityService->enrichAll(),
        ]);
    });

    // Legacy endpoint for backward compatibility
    Route::get('/treatment-types', function () {
        return response()->json([
            'success' => true,
            'treatment_types' => Service::orderBy('type_name')->get(['id', 'type_name', 'description'])
        ]);
    });

    // Get vet unavailable dates for calendar
    Route::get('/vet-unavailable-dates', function (Request $request) {
        $year = $request->input('year', now()->year);
        $month = $request->input('month', now()->month);
        
        $startDate = sprintf('%04d-%02d-01', $year, $month);
        $endDate = date('Y-m-t', strtotime($startDate));
        
        return response()->json([
            'success' => true,
            'unavailable_dates' => VetUnavailability::getUnavailableForRange($startDate, $endDate)
        ]);
    });

    // Get available time slots for a specific date
    Route::get('/available-time-slots', function (Request $request) {
        $date = $request->input('date');
        
        if (!$date) {
            return response()->json([
                'success' => false,
                'error' => 'Date parameter is required'
            ], 400);
        }
        
        $timeSlots = \App\Support\BookingTimeHelper::clinicSlotStarts();

        // Existing bookings do not reserve exclusive slots — multiple clients may
        // book the same time. Only vet unavailability, past times, and clinic hours apply.
        $unavailabilityRanges = VetUnavailability::getBlockedRangesForDate($date);

        $today = now()->format('Y-m-d');
        $currentTime = now()->format('H:i');
        $isToday = ($date === $today);
        $requestedDuration = max(
            (int) $request->input('duration_minutes', \App\Support\BookingTimeHelper::SLOT_DURATION_MINUTES),
            1
        );

        $isDoorToDoor = filter_var($request->input('is_door_to_door'), FILTER_VALIDATE_BOOLEAN);

        // Mark available slots — a slot is available if a booking of requestedDuration can start there
        $availableSlots = array_map(function ($slot) use ($unavailabilityRanges, $isToday, $currentTime, $date, $requestedDuration) {
            $isPast = $isToday && $slot['time'] < $currentTime;
            $canStartHere = !$isPast && \App\Support\BookingTimeHelper::isRangeAvailable(
                $slot['time'],
                $requestedDuration,
                $unavailabilityRanges,
                $date,
                $currentTime
            );

            $slotMinutes = \App\Support\BookingTimeHelper::timeToMinutes($slot['time']);
            $isUnavailable = \App\Support\BookingTimeHelper::minutesFallInRanges($slotMinutes, $unavailabilityRanges);

            $slot['available'] = $canStartHere;
            $slot['occupied'] = false;
            $slot['unavailable'] = $isUnavailable;
            return $slot;
        }, $timeSlots);

        $availableSlots = \App\Services\BookingSlotService::decorateSlots(
            $availableSlots,
            $date,
            !$isDoorToDoor
        );
        
        return response()->json([
            'success' => true,
            'date' => $date,
            'slots' => $availableSlots,
        ]);
    });

    // Get symptoms list
    Route::get('/symptoms', function () {
        return response()->json([
            'success' => true,
            'symptoms' => \App\Models\Symptom::all()->map(function ($symptom) {
                return [
                    'id' => $symptom->id,
                    'name' => $symptom->name,
                ];
            }),
        ]);
    });

    // Protected routes
    Route::middleware(TokenAuthMiddleware::class)->group(function () {
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::get('/user', [UserController::class, 'profile']);
        Route::put('/user', [UserController::class, 'update']);

        // In-app notifications (service schedules, etc.)
        Route::get('/notifications', function (Request $request) {
            $user = $request->user();

            $notifications = \App\Models\Notification::where('user_id', $user->id)
                ->orderByDesc('created_at')
                ->limit(100)
                ->get();

            return response()->json([
                'success' => true,
                'unread_count' => $notifications->whereNull('read_at')->count(),
                'notifications' => $notifications->map(function ($notification) {
                    return [
                        'id' => $notification->id,
                        'type' => $notification->type,
                        'title' => $notification->title,
                        'message' => $notification->message,
                        'data' => $notification->data,
                        'is_read' => $notification->read_at !== null,
                        'created_at' => $notification->created_at,
                        'created_at_human' => $notification->created_at?->diffForHumans(),
                    ];
                }),
            ]);
        });

        Route::post('/notifications/{id}/read', function (Request $request, $id) {
            $user = $request->user();

            $notification = \App\Models\Notification::where('user_id', $user->id)
                ->where('id', $id)
                ->first();

            if (!$notification) {
                return response()->json([
                    'success' => false,
                    'error' => 'Notification not found',
                ], 404);
            }

            if ($notification->read_at === null) {
                $notification->update(['read_at' => now()]);
            }

            return response()->json(['success' => true]);
        });

        Route::post('/notifications/read-all', function (Request $request) {
            $user = $request->user();

            \App\Models\Notification::where('user_id', $user->id)
                ->whereNull('read_at')
                ->update(['read_at' => now()]);

            return response()->json(['success' => true]);
        });

        Route::get('/vet-bookings', function (Request $request) {
            $user = $request->user();

            if ($user->role !== 'fieldman') {
                return response()->json([
                    'success' => false,
                    'error' => 'Unauthorized',
                ], 403);
            }

            $today = now()->toDateString();

            $bookings = Appointment::with([
                'user.barangay',
                'assignedFieldmen',
                'animal.species',
                'animal.breed',
                'treatmentTypes',
                'symptoms',
                'bookingMedicines.inventory.medicine',
                'statusLogs.changedByUser',
            ])
                ->whereDate('booking_date', '>=', $today)
                ->whereNotIn('status', ['cancelled', 'rejected', 'completed'])
                ->where(function ($query) use ($user, $today) {
                    $query->where(function ($clinicalQuery) use ($user, $today) {
                        $clinicalQuery->where('booking_type', 'appointment')
                            ->whereDate('booking_date', $today)
                            ->whereIn('status', ['approved', 'processing'])
                            ->whereHas('assignedFieldmen', function ($fieldmanQuery) use ($user) {
                                $fieldmanQuery->where('users.id', $user->id);
                            });
                    })->orWhere(function ($assignedQuery) use ($user) {
                        $assignedQuery->whereIn('booking_type', ['walk_in', 'home_service'])
                            ->whereHas('assignedFieldmen', function ($fieldmanQuery) use ($user) {
                                $fieldmanQuery->where('users.id', $user->id);
                            });
                    });
                })
                ->orderBy('booking_date')
                ->orderBy('booking_time')
                ->limit(150)
                ->get()
                ->reject(function ($appointment) use ($user) {
                    if ($appointment->booking_type === 'walk_in') {
                        return false;
                    }

                    if (
                        $appointment->booking_type === 'appointment'
                        && $appointment->isAssignedToFieldman($user->id)
                    ) {
                        return false;
                    }

                    if (!in_array($appointment->status, ['processing', 'ongoing'], true)) {
                        return false;
                    }

                    return AppointmentStatusLogService::wasStatusChangedByAdmin(
                        $appointment,
                        $appointment->status
                    );
                })
                ->map(function ($appointment) {
                    $formatted = AdminAppointmentFormatter::format($appointment);
                    $displayStatus = $appointment->status;

                    if ($appointment->booking_type === 'walk_in' && $displayStatus === 'pending') {
                        $displayStatus = 'processing';
                    }

                    // Processing visits should not show recorded medicine yet.
                    // Fieldmen select inventory while the booking is processing.
                    if (in_array($displayStatus, ['processing', 'pending'], true)) {
                        $formatted['treatment_items'] = [];
                        $formatted['pets'] = collect($formatted['pets'] ?? [])
                            ->map(function ($pet) {
                                $pet['treatment_items'] = [];
                                return $pet;
                            })
                            ->values()
                            ->all();
                        if (isset($formatted['pet']) && is_array($formatted['pet'])) {
                            $formatted['pet']['treatment_items'] = [];
                        }
                    }

                    return array_merge($formatted, [
                        'booking_type' => $appointment->booking_type,
                        'booking_type_label' => BookingTypeLabel::label($appointment->booking_type),
                        'date_formatted' => $appointment->booking_date->format('M d, Y'),
                        'time_formatted' => date('h:i A', strtotime($appointment->booking_time)),
                        'display_status' => $displayStatus,
                    ]);
                })
                ->values();

            $walkIns = $bookings->where('booking_type', 'walk_in')->values();
            $appointments = $bookings
                ->where('booking_type', 'appointment')
                ->filter(fn (array $booking) => in_array($booking['status'] ?? null, ['approved', 'processing'], true))
                ->values();
            // Home Service visits stay on the active tab only while approved,
            // processing, or ongoing. Completed visits move to history right away.
            $homeServices = $bookings
                ->where('booking_type', 'home_service')
                ->filter(fn (array $booking) => in_array($booking['status'] ?? null, ['approved', 'processing', 'ongoing'], true))
                ->values();

            return response()->json([
                'success' => true,
                'walk_ins' => $walkIns,
                'appointments' => $appointments,
                'home_services' => $homeServices,
                'counts' => [
                    'walk_ins' => $walkIns->count(),
                    'appointments' => $appointments->count(),
                    'home_services' => $homeServices->count(),
                    'total' => $bookings->count(),
                ],
            ]);
        });

        Route::get('/vet-bookings/history', function (Request $request) {
            $user = $request->user();

            if ($user->role !== 'fieldman') {
                return response()->json([
                    'success' => false,
                    'error' => 'Unauthorized',
                ], 403);
            }

            $bookingType = $request->input('booking_type', 'home_service');

            // A visit lands here once it's no longer on the active tab:
            // completed visits (including today's), cancelled, and rejected.
            $history = Appointment::with([
                'user.barangay',
                'assignedFieldmen',
                'animal.species',
                'animal.breed',
                'treatmentTypes',
                'symptoms',
                'bookingMedicines.inventory.medicine',
                'statusLogs.changedByUser',
            ])
                ->where('booking_type', $bookingType)
                ->when(in_array($bookingType, ['home_service', 'walk_in', 'appointment'], true), function ($query) use ($user) {
                    $query->whereHas('assignedFieldmen', function ($assignedQuery) use ($user) {
                        $assignedQuery->where('users.id', $user->id);
                    });
                })
                ->where(function ($query) {
                    $query->where('status', 'completed')
                        ->orWhereIn('status', ['cancelled', 'rejected']);
                })
                ->orderByDesc('updated_at')
                ->orderByDesc('booking_date')
                ->orderByDesc('booking_time')
                ->limit(100)
                ->get()
                ->map(function ($appointment) {
                    $formatted = AdminAppointmentFormatter::format($appointment);

                    return array_merge($formatted, [
                        'booking_type' => $appointment->booking_type,
                        'booking_type_label' => BookingTypeLabel::label($appointment->booking_type),
                        'date_formatted' => $appointment->booking_date->format('M d, Y'),
                        'time_formatted' => date('h:i A', strtotime($appointment->booking_time)),
                        'display_status' => $appointment->status,
                    ]);
                })
                ->values();

            return response()->json([
                'success' => true,
                'history' => $history,
                'count' => $history->count(),
            ]);
        });

        Route::get('/fieldman/clients', function (Request $request) {
            $user = $request->user();

            if ($user->role !== 'fieldman') {
                return response()->json([
                    'success' => false,
                    'error' => 'Unauthorized',
                ], 403);
            }

            $search = trim((string) $request->input('search', ''));

            if ($search === '') {
                return response()->json([
                    'success' => true,
                    'clients' => [],
                    'matched_animals' => [],
                ]);
            }

            $query = User::with('barangay')
                ->whereIn('role', ['client', 'owner']);

            $query->where(function ($builder) use ($search) {
                $builder->where('firstname', 'like', "%{$search}%")
                    ->orWhere('lastname', 'like', "%{$search}%")
                    ->orWhere('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('phone_number', 'like', "%{$search}%")
                    ->orWhereHas('animals', function ($animalQuery) use ($search) {
                        $animalQuery->where('identification_number', 'like', "%{$search}%");
                    });
            });

            $clients = $query
                ->orderByRaw('COALESCE(firstname, name)')
                ->limit(50)
                ->get()
                ->map(function ($client) {
                    $displayName = trim(implode(' ', array_filter([$client->firstname, $client->lastname])));
                    if ($displayName === '') {
                        $displayName = $client->name ?: 'Unknown';
                    }

                    return [
                        'id' => $client->id,
                        'firstname' => $client->firstname,
                        'lastname' => $client->lastname,
                        'name' => $displayName,
                        'email' => $client->email,
                        'phone_number' => $client->phone_number,
                        'barangay' => $client->barangay?->name,
                    ];
                })
                ->values();

            $matchedAnimals = Animal::query()
                ->active()
                ->with(['user.barangay', 'species', 'breed', 'animalRegistrations'])
                ->where('identification_number', 'like', "%{$search}%")
                ->orderBy('identification_number')
                ->limit(20)
                ->get()
                ->filter(function ($animal) {
                    return in_array($animal->registration_status, ['registered', 'exempt'], true);
                })
                ->map(function ($animal) {
                    $owner = $animal->user;
                    $displayName = trim(implode(' ', array_filter([$owner?->firstname, $owner?->lastname])));
                    if ($displayName === '') {
                        $displayName = $owner?->name ?: 'Unknown';
                    }

                    return [
                        'id' => $animal->id,
                        'pet_name' => $animal->pet_name,
                        'identification_number' => $animal->identification_number,
                        'species_name' => $animal->species?->species_name,
                        'breed_name' => $animal->breed?->breed_name,
                        'registration_status' => $animal->registration_status,
                        'pet_photo_url' => $animal->pet_photo_url,
                        'owner' => [
                            'id' => $owner?->id,
                            'name' => $displayName,
                            'email' => $owner?->email,
                            'phone_number' => $owner?->phone_number,
                            'barangay' => $owner?->barangay?->name,
                        ],
                    ];
                })
                ->values();

            return response()->json([
                'success' => true,
                'clients' => $clients,
                'matched_animals' => $matchedAnimals,
            ]);
        });

        Route::get('/fieldman/clients/{id}/animals', function (Request $request, $id) {
            $user = $request->user();

            if ($user->role !== 'fieldman') {
                return response()->json([
                    'success' => false,
                    'error' => 'Unauthorized',
                ], 403);
            }

            $animals = Animal::where('user_id', $id)
                ->active()
                ->with(['species.animalType', 'breed', 'animalRegistrations'])
                ->orderBy('pet_name')
                ->get();

            $eligible = $animals->filter(function ($animal) {
                return in_array($animal->registration_status, ['registered', 'exempt'], true);
            });

            return response()->json([
                'success' => true,
                'animals' => $eligible->map(function ($animal) {
                    return [
                        'id' => $animal->id,
                        'pet_name' => $animal->pet_name,
                        'species_name' => $animal->species?->species_name,
                        'breed_name' => $animal->breed?->breed_name,
                        'registration_status' => $animal->registration_status,
                        'identification_number' => $animal->identification_number,
                        'pet_photo_url' => $animal->pet_photo_url,
                        'markings_photo_url' => $animal->markings_photo_url,
                    ];
                })->values(),
                'total_animals' => $animals->count(),
                'ineligible_count' => $animals->count() - $eligible->count(),
            ]);
        });

        Route::get('/fieldman/animals/{id}/medical-summary', function (Request $request, $id) {
            $user = $request->user();

            if ($user->role !== 'fieldman') {
                return response()->json([
                    'success' => false,
                    'error' => 'Unauthorized',
                ], 403);
            }

            $animal = Animal::find($id);

            if (!$animal) {
                return response()->json([
                    'success' => false,
                    'error' => 'Animal not found',
                ], 404);
            }

            $summary = AnimalMedicalSummary::forAnimal($animal);

            return response()->json([
                'success' => true,
                ...$summary,
            ]);
        });

        Route::post('/walk-in-appointment', function (Request $request) {
            $user = $request->user();

            if ($user->role !== 'fieldman') {
                return response()->json([
                    'success' => false,
                    'error' => 'Unauthorized',
                ], 403);
            }

            $validated = $request->validate([
                'client_id' => 'required|exists:users,id',
                'animal_id' => 'required|exists:animals,id',
                'service_id' => 'nullable|exists:services,id|required_without:service_ids',
                'service_ids' => 'nullable|array',
                'service_ids.*' => 'exists:services,id',
                'booking_date' => 'required|date_format:Y-m-d',
                'booking_time' => 'required|date_format:H:i',
                'administered_by' => 'nullable|string|max:255',
                'notes' => 'nullable|string',
                'symptoms' => 'nullable|array',
                'is_bitten' => 'nullable|boolean',
                'bite_details' => 'nullable|string|max:255',
            ]);

            $animal = Animal::where('id', $validated['animal_id'])
                ->where('user_id', $validated['client_id'])
                ->first();

            if (!$animal) {
                return response()->json([
                    'success' => false,
                    'error' => 'Selected animal does not belong to this client.',
                ], 422);
            }

            if (!in_array($animal->registration_status, ['registered', 'exempt'], true)) {
                return response()->json([
                    'success' => false,
                    'error' => 'Only registered or exempt animals can receive walk-in services.',
                ], 422);
            }

            $selectedServiceIds = $validated['service_ids'] ?? [];

            if (!empty($validated['service_id']) && !in_array($validated['service_id'], $selectedServiceIds, true)) {
                $selectedServiceIds[] = $validated['service_id'];
            }

            if (empty($selectedServiceIds) && !($validated['is_bitten'] ?? false)) {
                return response()->json([
                    'success' => false,
                    'error' => 'Select at least one service, or record a bite incident.',
                ], 422);
            }

            if (empty($selectedServiceIds) && ($validated['is_bitten'] ?? false)) {
                $biteService = Service::where('type_name', 'like', '%treatment%')->first()
                    ?? Service::orderBy('type_name')->first();

                if (!$biteService) {
                    return response()->json([
                        'success' => false,
                        'error' => 'No service available for bite incident recording.',
                    ], 422);
                }

                $selectedServiceIds = [$biteService->id];
            }

            try {
                $availabilityError = app(\App\Services\ServiceAvailabilityService::class)
                    ->assertServicesAvailable(array_map('intval', array_unique($selectedServiceIds)));

                if ($availabilityError) {
                    return response()->json([
                        'success' => false,
                        'error' => $availabilityError,
                    ], 422);
                }

                DB::beginTransaction();

                $walkInStatus = BookingTimeHelper::walkInInitialStatus(
                    $validated['booking_date'],
                    $validated['booking_time']
                );

                $durationMinutes = ServiceDurationHelper::totalMinutesForServiceIds(
                    array_map('intval', array_unique($selectedServiceIds))
                );

                $normalizedWalkInTime = \App\Support\BookingTimeHelper::normalizeToHi($validated['booking_time']);
                $slotError = \App\Services\BookingSlotService::availabilityError(
                    $validated['booking_date'],
                    $normalizedWalkInTime,
                    null,
                    true
                );
                if ($slotError) {
                    DB::rollBack();
                    return response()->json([
                        'success' => false,
                        'error' => $slotError,
                    ], 422);
                }

                $appointment = Appointment::create([
                    'user_id' => $validated['client_id'],
                    'animal_id' => $validated['animal_id'],
                    'service_type_id' => $selectedServiceIds[0],
                    'booking_date' => $validated['booking_date'],
                    'booking_time' => $normalizedWalkInTime,
                    'duration_minutes' => $durationMinutes,
                    'status' => $walkInStatus,
                    'administered_by' => $validated['administered_by'] ?? null,
                    'notes' => $validated['notes'] ?? null,
                    'booking_type' => 'walk_in',
                    'is_bitten' => $validated['is_bitten'] ?? false,
                    'bite_details' => $validated['bite_details'] ?? null,
                ]);

                foreach (array_unique($selectedServiceIds) as $serviceId) {
                    AppointmentService::create([
                        'booking_id' => $appointment->id,
                        'service_type_id' => $serviceId,
                    ]);
                }

                if (!empty($validated['symptoms'])) {
                    foreach ($validated['symptoms'] as $symptomData) {
                        $symptomName = $symptomData['name'] ?? null;
                        if (!$symptomName) {
                            continue;
                        }

                        $symptom = Symptom::firstOrCreate(
                            ['name' => $symptomName],
                            ['name' => $symptomName]
                        );

                        DB::table('booking_symptoms')->insert([
                            'booking_id' => $appointment->id,
                            'symptom_id' => $symptom->id,
                            'days_count' => $symptomData['days_count'] ?? null,
                            'notes' => $symptomData['notes'] ?? null,
                            'created_at' => now(),
                            'updated_at' => now(),
                        ]);
                    }
                }

                \App\Services\WalkInFieldmanAssignmentService::syncForWalkIn(
                    $appointment,
                    $validated['administered_by'] ?? TreatmentStaff::displayName($user),
                    (int) $user->id
                );

                DB::commit();

                AppointmentStatusLogService::recordForAuthenticatedUser(
                    $appointment->fresh(),
                    $walkInStatus
                );

                $formatted = AdminAppointmentFormatter::format($appointment->fresh(['assignedFieldmen']));
                $formatted['booking_type'] = 'walk_in';
                $formatted['booking_type_label'] = 'Walk-in';
                $formatted['display_status'] = $walkInStatus === 'pending' ? 'processing' : $walkInStatus;

                return response()->json([
                    'success' => true,
                    'message' => 'Walk-in appointment created successfully',
                    'appointment' => $formatted,
                ]);
            } catch (\Exception $e) {
                DB::rollBack();

                return response()->json([
                    'success' => false,
                    'error' => 'Failed to create walk-in appointment: ' . $e->getMessage(),
                ], 422);
            }
        });

        Route::get('/fieldman/inventory', function (Request $request) {
            $user = $request->user();

            if ($user->role !== 'fieldman') {
                return response()->json([
                    'success' => false,
                    'error' => 'Unauthorized',
                ], 403);
            }

            return app(\App\Http\Controllers\BudgetInventoryController::class)->index();
        });

        Route::get('/fieldman/damage-reports/batches/{medicineId}', function (Request $request, $medicineId) {
            $user = $request->user();

            if ($user->role !== 'fieldman') {
                return response()->json([
                    'success' => false,
                    'error' => 'Unauthorized',
                ], 403);
            }

            return app(\App\Http\Controllers\DamageReportController::class)->batches($medicineId);
        });

        Route::get('/fieldman/damage-reports', function (Request $request) {
            $user = $request->user();

            if ($user->role !== 'fieldman') {
                return response()->json([
                    'success' => false,
                    'error' => 'Unauthorized',
                ], 403);
            }

            $request->merge(['reported_by' => $user->id]);

            return app(\App\Http\Controllers\DamageReportController::class)->index($request);
        });

        Route::post('/fieldman/damage-reports', function (Request $request) {
            $user = $request->user();

            if ($user->role !== 'fieldman') {
                return response()->json([
                    'success' => false,
                    'error' => 'Unauthorized',
                ], 403);
            }

            return app(\App\Http\Controllers\DamageReportController::class)->store($request);
        });

        Route::post('/walk-in-appointment/{id}/mark-ongoing', [AppointmentController::class, 'markWalkInOngoing']);
        Route::post('/appointments/{id}/mark-processing', [AppointmentController::class, 'markFieldmanAppointmentProcessing']);
        Route::post('/appointments/{id}/mark-ongoing', [AppointmentController::class, 'markFieldmanAppointmentOngoing']);
        Route::post('/appointments/{id}/complete', [AppointmentController::class, 'completeFieldmanAppointment']);
        Route::post('/appointments/{id}/fieldman-cancel', [AppointmentController::class, 'cancelByFieldman']);
        
        // Animal routes (modal style)
        Route::get('/animals', [AnimalController::class, 'index']);
        Route::get('/animals/{id}', [AnimalController::class, 'show']);
        Route::post('/animals', [AnimalController::class, 'store']);
        Route::put('/animals/{id}', [AnimalController::class, 'update']);
        Route::delete('/animals/{id}', [AnimalController::class, 'destroy']);
        Route::post('/animals/{id}/archive', [AnimalController::class, 'archive']);
        Route::post('/animals/{id}/unarchive', [AnimalController::class, 'unarchive']);
        Route::get('/animals/{id}/medical-summary', function (Request $request, $id) {
            $user = $request->user();
            $animal = Animal::where('id', $id)->where('user_id', $user->id)->first();

            if (!$animal) {
                return response()->json([
                    'success' => false,
                    'error' => 'Animal not found',
                ], 404);
            }

            $summary = AnimalMedicalSummary::forAnimal($animal, 20);

            return response()->json([
                'success' => true,
                ...$summary,
            ]);
        });
        Route::get('/species', [AnimalController::class, 'getSpecies']);
        Route::get('/species/{speciesId}/breeds', [AnimalController::class, 'getBreedsBySpecies']);
        
        // Appointment routes
        Route::get('/appointments', [AppointmentController::class, 'index']);
        Route::post('/appointments', [AppointmentController::class, 'store']);
        Route::put('/appointments/{id}', [AppointmentController::class, 'update']);
        Route::patch('/appointments/{id}/services', [AppointmentController::class, 'updateServices']);
        Route::patch('/appointments/{id}/cancel', [AppointmentController::class, 'cancel']);
    });
});

// Animal routes for admin panel (session auth)
Route::middleware('auth')->group(function () {
    Route::get('/animals', [AnimalController::class, 'index']);
    Route::get('/animals/{id}', [AnimalController::class, 'show']);
    Route::post('/animals', [AnimalController::class, 'store']);
    Route::put('/animals/{id}', [AnimalController::class, 'update']);
    Route::delete('/animals/{id}', [AnimalController::class, 'destroy']);
});

// Admin API routes (outside mobile prefix)
Route::middleware(['web', 'auth'])->prefix('admin')->group(function () {
    Route::get('/notifications', [App\Http\Controllers\Admin\AdminNotificationController::class, 'index']);
    Route::post('/notifications/read-all', [App\Http\Controllers\Admin\AdminNotificationController::class, 'markAllRead']);
    Route::post('/notifications/dismiss', [App\Http\Controllers\Admin\AdminNotificationController::class, 'dismiss']);
    Route::post('/notifications/{id}/read', [App\Http\Controllers\Admin\AdminNotificationController::class, 'markRead']);
    Route::put('/appointments/{id}/status', [AppointmentController::class, 'updateStatus']);
    Route::put('/appointments/{id}/animals/{animalId}/status', [AppointmentController::class, 'updateAnimalStatus']);
    Route::patch('/appointments/{id}/animals/{animalId}/cancel', [AppointmentController::class, 'cancelAnimal']);
    Route::patch('/appointments/{id}/animals/bulk', [AppointmentController::class, 'bulkUpdateAnimals']);
    Route::get('/fieldmen', function () {
        $fieldmen = \App\Models\User::query()
            ->where('role', 'fieldman')
            ->orderBy('firstname')
            ->orderBy('lastname')
            ->get(['id', 'firstname', 'lastname', 'name', 'email'])
            ->map(function ($user) {
                $name = trim(implode(' ', array_filter([$user->firstname, $user->lastname])))
                    ?: ($user->name ?: $user->email);

                return [
                    'id' => $user->id,
                    'name' => $name,
                    'email' => $user->email,
                ];
            })
            ->values();

        return response()->json([
            'success' => true,
            'fieldmen' => $fieldmen,
        ]);
    });
    
    // Get walk-in appointments grouped by service (all statuses)
    Route::get('/services/completed-appointments', function (Request $request) {
        $startDate = $request->input('start_date');
        $endDate = $request->input('end_date');
        
        $services = \App\Models\Service::with(['appointments' => function($query) use ($startDate, $endDate) {
            $query->where('booking_type', 'walk_in')
                  ->with(['animal.species', 'animal.breed', 'user.barangay', 'symptoms', 'treatmentTypes', 'bookingServices.service', 'bookingMedicines.inventory.medicine', 'outsidePurchaseItems', 'statusLogs'])
                  ->orderByDesc('created_at')
                  ->orderByDesc('id');
                  
            // Apply date range filters if provided
            if ($startDate) {
                $query->whereDate('booking_date', '>=', $startDate);
            }
            if ($endDate) {
                $query->whereDate('booking_date', '<=', $endDate);
            }
        }])->get();
        
        return response()->json([
            'success' => true,
            'services' => $services->map(function($service) {
                \App\Models\Appointment::hydrateBookedAnimals($service->appointments);

                $formatWalkInAnimal = function ($animal) {
                    if (!$animal) {
                        return null;
                    }

                    return [
                        'id' => $animal->id,
                        'pet_name' => $animal->pet_name,
                        'species' => $animal->species?->species_name ?? $animal->species,
                        'breed' => $animal->breed?->breed_name ?? $animal->breed,
                        'color' => $animal->color,
                        'weight' => $animal->weight,
                        'age' => \App\Support\AdminAppointmentFormatter::formatPetAge(
                            $animal->birthdate
                                ? \Carbon\Carbon::parse($animal->birthdate)->format('Y-m-d')
                                : null
                        ),
                        'sex' => $animal->sex,
                        'birthdate' => $animal->birthdate?->format('Y-m-d'),
                        'identification_number' => $animal->identification_number,
                        'pet_photo_url' => $animal->pet_photo_url,
                        'markings' => $animal->markings,
                        'markings_photo_url' => $animal->markings_photo_url,
                        'registration_status' => $animal->registration_status,
                        'reproductive_status' => $animal->reproductive_status,
                        'weeks_months' => $animal->weeks_months,
                        'diet' => $animal->diet,
                        'diet_other' => $animal->diet_other,
                        'dewormed' => $animal->dewormed,
                        'last_deworming_date' => $animal->last_deworming_date?->format('Y-m-d'),
                        'dewormer_name' => $animal->dewormer_name,
                        'rabies_vaccine' => $animal->rabies_vaccine,
                        'rabies_last_vaccination' => $animal->rabies_last_vaccination?->format('Y-m-d'),
                        'rabies_dose_type' => $animal->rabies_dose_type,
                        'rabies_valid_until' => $animal->rabies_valid_until,
                        'dhppl_vaccine' => $animal->dhppl_vaccine,
                        'dhppl_last_vaccination' => $animal->dhppl_last_vaccination?->format('Y-m-d'),
                        'dhppl_dose_type' => $animal->dhppl_dose_type,
                        'dhppl_valid_until' => $animal->dhppl_valid_until,
                        'other_vaccine_name' => $animal->other_vaccine_name,
                        'other_vaccine_last_vaccination' => $animal->other_vaccine_last_vaccination?->format('Y-m-d'),
                        'other_vaccine_dose_type' => $animal->other_vaccine_dose_type,
                        'other_vaccine_valid_until' => $animal->other_vaccine_valid_until,
                    ];
                };

                // Separate appointments by status
                $completedAppointments = $service->appointments->where('status', 'completed')->values();
                $ongoingAppointments = $service->appointments->where('status', 'ongoing')->values();
                $processingAppointments = $service->appointments
                    ->whereIn('status', ['processing', 'pending'])
                    ->values();
                $pendingAppointments = collect();
                
                $formatAppointment = function($appointment) use ($formatWalkInAnimal) {
                    $servicesByAnimalId = [];
                    foreach ($appointment->bookingServices as $bookingService) {
                        $animalId = $bookingService->animal_id;
                        $name = $bookingService->service?->type_name;
                        if (!$animalId || !$name) {
                            continue;
                        }
                        $servicesByAnimalId[$animalId] ??= [];
                        if (!in_array($name, $servicesByAnimalId[$animalId], true)) {
                            $servicesByAnimalId[$animalId][] = $name;
                        }
                    }

                    $legacySharedServices = $appointment->bookingServices
                        ->filter(fn ($row) => empty($row->animal_id))
                        ->map(fn ($row) => $row->service?->type_name)
                        ->filter()
                        ->unique()
                        ->values()
                        ->all();

                    $sharedServiceNames = $appointment->treatmentTypes->pluck('type_name')->filter()->unique()->values()->all();

                    $outsidePurchaseItems = $appointment->outsidePurchaseItems
                        ->map(fn ($item) => \App\Support\AdminAppointmentFormatter::formatOutsidePurchaseItem($item))
                        ->values()
                        ->all();

                    $pets = $appointment->resolvedAnimals()
                        ->map(function ($animal) use ($formatWalkInAnimal, $servicesByAnimalId, $legacySharedServices, $sharedServiceNames, $outsidePurchaseItems) {
                            $pet = $formatWalkInAnimal($animal);
                            if (!$pet) {
                                return null;
                            }
                            $petServices = $servicesByAnimalId[$animal->id] ?? [];
                            if (empty($petServices) && !empty($legacySharedServices)) {
                                $petServices = $legacySharedServices;
                            }
                            if (empty($petServices)) {
                                $petServices = $sharedServiceNames;
                            }
                            $pet['services'] = array_values($petServices);
                            $pet['outside_purchase_items'] = collect($outsidePurchaseItems)
                                ->filter(fn ($item) => (int) ($item['animal_id'] ?? 0) === (int) $animal->id)
                                ->values()
                                ->all();
                            return $pet;
                        })
                        ->filter()
                        ->values()
                        ->all();

                    return [
                        'id' => $appointment->id,
                        'animal' => $pets[0] ?? $formatWalkInAnimal($appointment->animal),
                        'pets' => $pets,
                        'user' => \App\Support\OwnerDisplayHelper::toAppointmentUserArray($appointment->user),
                        'animal_id' => $appointment->animal_id,
                        'appointment_date' => $appointment->booking_date?->format('Y-m-d'),
                        'appointment_time' => \App\Support\BookingTimeHelper::normalizeToHi($appointment->booking_time),
                        'duration_minutes' => $appointment->treatmentTypes->isNotEmpty()
                            ? \App\Support\ServiceDurationHelper::totalMinutesForServices($appointment->treatmentTypes)
                            : \App\Support\BookingTimeHelper::resolveDurationMinutes($appointment->duration_minutes),
                        'status' => $appointment->status,
                        'created_at' => $appointment->created_at?->format('Y-m-d H:i:s'),
                        'updated_at' => $appointment->updated_at?->format('Y-m-d H:i:s'),
                        'notes' => $appointment->notes,
                        'administered_by' => \App\Support\TreatmentStaff::formatAdministeredByLabel(
                            $appointment->administered_by,
                            $appointment
                        ),
                        'booking_type' => $appointment->booking_type,
                        'is_bitten' => $appointment->is_bitten ?? false,
                        'bite_details' => $appointment->bite_details,
                        'symptoms' => $appointment->symptoms->map(function ($symptom) {
                            return [
                                'id' => $symptom->id,
                                'name' => $symptom->name,
                                'days_count' => $symptom->pivot->days_count,
                                'notes' => $symptom->pivot->notes
                            ];
                        }) ?? [],
                        'services' => $appointment->treatmentTypes->pluck('type_name')->toArray(),
                        'outside_purchase_items' => $outsidePurchaseItems,
                        'treatment_items' => $appointment->bookingMedicines->map(function ($bookingMedicine) {
                            $inventory = $bookingMedicine->inventory;
                            $medicine = $bookingMedicine->medicine;
                            $quantityDisplay = \App\Support\QuantityFormatter::formatTreatmentDisplay($bookingMedicine, $inventory);

                            return [
                                'animal_id' => $bookingMedicine->animal_id ? (int) $bookingMedicine->animal_id : null,
                                'medicine_name' => $medicine?->name ?? 'Unknown Medicine',
                                'quantity_used' => $quantityDisplay,
                                'unit_name' => $bookingMedicine->unit_name,
                            ];
                        }) ?? [],
                        'status_history' => \App\Services\AppointmentStatusLogService::formatHistoryForApi($appointment),
                    ];
                };
                
                return [
                    'id' => $service->id,
                    'type_name' => $service->type_name,
                    'description' => $service->description,
                    'completed_appointments' => $completedAppointments->map($formatAppointment),
                    'ongoing_appointments' => $ongoingAppointments->map($formatAppointment),
                    'processing_appointments' => $processingAppointments->map($formatAppointment),
                    'pending_appointments' => $pendingAppointments->map($formatAppointment),
                ];
            })
        ]);
    });
});

// Admin API routes for vet availability
Route::middleware(['web', 'auth'])->prefix('admin')->group(function () {
    Route::get('/booking-slot-capacities', [\App\Http\Controllers\Admin\BookingSlotCapacityController::class, 'show']);
    Route::put('/booking-slot-capacities', [\App\Http\Controllers\Admin\BookingSlotCapacityController::class, 'update']);

    // Get unavailable dates for admin calendar
    Route::get('/vet-unavailable-dates', function (Request $request) {
        $year = $request->input('year', now()->year);
        $month = $request->input('month', now()->month);
        
        $startDate = sprintf('%04d-%02d-01', $year, $month);
        $endDate = date('Y-m-t', strtotime($startDate));
        
        return response()->json([
            'success' => true,
            'unavailable_dates' => \App\Models\VetUnavailability::getUnavailableForRange($startDate, $endDate)
        ]);
    });

    // Bookings per day for the dashboard calendar
    Route::get('/calendar-bookings', [\App\Http\Controllers\Admin\DashboardCalendarController::class, 'bookings']);

    // Monthly totals and top 5 for the dashboard activity panel
    Route::get('/dashboard-activity', [\App\Http\Controllers\Admin\DashboardActivityController::class, 'show']);

    // Preview appointments affected by marking a date unavailable
    Route::get('/vet-unavailable-dates/conflicts', function (Request $request) {
        $validated = $request->validate([
            'date' => 'required|date',
            'type' => 'required|in:full_day,morning,afternoon',
        ]);

        $date = Carbon::parse($validated['date'])->toDateString();
        $appointments = \App\Services\VetUnavailabilityService::findConflictingAppointments($date, $validated['type']);

        return response()->json([
            'success' => true,
            'date' => $date,
            'type' => $validated['type'],
            'count' => $appointments->count(),
            'appointments' => \App\Services\VetUnavailabilityService::formatConflictingAppointments($appointments),
        ]);
    });
    
    // Add unavailable date
    Route::post('/vet-unavailable-dates', function (Request $request) {
        $validated = $request->validate([
            'unavailable_date' => 'required|date',
            'reason' => 'nullable|string|max:255',
            'type' => 'required|in:full_day,morning,afternoon',
            'cancel_conflicting' => 'sometimes|boolean',
        ]);

        $date = Carbon::parse($validated['unavailable_date'])->toDateString();
        
        // Check if date is already marked as unavailable
        $existing = \App\Models\VetUnavailability::where('unavailable_date', $date)->first();
        if ($existing) {
            return response()->json([
                'success' => false,
                'error' => 'Date is already marked as unavailable'
            ], 400);
        }

        try {
            DB::beginTransaction();

            $unavailability = \App\Models\VetUnavailability::create([
                'unavailable_date' => $date,
                'reason' => $validated['reason'] ?? null,
                'type' => $validated['type'],
                'created_by' => auth()->id(),
            ]);

            $cancelledCount = 0;
            if ($request->boolean('cancel_conflicting')) {
                $cancellationReason = \App\Services\VetUnavailabilityService::buildCancellationReason($validated['reason'] ?? null);
                $cancelledCount = \App\Services\VetUnavailabilityService::cancelConflictingAppointments(
                    $date,
                    $validated['type'],
                    $cancellationReason
                );
            }

            DB::commit();
        } catch (\Exception $e) {
            DB::rollBack();
            \Log::error('Failed to mark date unavailable: ' . $e->getMessage());

            return response()->json([
                'success' => false,
                'error' => 'Failed to mark date as unavailable',
                'message' => $e->getMessage(),
            ], 500);
        }
        
        return response()->json([
            'success' => true,
            'message' => $cancelledCount > 0
                ? "Date marked as unavailable. {$cancelledCount} appointment(s) cancelled and owners notified."
                : 'Date marked as unavailable',
            'data' => $unavailability,
            'cancelled_appointments' => $cancelledCount,
        ]);
    });
    
    // Delete unavailable date
    Route::delete('/vet-unavailable-dates/{date}', function ($date) {
        $deleted = \App\Models\VetUnavailability::where('unavailable_date', $date)->delete();
        
        if ($deleted) {
            return response()->json([
                'success' => true,
                'message' => 'Date is now available'
            ]);
        }
        
        return response()->json([
            'success' => false,
            'error' => 'Date not found'
        ], 404);
    });
    
    // Admin Appointment Review Routes
    Route::get('/treatment-staff', function () {
        return response()->json([
            'success' => true,
            'default' => \App\Support\TreatmentStaff::DEFAULT_ADMINISTERED_BY,
            'staff' => \App\Support\TreatmentStaff::listForTreatment(),
        ]);
    });

    // Get all clinical appointments (regular bookings only — Home Services
    // bookings are shown separately on the Elsalvador City Map admin page).
    Route::get('/all-appointments', function () {
        \App\Services\AppointmentStatusService::cancelPastApprovedClinicalAppointments();

        $appointments = \App\Models\Appointment::with([
            'user.barangay',
            'animal.species',
            'animal.breed',
            'treatmentTypes',
            'bookingServices.service',
            'bookingMedicines.inventory.medicine',
            'symptoms',
            'statusLogs',
        ])
            ->where('booking_type', 'appointment')
            ->orderBy('booking_date')
            ->orderBy('booking_time')
            ->orderBy('id')
            ->get();

        \App\Models\Appointment::hydrateBookedAnimals($appointments);

        return response()->json([
            'success' => true,
            'appointments' => $appointments->map(
                fn ($appointment) => \App\Support\AdminAppointmentFormatter::format($appointment)
            ),
        ]);
    });

    // Home Service history for the El Salvador City Map admin page (from / till dates).
    Route::get('/home-service-history', function (\Illuminate\Http\Request $request) {
        $from = $request->query('from');
        $till = $request->query('till');
        $fromDate = (is_string($from) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $from)) ? $from : null;
        $tillDate = (is_string($till) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $till)) ? $till : null;

        if ($fromDate && $tillDate && $fromDate > $tillDate) {
            [$fromDate, $tillDate] = [$tillDate, $fromDate];
        }

        $clientRoles = ['client', 'owner'];
        $clientCounts = \App\Models\Barangay::query()
            ->withCount(['users as clients_count' => function ($query) use ($clientRoles) {
                $query->whereIn('role', $clientRoles);
            }])
            ->orderBy('name')
            ->get(['id', 'name']);

        $visitCountsByBarangay = [];
        $bookingQuery = \App\Models\Appointment::query()
            ->where('booking_type', 'home_service')
            ->whereIn('status', ['pending', 'approved', 'processing', 'ongoing', 'completed'])
            ->orderByDesc('booking_date')
            ->orderByDesc('id');

        if ($fromDate) {
            $bookingQuery->whereDate('booking_date', '>=', $fromDate);
        }
        if ($tillDate) {
            $bookingQuery->whereDate('booking_date', '<=', $tillDate);
        }

        $bookings = $bookingQuery->get()
            ->map(function ($booking) use (&$visitCountsByBarangay) {
                $formatted = \App\Support\AdminAppointmentFormatter::format($booking);
                $pet = $formatted['pet'] ?? [];
                $user = $formatted['user'] ?? [];

                $meetingBarangay = \App\Support\BarangayGeoLocator::resolveFromCoordinates(
                    $booking->meeting_latitude != null ? (float) $booking->meeting_latitude : null,
                    $booking->meeting_longitude != null ? (float) $booking->meeting_longitude : null
                );

                if ($meetingBarangay) {
                    $barangayId = (int) $meetingBarangay['id'];
                    $visitCountsByBarangay[$barangayId] = ($visitCountsByBarangay[$barangayId] ?? 0) + 1;
                }

                return array_merge($formatted, [
                    'pet_name' => $pet['pet_name'] ?? $pet['name'] ?? null,
                    'pet_species' => is_string($pet['species'] ?? null) ? $pet['species'] : null,
                    'pet_breed' => is_string($pet['breed'] ?? null) ? $pet['breed'] : null,
                    'client_name' => $user['name'] ?? 'Client',
                    'client_phone' => $user['phone_number'] ?? null,
                    'client_barangay' => is_string($user['barangay'] ?? null) ? $user['barangay'] : null,
                    'client_zone' => $user['zone'] ?? null,
                    'meeting_barangay_id' => $meetingBarangay['id'] ?? null,
                    'meeting_barangay' => $meetingBarangay['name'] ?? null,
                    'date_formatted' => optional($booking->booking_date)->format('M d, Y'),
                    'time_formatted' => $booking->booking_time
                        ? date('h:i A', strtotime($booking->booking_time))
                        : null,
                ]);
            })
            ->values();

        $barangaySummaries = $clientCounts->map(function ($barangay) use ($visitCountsByBarangay) {
            return [
                'id' => (int) $barangay->id,
                'name' => $barangay->name,
                'clients_count' => (int) ($barangay->clients_count ?? 0),
                'home_services_count' => (int) ($visitCountsByBarangay[(int) $barangay->id] ?? 0),
            ];
        })->values();

        $today = now()->toDateString();
        $counts = [
            'all' => $bookings->count(),
            'today' => $bookings->filter(function ($booking) use ($today) {
                $date = $booking['date'] ?? null;
                return $date && substr((string) $date, 0, 10) === $today;
            })->count(),
            'pending' => $bookings->where('status', 'pending')->count(),
            'approved' => $bookings->where('status', 'approved')->count(),
            'processing' => $bookings->where('status', 'processing')->count(),
            'ongoing' => $bookings->where('status', 'ongoing')->count(),
            'completed' => $bookings->where('status', 'completed')->count(),
        ];

        return response()->json([
            'success' => true,
            'from' => $fromDate,
            'till' => $tillDate,
            'bookings' => $bookings,
            'counts' => $counts,
            'barangay_summaries' => $barangaySummaries,
        ]);
    });
    
    Route::get('/animals/{id}/medical-summary', function ($id) {
        $animal = \App\Models\Animal::find($id);

        if (!$animal) {
            return response()->json([
                'success' => false,
                'error' => 'Animal not found',
            ], 404);
        }

        $summary = \App\Support\AnimalMedicalSummary::forAnimal($animal);

        return response()->json([
            'success' => true,
            ...$summary,
        ]);
    });

    // Get all available services for filtering
    Route::get('/services-list', function () {
        $services = \App\Models\Service::orderBy('type_name')->get(['id', 'type_name']);
        
        return response()->json([
            'success' => true,
            'services' => $services->pluck('type_name')->toArray(),
        ]);
    });

    // Service report summary grouped by month and animal type
    Route::get('/service-report', function (Request $request) {
        try {
            $serviceId = $request->input('service_id');
            $year = $request->input('year', now()->year);
            $month = $request->input('month');
            $monthNumber = is_numeric($month) ? (int) $month : null;
            if ($monthNumber !== null && ($monthNumber < 1 || $monthNumber > 12)) {
                $monthNumber = null;
            }

            $fromInput = $request->input('from');
            $tillInput = $request->input('till');

            if ($request->input('report') === 'animals') {
                try {
                    $fromDate = $fromInput ? Carbon::parse($fromInput)->toDateString() : null;
                    $tillDate = $tillInput ? Carbon::parse($tillInput)->toDateString() : null;
                } catch (\Exception $e) {
                    return response()->json([
                        'success' => false,
                        'error' => 'Invalid date range.',
                    ], 422);
                }

                if ($fromDate && $tillDate && $fromDate > $tillDate) {
                    return response()->json([
                        'success' => false,
                        'error' => 'From date must be on or before the till date.',
                    ], 422);
                }

                $appointments = Appointment::query()
                    ->when($fromDate, fn ($query) => $query->whereDate('booking_date', '>=', $fromDate))
                    ->when($tillDate, fn ($query) => $query->whereDate('booking_date', '<=', $tillDate))
                    ->where('status', '!=', 'cancelled')
                    ->get(['id', 'animal_id', 'status', 'booked_animals', 'cancellation_reason']);

                $animalIds = [];
                foreach ($appointments as $appointment) {
                    foreach ($appointment->bookedAnimalEntries() as $entry) {
                        if (($entry['status'] ?? null) === 'cancelled') {
                            continue;
                        }
                        $animalId = (int) ($entry['animal_id'] ?? 0);
                        if ($animalId > 0) {
                            $animalIds[$animalId] = true;
                        }
                    }
                }

                $animals = $animalIds === []
                    ? collect()
                    : Animal::query()
                        ->with(['species.animalType', 'breed', 'user.barangay'])
                        ->whereIn('id', array_keys($animalIds))
                        ->get();

                $owners = $animals
                    ->groupBy(fn ($animal) => $animal->user_id ?: 0)
                    ->map(function ($group) {
                        $user = $group->first()->user;
                        $animalRows = $group->map(function ($animal) {
                            $typeName = $animal->species?->animalType?->type_name;
                            $animalType = match ($typeName) {
                                'Livestock' => 'Livestock',
                                'Poultry' => 'Poultry',
                                null, '' => 'Pet Animals',
                                default => $typeName,
                            };

                            return [
                                'id' => $animal->id,
                                'name' => $animal->pet_name ?: 'Unnamed animal',
                                'animal_type' => $animalType,
                                'species_name' => $animal->species?->species_name,
                                'breed' => $animal->breed?->breed_name,
                                'identification_number' => $animal->identification_number,
                            ];
                        })->sortBy('name', SORT_NATURAL | SORT_FLAG_CASE)->values();

                        $petAnimals = $animalRows->filter(fn ($row) => ! in_array($row['animal_type'], ['Livestock', 'Poultry'], true))->count();
                        $livestock = $animalRows->where('animal_type', 'Livestock')->count();
                        $poultry = $animalRows->where('animal_type', 'Poultry')->count();

                        return [
                            'id' => $user?->id ?? 0,
                            'name' => \App\Support\OwnerDisplayHelper::displayName($user),
                            'zone' => $user?->zone,
                            'barangay' => $user?->barangay?->name,
                            'barangay_id' => $user?->barangay_id,
                            'phone_number' => $user?->phone_number,
                            'total_animals' => $animalRows->count(),
                            'pet_animals' => $petAnimals,
                            'livestock' => $livestock,
                            'poultry' => $poultry,
                            'animal_types' => $animalRows->pluck('animal_type')->filter()->unique()->values()->all(),
                            'species_names' => $animalRows->pluck('species_name')->filter()->unique()->values()->all(),
                            'animals' => $animalRows->all(),
                        ];
                    })
                    ->sortBy('name', SORT_NATURAL | SORT_FLAG_CASE)
                    ->values();

                return response()->json([
                    'success' => true,
                    'from' => $fromDate,
                    'till' => $tillDate,
                    'barangays' => Barangay::orderBy('name')->get(['id', 'name']),
                    'owners' => $owners,
                ]);
            }

            if ($fromInput || $tillInput || (!$request->filled('month') && !$request->filled('year'))) {
                try {
                    $fromDate = $fromInput ? Carbon::parse($fromInput)->toDateString() : null;
                    $tillDate = $tillInput ? Carbon::parse($tillInput)->toDateString() : null;
                } catch (\Exception $e) {
                    return response()->json([
                        'success' => false,
                        'error' => 'Invalid date range.',
                    ], 422);
                }

                if ($fromDate && $tillDate && $fromDate > $tillDate) {
                    return response()->json([
                        'success' => false,
                        'error' => 'From date must be on or before the till date.',
                    ], 422);
                }

                $recordsQuery = Appointment::query()
                    ->when($fromDate, fn ($query) => $query->whereDate('booking_date', '>=', $fromDate))
                    ->when($tillDate, fn ($query) => $query->whereDate('booking_date', '<=', $tillDate))
                    ->whereIn('status', ['completed', 'cancelled'])
                    ->with([
                        'user.barangay',
                        'assignedFieldmen',
                        'animal.species',
                        'animal.breed',
                        'treatmentTypes',
                        'treatmentType',
                        'bookingServices.service',
                        'bookingMedicines.inventory.medicine',
                        'bookingMedicines.medicine',
                        'symptoms',
                        'statusLogs',
                    ])
                    ->orderByDesc('booking_date')
                    ->orderByDesc('booking_time')
                    ->orderByDesc('id');

                if ($serviceId) {
                    $recordsQuery->where(function ($builder) use ($serviceId) {
                        $builder->where('service_type_id', $serviceId)
                            ->orWhereHas('services', function ($services) use ($serviceId) {
                                $services->where('services.id', $serviceId);
                            });
                    });
                } else {
                    $recordsQuery->where(function ($builder) {
                        $builder->whereNotNull('service_type_id')
                            ->orWhereHas('services');
                    });
                }

                $recordAppointments = $recordsQuery->get();
                Appointment::hydrateBookedAnimals($recordAppointments);

                return response()->json([
                    'success' => true,
                    'from' => $fromDate,
                    'till' => $tillDate,
                    'service' => $serviceId ? optional(Service::find($serviceId))->type_name : 'All services',
                    'records' => $recordAppointments
                        ->map(fn ($appointment) => AdminAppointmentFormatter::format($appointment))
                        ->values(),
                ]);
            }

            if ($monthNumber) {
                $startDate = Carbon::create($year, $monthNumber, 1)->startOfMonth();
                $endDate = Carbon::create($year, $monthNumber, 1)->endOfMonth();
            } else {
                $startDate = Carbon::create($year, 1, 1)->startOfYear();
                $endDate = Carbon::create($year, 12, 31)->endOfYear();
            }
            $with = ['animal.species.animalType', 'user.barangay'];

            if ($serviceId) {
                $service = Service::find($serviceId);
                if (!$service) {
                    return response()->json([
                        'success' => false,
                        'error' => 'Service not found'
                    ], 404);
                }

                $appointments = $service->appointments()
                    ->whereBetween('booking_date', [$startDate, $endDate])
                    ->where('bookings.status', '!=', 'cancelled')
                    ->with($with)
                    ->get()
                    ->unique('id')
                    ->values();
                $serviceName = $service->type_name;
            } else {
                $appointments = Appointment::query()
                    ->whereBetween('booking_date', [$startDate, $endDate])
                    ->where('status', '!=', 'cancelled')
                    ->with($with)
                    ->get();
                $serviceName = 'Total';
            }

            $countTypes = function ($items) {
                $counts = [
                    'petAnimals' => 0,
                    'livestock' => 0,
                    'poultry' => 0,
                ];

                foreach ($items as $appointment) {
                    $typeName = $appointment->animal?->species?->animalType?->type_name;
                    if ($typeName === 'Livestock') {
                        $counts['livestock']++;
                    } elseif ($typeName === 'Poultry') {
                        $counts['poultry']++;
                    } else {
                        $counts['petAnimals']++;
                    }
                }

                $counts['total'] = $counts['petAnimals'] + $counts['livestock'] + $counts['poultry'];

                return $counts;
            };

            $report = collect(range(1, 12))->map(function ($monthNumber) use ($appointments, $year, $countTypes) {
                $monthly = $appointments->filter(function ($appointment) use ($monthNumber) {
                    return $appointment->booking_date && $appointment->booking_date->month === $monthNumber;
                });

                return array_merge([
                    'month' => Carbon::create($year, $monthNumber, 1)->format('F'),
                ], $countTypes($monthly));
            });

            $barangayReport = Barangay::orderBy('name')->get()->map(function ($barangay) use ($appointments, $countTypes) {
                $barangayAppointments = $appointments->filter(function ($appointment) use ($barangay) {
                    return (int) ($appointment->user?->barangay_id) === (int) $barangay->id;
                });

                return array_merge([
                    'id' => $barangay->id,
                    'name' => $barangay->name,
                ], $countTypes($barangayAppointments));
            });

            $unassignedAppointments = $appointments->filter(function ($appointment) {
                return empty($appointment->user?->barangay_id);
            });

            if ($unassignedAppointments->isNotEmpty()) {
                $barangayReport->push(array_merge([
                    'id' => null,
                    'name' => 'Unassigned',
                ], $countTypes($unassignedAppointments)));
            }

            return response()->json([
                'success' => true,
                'service' => $serviceName,
                'year' => $year,
                'data' => $report,
                'barangays' => $barangayReport->values(),
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ], 500);
        }
    });
    
    // Get pending appointments for review
    Route::get('/pending-appointments', function () {
        $appointments = \App\Models\Appointment::where('status', 'pending')
            ->with(['user', 'animal.species', 'animal.breed', 'treatmentTypes'])
            ->orderBy('booking_date', 'asc')
            ->get();
            
        return response()->json([
            'success' => true,
            'appointments' => $appointments->map(function ($appointment) {
                return [
                    'id' => $appointment->id,
                    'status' => $appointment->status,
                    'user' => \App\Support\OwnerDisplayHelper::toAppointmentUserArray($appointment->user),
                    'pet' => [
                        'id' => $appointment->animal->id,
                        'name' => $appointment->animal->pet_name,
                        'species' => $appointment->animal->species?->species_name ?? $appointment->animal->species,
                        'breed' => $appointment->animal->breed?->breed_name ?? $appointment->animal->breed,
                        'registration_status' => $appointment->animal->registration_status,
                    ],
                    'service' => $appointment->treatmentTypes->first()?->type_name
                        ?? $appointment->treatmentType?->type_name,
                    'services' => ($appointment->treatmentTypes->isNotEmpty()
                        ? $appointment->treatmentTypes->pluck('type_name')
                        : collect([$appointment->treatmentType?->type_name])
                    )->filter()->values()->toArray(),
                    'date' => $appointment->booking_date->format('Y-m-d'),
                    'time' => $appointment->booking_time,
                    'notes' => $appointment->notes,
                    'complaint' => [
                        'is_bitten' => $appointment->is_bitten ?? false,
                        'bite_details' => $appointment->bite_details,
                    ],
                    'created_at' => $appointment->created_at->format('Y-m-d H:i:s'),
                ];
            }),
        ]);
    });
    
    Route::get('/inventory', [App\Http\Controllers\BudgetInventoryController::class, 'index']);

    Route::post('/appointments/{id}/complete', [AppointmentController::class, 'completeTreatment']);
    Route::post('/appointments/{id}/handoff', [AppointmentController::class, 'handoffToBudget']);

    // Cancel appointment (admin)
    Route::patch('/appointments/{id}/cancel', function (Request $request, $id) {
        try {
            $validated = $request->validate([
                'cancellation_reason' => 'required|string|min:3|max:1000',
            ], [
                'cancellation_reason.required' => 'A cancellation reason is required so the client can be notified.',
            ]);

            $appointment = \App\Models\Appointment::find($id);
            
            if (!$appointment) {
                return response()->json([
                    'success' => false,
                    'error' => 'Appointment not found'
                ], 404);
            }
            
            if ($appointment->status === 'cancelled') {
                return response()->json([
                    'success' => false,
                    'error' => 'Appointment is already cancelled'
                ], 400);
            }
            
            $appointment->update([
                'status' => 'cancelled',
                'cancellation_reason' => $validated['cancellation_reason'],
            ]);

            \App\Services\BookingAnimalStatusService::syncAnimalsToBookingStatus(
                $appointment,
                'cancelled',
                $validated['cancellation_reason']
            );

            \App\Services\AppointmentStatusLogService::recordForDataManager(
                $appointment->fresh(),
                'cancelled'
            );

            \App\Services\AppointmentClientNotificationService::notifyCancelled(
                $appointment->fresh(),
                $validated['cancellation_reason']
            );

            \App\Services\AppointmentBroadcastService::notify($appointment->fresh(), 'cancelled');
            
            return response()->json([
                'success' => true,
                'message' => 'Appointment cancelled and client notified successfully',
                'appointment' => [
                    'id' => $appointment->id,
                    'status' => $appointment->status,
                ],
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            throw $e;
        } catch (\Exception $e) {
            \Log::error('Appointment cancellation failed: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'error' => 'Failed to cancel appointment',
                'message' => $e->getMessage(),
            ], 500);
        }
    });
});

// Revenue API routes
Route::prefix('revenue')->group(function () {
    Route::get('/', [App\Http\Controllers\RevenueController::class, 'index']);
    Route::get('/vhc', [App\Http\Controllers\RevenueController::class, 'vhcRevenue']);
    Route::post('/vhc/species-fee', [App\Http\Controllers\RevenueController::class, 'updateSpeciesFee']);
    Route::post('/update-fee', [App\Http\Controllers\RevenueController::class, 'updateFee']);
    Route::get('/history/{paymentTypeId}', [App\Http\Controllers\RevenueController::class, 'getHistory']);
});


// Public API routes (no mobile prefix)
Route::get('/services', function (ServiceAvailabilityService $availabilityService) {
    return response()->json([
        'success' => true,
        'services' => $availabilityService->enrichAll(),
    ]);
});

// Clients API routes - accessible to admin users (session or token auth via Sanctum)
Route::middleware(['auth:sanctum'])->group(function () {
    Route::get('/clients', function (Request $request) {
        try {
            $search = trim((string) $request->input('search', ''));
            $presentClient = function ($client) {
                return [
                    'id' => $client->id,
                    'firstname' => $client->firstname,
                    'lastname' => $client->lastname,
                    'middlename' => $client->middlename,
                    'name' => $client->name,
                    'email' => $client->email,
                    'phone_number' => $client->phone_number,
                    'profile_photo_url' => $client->profile_photo_url,
                    'barangay' => $client->barangay?->name,
                    'barangay_id' => $client->barangay_id,
                    'approval_status' => $client->approval_status,
                ];
            };

            $clientQuery = User::query()
                ->select([
                    'id',
                    'firstname',
                    'lastname',
                    'middlename',
                    'name',
                    'email',
                    'phone_number',
                    'profile_photo_url',
                    'barangay_id',
                    'approval_status',
                    'role',
                ])
                ->with('barangay:id,name')
                ->where(function ($query) {
                    $query->whereNotIn('role', ['data_manager', 'budget_officer', 'admin', 'veterinarian', 'fieldman'])
                        ->orWhereNull('role');
                });

            $matchedAnimals = collect();

            if ($search !== '') {
                $like = '%'.addcslashes($search, '%_\\').'%';
                $clientQuery->where(function ($builder) use ($like) {
                    $builder->where('firstname', 'like', $like)
                        ->orWhere('lastname', 'like', $like)
                        ->orWhere('middlename', 'like', $like)
                        ->orWhere('name', 'like', $like)
                        ->orWhere('email', 'like', $like)
                        ->orWhere('phone_number', 'like', $like)
                        ->orWhereRaw("CONCAT_WS(' ', firstname, lastname) LIKE ?", [$like])
                        ->orWhereRaw("CONCAT_WS(' ', firstname, middlename, lastname) LIKE ?", [$like]);
                })->limit(20);

                $matchedAnimals = Animal::query()
                    ->active()
                    ->with([
                        'user.barangay:id,name',
                        'species.animalType',
                        'breed',
                        'animalRegistrations',
                    ])
                    ->where(function ($animalQuery) use ($like) {
                        $animalQuery->where('identification_number', 'like', $like)
                            ->orWhere('pet_name', 'like', $like);
                    })
                    ->orderBy('pet_name')
                    ->limit(12)
                    ->get()
                    ->filter(function ($animal) {
                        return in_array($animal->registration_status, ['registered', 'exempt'], true);
                    })
                    ->map(function ($animal) use ($presentClient) {
                        $owner = $animal->user;
                        $ownerPayload = $owner ? $presentClient($owner) : null;
                        if ($ownerPayload) {
                            $displayName = trim(implode(' ', array_filter([$owner->firstname, $owner->lastname])));
                            $ownerPayload['name'] = $displayName !== '' ? $displayName : ($owner->name ?: 'Unknown');
                        }

                        return [
                            'id' => $animal->id,
                            'pet_name' => $animal->pet_name,
                            'identification_number' => $animal->identification_number,
                            'species_name' => $animal->species?->species_name,
                            'breed_name' => $animal->breed?->breed_name,
                            'registration_status' => $animal->registration_status,
                            'pet_photo_url' => $animal->pet_photo_url,
                            'owner' => $ownerPayload,
                        ];
                    })
                    ->values();
            }

            $clients = $clientQuery
                ->orderByRaw('COALESCE(firstname, name)')
                ->get()
                ->map($presentClient)
                ->values();

            if ($matchedAnimals->isNotEmpty()) {
                $knownIds = $clients->pluck('id')->filter()->all();
                $extraOwners = $matchedAnimals
                    ->pluck('owner')
                    ->filter(fn ($owner) => $owner && ! in_array($owner['id'], $knownIds, true))
                    ->unique('id')
                    ->values();
                $clients = $clients->concat($extraOwners)->values();
            }

            return response()->json([
                'success' => true,
                'clients' => $clients,
                'matched_animals' => $matchedAnimals,
            ]);
        } catch (\Exception $e) {
            \Log::error('Error fetching clients: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'error' => $e->getMessage()
            ], 500);
        }
    });

    // Get animals for a specific client
    Route::get('/clients/{id}/animals', function (Request $request, $id) {
        if (!auth()->check()) {
            return response()->json(['success' => false, 'error' => 'Unauthorized'], 401);
        }
        
        $animals = Animal::where('user_id', $id)
            ->with(['species', 'breed'])
            ->orderBy('pet_name')
            ->get();
        
        return response()->json([
            'success' => true,
            'animals' => $animals
        ]);
    });
});

Route::prefix('budget')->group(function () {
    Route::get('/categories', [App\Http\Controllers\BudgetInventoryController::class, 'getCategories']);
    Route::get('/units', [App\Http\Controllers\BudgetInventoryController::class, 'getUnits']);
    Route::get('/medicines', [App\Http\Controllers\BudgetInventoryController::class, 'medicines']);
    Route::get('/inventory', [App\Http\Controllers\BudgetInventoryController::class, 'index']);
    Route::get('/inventory/summary', [App\Http\Controllers\BudgetInventoryController::class, 'stockSummary']);
    Route::middleware(['web', 'auth'])->group(function () {
        Route::get('/inventory/alerts', [App\Http\Controllers\BudgetInventoryController::class, 'activeAlerts']);
        Route::post('/inventory/alerts/read', [App\Http\Controllers\BudgetInventoryController::class, 'markAlertRead']);
        Route::post('/inventory/alerts/read-all', [App\Http\Controllers\BudgetInventoryController::class, 'markAllAlertsRead']);
    });
    Route::post('/inventory', [App\Http\Controllers\BudgetInventoryController::class, 'store']);
    Route::post('/inventory/receiving', [App\Http\Controllers\BudgetInventoryController::class, 'receive']);
    Route::get('/inventory/history', [App\Http\Controllers\BudgetInventoryController::class, 'entryHistory']);
    Route::get('/inventory/{id}', [App\Http\Controllers\BudgetInventoryController::class, 'show']);
    Route::post('/inventory/{id}/stock-out', [App\Http\Controllers\BudgetInventoryController::class, 'stockOut']);
    Route::get('/reports/usage', [App\Http\Controllers\BudgetInventoryController::class, 'usageReport']);
    Route::get('/reports/stock-in', [App\Http\Controllers\BudgetInventoryController::class, 'stockInReport']);
    Route::post('/reports/logs/read', [App\Http\Controllers\BudgetInventoryController::class, 'markLogsRead']);
    Route::post('/reports/logs/{id}/read', [App\Http\Controllers\BudgetInventoryController::class, 'markLogRead']);
    Route::get('/reports/expired-stock', [App\Http\Controllers\BudgetInventoryController::class, 'expiredStockReport']);
    Route::get('/reports/service-history', [App\Http\Controllers\BudgetInventoryController::class, 'serviceHistoryReport']);

    // Damage history (budget review + approve/reject) — needs web session auth
    Route::middleware(['web', 'auth'])->group(function () {
        Route::get('/damage-reports/unread-count', [App\Http\Controllers\DamageReportController::class, 'unreadCount']);
        Route::get('/damage-reports/batches/{medicineId}', [App\Http\Controllers\DamageReportController::class, 'batches']);
        Route::get('/damage-reports', [App\Http\Controllers\DamageReportController::class, 'index']);
        Route::post('/damage-reports', [App\Http\Controllers\DamageReportController::class, 'store']);
        Route::get('/damage-reports/{id}', [App\Http\Controllers\DamageReportController::class, 'show']);
        Route::post('/damage-reports/{id}/approve', [App\Http\Controllers\DamageReportController::class, 'approve']);
        Route::post('/damage-reports/{id}/reject', [App\Http\Controllers\DamageReportController::class, 'reject']);
        Route::post('/damage-reports/{id}/deduct', [App\Http\Controllers\DamageReportController::class, 'deduct']);
    });
    
    // Budget Officer Treatments API routes
    Route::get('/treatments/processing', [App\Http\Controllers\Api\AppointmentController::class, 'getProcessingAppointments']);
    Route::post('/treatments/{id}/complete', [App\Http\Controllers\Api\AppointmentController::class, 'completeTreatment']);
});

Route::get('/test', function () {
    return response()->json([
        'success' => true,
        'message' => 'API is working',
        'timestamp' => now()
    ]);
});

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');
