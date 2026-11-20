<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use App\Http\Controllers\Admin\AuthController;
use App\Http\Controllers\Admin\BarangayController;
use App\Http\Controllers\Admin\ClientController;
use App\Http\Middleware\BlockFieldmanWebAccess;

Route::get('/', function () {
    return Inertia::render('Auth/Login', [
        'barangays' => \App\Models\Barangay::orderBy('name')->get(['id', 'name']),
    ]);
});

// Admin authentication routes (public)
Route::prefix('admin')->group(function () {
    Route::get('/login', [AuthController::class, 'showLoginForm'])->name('admin.login');
    Route::post('/login', [AuthController::class, 'login'])->name('admin.login.submit');
    Route::post('/register', [AuthController::class, 'register'])->name('admin.register');
});

// Protected admin routes
Route::middleware(['auth', BlockFieldmanWebAccess::class])->prefix('admin')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout'])->name('admin.logout');
    Route::get('/api-token', [AuthController::class, 'getApiToken'])->name('admin.api.token');
    Route::get('/dashboard', [AuthController::class, 'dashboard'])->name('admin.dashboard');
    // Revenue routes
    Route::get('/revenue', function () {
        return Inertia::render('Admin/revenue');
    })->name('admin.revenue');
    Route::get('/revenue/pet-registration', function () {
        return Inertia::render('Admin/RevenuePetRegistration');
    })->name('admin.revenue.pet-registration');
    Route::get('/revenue/vhc', function () {
        return Inertia::render('Admin/RevenueVhc');
    })->name('admin.revenue.vhc');
    
    // Barangay animals list. Client profiles stay on /admin/clients/{id}.
    Route::get('/barangay-animals/pending', [ClientController::class, 'pendingRegistrations'])->name('admin.clients.pending');
    Route::get('/barangay-animals/rejected', [ClientController::class, 'rejectedRegistrations'])->name('admin.clients.rejected');
    Route::get('/barangay-animals', [ClientController::class, 'index'])->name('admin.clients');
    Route::get('/clients/pending', function (\Illuminate\Http\Request $request) {
        return redirect()->route('admin.clients.pending', $request->query());
    });
    Route::get('/clients/rejected', function (\Illuminate\Http\Request $request) {
        return redirect()->route('admin.clients.rejected', $request->query());
    });
    Route::get('/clients', function (\Illuminate\Http\Request $request) {
        return redirect()->route('admin.clients', $request->query());
    });
    Route::post('/clients', [ClientController::class, 'store'])->name('admin.clients.store');
    Route::get('/clients/search', [ClientController::class, 'searchOwners'])->name('admin.clients.search');
    Route::get('/clients/{client}', [ClientController::class, 'show'])->name('admin.clients.show');
    Route::put('/clients/{client}', [ClientController::class, 'update'])->name('admin.clients.update');
    Route::post('/clients/{client}/create-account', [ClientController::class, 'createAccount'])->name('admin.clients.create-account');
    Route::post('/clients/{client}/approval', [ClientController::class, 'updateApproval'])->name('admin.clients.approval');
    Route::get('/barangays', [ClientController::class, 'getBarangays'])->name('admin.barangays');
    Route::get('/zones', [ClientController::class, 'getZones'])->name('admin.zones');
    Route::post('/zones', [ClientController::class, 'storeZone'])->name('admin.zones.store');
    
    // Species and breeds management routes
    Route::post('/species', [ClientController::class, 'storeSpecies'])->name('admin.species.store');
    Route::post('/breeds', [ClientController::class, 'storeBreed'])->name('admin.breeds.store');
    Route::get('/animal-data', [ClientController::class, 'getAnimalData'])->name('admin.animal-data');
    
    // Animal management routes
    Route::post('/clients/{client}/animals', [ClientController::class, 'storePet'])->name('admin.clients.animals.store');
    Route::match(['put', 'post'], '/clients/{client}/animals/{pet}', [ClientController::class, 'updatePet'])->name('admin.clients.animals.update');
    Route::post('/clients/{client}/animals/{pet}/status', [ClientController::class, 'updatePetStatus'])->name('admin.clients.animals.status');
    Route::get('/clients/{client}/animals/{pet}/history', [ClientController::class, 'petHistory'])->name('admin.clients.animals.history');
    
    // Appointments route
    Route::get('/appointments', function () {
        return Inertia::render('Admin/Appointments');
    })->name('admin.appointments');
    Route::get('/appointments/{id}', function ($id) {
        return Inertia::render('Admin/Appointments', [
            'detailId' => (int) $id,
        ]);
    })->whereNumber('id')->name('admin.appointments.show');

    // Services route
    Route::get('/services', function () {
        return Inertia::render('Admin/Services');
    })->name('admin.services');

    // Admin reports route
    Route::get('/reports', function () {
        return Inertia::render('Admin/ServicesReports');
    })->name('admin.reports');

    Route::get('/inventory-reports', function () {
        return Inertia::render('budget/budgetreports', [
            'sidebar' => 'admin',
        ]);
    })->name('admin.inventory-reports');

    // Elsalvador City map route
    Route::get('/elsalvador-city-map', function () {
        $clientRoles = ['client', 'owner'];
        $monthStart = now()->startOfMonth()->toDateString();
        $monthEnd = now()->endOfMonth()->toDateString();

        $completedHomeServicesThisMonth = [];
        \App\Models\Appointment::query()
            ->where('booking_type', 'home_service')
            ->where('status', 'completed')
            ->whereBetween('booking_date', [$monthStart, $monthEnd])
            ->whereNotNull('meeting_latitude')
            ->whereNotNull('meeting_longitude')
            ->get(['id', 'meeting_latitude', 'meeting_longitude'])
            ->each(function ($booking) use (&$completedHomeServicesThisMonth) {
                $meetingBarangay = \App\Support\BarangayGeoLocator::resolveFromCoordinates(
                    $booking->meeting_latitude != null ? (float) $booking->meeting_latitude : null,
                    $booking->meeting_longitude != null ? (float) $booking->meeting_longitude : null
                );
                if (!$meetingBarangay) {
                    return;
                }
                $barangayId = (int) $meetingBarangay['id'];
                $completedHomeServicesThisMonth[$barangayId] = ($completedHomeServicesThisMonth[$barangayId] ?? 0) + 1;
            });

        $barangays = \App\Models\Barangay::orderBy('name')
            ->withCount(['users as clients_count' => function ($query) use ($clientRoles) {
                $query->whereIn('role', $clientRoles);
            }])
            ->get(['id', 'name', 'photo_url'])
            ->map(function ($barangay) use ($completedHomeServicesThisMonth) {
                $barangay->home_services_completed_this_month = (int) ($completedHomeServicesThisMonth[$barangay->id] ?? 0);

                return $barangay;
            });

        $geojsonPath = public_path('geojson/elsalvador-barangays.geojson');
        $barangayGeoJson = file_exists($geojsonPath)
            ? json_decode(file_get_contents($geojsonPath), true)
            : ['type' => 'FeatureCollection', 'features' => []];

        // Active visits stay on the map. A completed visit stays for one day, then leaves.
        $completedSince = now()->subDay();
        $doorToDoorBookings = \App\Models\Appointment::query()
            ->where('booking_type', 'home_service')
            ->whereNotNull('meeting_latitude')
            ->whereNotNull('meeting_longitude')
            ->where(function ($query) use ($completedSince) {
                $query->whereIn('status', ['pending', 'approved', 'processing', 'ongoing'])
                    ->orWhere(function ($completed) use ($completedSince) {
                        $completed->where('status', 'completed')
                            ->where(function ($recent) use ($completedSince) {
                                $recent->where('updated_at', '>=', $completedSince)
                                    ->orWhereHas('statusLogs', function ($log) use ($completedSince) {
                                        $log->where('status', 'completed')
                                            ->where('changed_at', '>=', $completedSince);
                                    });
                            });
                    });
            })
            ->with(['statusLogs' => function ($query) {
                $query->where('status', 'completed')->latest('changed_at');
            }])
            ->orderByDesc('booking_date')
            ->orderByDesc('booking_time')
            ->get()
            ->map(function ($booking) {
                $formatted = \App\Support\AdminAppointmentFormatter::format($booking);
                $pet = $formatted['pet'] ?? [];
                $user = $formatted['user'] ?? [];
                $completedAt = $booking->status === 'completed'
                    ? ($booking->statusLogs->first()?->changed_at ?? $booking->updated_at)
                    : null;

                // Flat aliases keep map markers / sidebar list working without nested lookups.
                return array_merge($formatted, [
                    'pet_name' => $pet['pet_name'] ?? $pet['name'] ?? null,
                    'pet_species' => is_string($pet['species'] ?? null) ? $pet['species'] : null,
                    'pet_breed' => is_string($pet['breed'] ?? null) ? $pet['breed'] : null,
                    'pet_sex' => $pet['sex'] ?? null,
                    'pet_age' => $pet['age'] ?? null,
                    'pet_registration_status' => $pet['registration_status'] ?? null,
                    'client_name' => $user['name'] ?? 'Client',
                    'client_phone' => $user['phone_number'] ?? null,
                    'client_email' => $user['email'] ?? null,
                    'client_barangay' => is_string($user['barangay'] ?? null) ? $user['barangay'] : null,
                    'client_zone' => $user['zone'] ?? null,
                    'meeting_latitude' => $booking->meeting_latitude != null
                        ? (float) $booking->meeting_latitude
                        : null,
                    'meeting_longitude' => $booking->meeting_longitude != null
                        ? (float) $booking->meeting_longitude
                        : null,
                    'meeting_place_label' => 'MEETING PLACE',
                    'meeting_place_photo_url' => $booking->meeting_place_photo_url,
                    'completed_at' => $completedAt instanceof \DateTimeInterface
                        ? $completedAt->format('Y-m-d H:i:s')
                        : null,
                ]);
            });

        $mapPets = \App\Support\ElsalvadorMapPets::collect($clientRoles);

        $homeServiceTotal = \App\Models\Appointment::query()
            ->where('booking_type', 'home_service')
            ->whereNotIn('status', ['cancelled', 'rejected'])
            ->count();

        return Inertia::render('Admin/ElsalvadorCityMap', [
            'barangays' => $barangays->values()->all(),
            'barangayGeoJson' => $barangayGeoJson,
            'doorToDoorBookings' => $doorToDoorBookings->values()->all(),
            'mapPets' => $mapPets->all(),
            'homeServiceTotal' => $homeServiceTotal,
        ]);
    })->name('admin.elsalvador-city-map');

    Route::get('/elsalvador-city-map/home-service-history', function () {
        return Inertia::render('Admin/HomeServiceHistory');
    })->name('admin.elsalvador-city-map.home-service-history');

    Route::match(['put', 'post'], '/barangays/{barangay}', [BarangayController::class, 'update'])->name('admin.barangays.update');
    
    // Walk-in appointment route
    Route::post('/walk-in-appointment', function (\Illuminate\Http\Request $request) {
        \Illuminate\Support\Facades\Log::info('Walk-in appointment request received', [
            'client_id' => $request->input('client_id'),
            'animal_id' => $request->input('animal_id'),
            'animal_ids' => $request->input('animal_ids'),
            'service_id' => $request->input('service_id'),
            'service_ids' => $request->input('service_ids'),
            'booking_date' => $request->input('booking_date'),
            'booking_time' => $request->input('booking_time'),
            'auth_check' => auth()->check()
        ]);
        
        try {
            $validated = $request->validate([
                'client_id' => 'required|exists:users,id',
                'animal_id' => 'nullable|exists:animals,id|required_without:animal_ids',
                'animal_ids' => 'nullable|array|min:1|required_without:animal_id',
                'animal_ids.*' => 'integer|exists:animals,id',
                'service_id' => 'nullable|exists:services,id|required_without_all:service_ids,pet_services',
                'service_ids' => 'nullable|array',
                'service_ids.*' => 'exists:services,id',
                'pet_services' => 'nullable|array',
                'pet_services.*.pet_id' => 'required_with:pet_services|integer|exists:animals,id',
                'pet_services.*.service_ids' => 'nullable|array',
                'pet_services.*.service_ids.*' => 'integer|exists:services,id',
                'booking_date' => 'required|date_format:Y-m-d',
                'booking_time' => 'required|date_format:H:i',
                'administered_by' => 'nullable|string|max:255',
                'assigned_fieldman_id' => 'nullable|integer|exists:users,id',
                'notes' => 'nullable|string',
                'status' => 'nullable|in:pending,processing,ongoing,completed',
                'symptoms' => 'nullable|array',
                'is_bitten' => 'nullable|boolean',
                'bite_details' => 'nullable|string|max:255'
            ], [
                'client_id.required' => 'Client is required.',
                'client_id.exists' => 'Selected client does not exist.',
                'animal_id.required_without' => 'Select at least one animal.',
                'animal_id.exists' => 'Selected animal does not exist.',
                'animal_ids.required_without' => 'Select at least one animal.',
                'animal_ids.min' => 'Select at least one animal.',
                'service_id.required' => 'Service is required.',
                'service_id.exists' => 'Selected service does not exist.',
                'booking_date.required' => 'Appointment date is required.',
                'booking_date.date_format' => 'Appointment date must be in YYYY-MM-DD format.',
                'booking_time.required' => 'Appointment time is required.',
                'booking_time.date_format' => 'Appointment time must be in HH:MM format.',
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            \Illuminate\Support\Facades\Log::error('Validation errors:', $e->errors());
            throw $e;
        }

        $animalIds = collect($validated['animal_ids'] ?? [])
            ->when(!empty($validated['animal_id']), fn ($ids) => $ids->push($validated['animal_id']))
            ->map(fn ($id) => (int) $id)
            ->filter(fn ($id) => $id > 0)
            ->unique()
            ->values();

        if ($animalIds->isEmpty()) {
            return response()->json([
                'success' => false,
                'message' => 'Select at least one animal.',
            ], 422);
        }

        $animals = \App\Models\Animal::whereIn('id', $animalIds->all())
            ->where('user_id', $validated['client_id'])
            ->get()
            ->keyBy('id');

        if ($animals->count() !== $animalIds->count()) {
            return response()->json([
                'success' => false,
                'message' => 'One or more selected animals do not belong to this client.',
            ], 422);
        }

        foreach ($animalIds as $animalId) {
            $animal = $animals->get($animalId);
            if (!in_array($animal?->registration_status, ['registered', 'exempt'], true)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Only registered or exempt animals can receive walk-in services.',
                ], 422);
            }
        }
        
        try {
            \Illuminate\Support\Facades\DB::beginTransaction();
            
            $selectedServiceIds = $validated['service_ids'] ?? [];
            
            // If service_id is provided, add it to service_ids if not already there
            if (!empty($validated['service_id'])) {
                if (!in_array($validated['service_id'], $selectedServiceIds)) {
                    $selectedServiceIds[] = $validated['service_id'];
                }
            }

            $servicesByPetId = [];
            foreach ($validated['pet_services'] ?? [] as $entry) {
                $petId = (int) ($entry['pet_id'] ?? 0);
                if (!$animalIds->contains($petId)) {
                    continue;
                }
                $ids = collect($entry['service_ids'] ?? [])
                    ->map(fn ($id) => (int) $id)
                    ->filter(fn ($id) => $id > 0)
                    ->unique()
                    ->values()
                    ->all();
                $servicesByPetId[$petId] = $ids;
                foreach ($ids as $id) {
                    if (!in_array($id, array_map('intval', $selectedServiceIds), true)) {
                        $selectedServiceIds[] = $id;
                    }
                }
            }

            $selectedServiceIds = array_values(array_unique(array_map('intval', $selectedServiceIds)));

            $hasPerPetServices = !empty($validated['pet_services']);
            foreach ($animalIds as $animalId) {
                if (!empty($servicesByPetId[$animalId])) {
                    continue;
                }
                if (!$hasPerPetServices && !empty($selectedServiceIds)) {
                    $servicesByPetId[$animalId] = $selectedServiceIds;
                }
            }
            
            // If still no services selected, we can't proceed
            if (empty($selectedServiceIds) || collect($servicesByPetId)->flatten()->isEmpty()) {
                \Illuminate\Support\Facades\DB::rollBack();
                return response()->json([
                    'success' => false,
                    'message' => 'At least one service must be selected'
                ], 422);
            }

            if (collect($animalIds)->contains(fn ($animalId) => empty($servicesByPetId[$animalId]))) {
                \Illuminate\Support\Facades\DB::rollBack();
                return response()->json([
                    'success' => false,
                    'message' => 'Each selected animal must have at least one service.',
                ], 422);
            }

            $availabilityError = app(\App\Services\ServiceAvailabilityService::class)
                ->assertServicesAvailable(array_map('intval', array_unique($selectedServiceIds)));

            if ($availabilityError) {
                return response()->json([
                    'success' => false,
                    'message' => $availabilityError,
                ], 422);
            }
            
            $walkInStatus = $validated['status']
                ?? \App\Support\BookingTimeHelper::walkInInitialStatus(
                    $validated['booking_date'],
                    $validated['booking_time']
                );

            $durationMinutes = \App\Support\ServiceDurationHelper::totalMinutesForServiceIds(
                array_map('intval', array_unique($selectedServiceIds))
            );

            $animalStatus = $walkInStatus === 'pending' ? 'pending' : 'approved';
            $bookedAnimals = $animalIds->map(fn ($animalId) => [
                'animal_id' => $animalId,
                'status' => $animalStatus,
                'cancellation_reason' => null,
                'administered_by' => null,
            ])->all();

            $normalizedWalkInTime = \App\Support\BookingTimeHelper::normalizeToHi($validated['booking_time']);
            $slotError = \App\Services\BookingSlotService::availabilityError(
                $validated['booking_date'],
                $normalizedWalkInTime,
                null,
                true
            );
            if ($slotError) {
                \Illuminate\Support\Facades\DB::rollBack();
                return response()->json([
                    'success' => false,
                    'message' => $slotError,
                ], 422);
            }

            // Create appointment
            $appointment = \App\Models\Appointment::create([
                'user_id' => $validated['client_id'],
                'animal_id' => $animalIds->first(),
                'booked_animals' => $bookedAnimals,
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
            
            // Link selected services to each booked animal
            foreach ($animalIds as $animalId) {
                foreach (array_unique($servicesByPetId[$animalId] ?? []) as $serviceId) {
                    \App\Models\AppointmentService::create([
                        'booking_id' => $appointment->id,
                        'service_type_id' => $serviceId,
                        'animal_id' => $animalId,
                    ]);
                }
            }
            
            // Save symptoms if provided
            if (!empty($validated['symptoms'])) {
                try {
                    foreach ($validated['symptoms'] as $symptomData) {
                        if (!empty($symptomData['name'])) {
                            // Find or create symptom
                            $symptom = \App\Models\Symptom::firstOrCreate(
                                ['name' => $symptomData['name']],
                                ['name' => $symptomData['name']]
                            );
                            
                            // Link symptom to appointment using the booking_symptoms table
                            try {
                                \Illuminate\Support\Facades\DB::table('booking_symptoms')->insert([
                                    'booking_id' => $appointment->id,
                                    'symptom_id' => $symptom->id,
                                    'days_count' => $symptomData['days_count'] ?? null,
                                    'notes' => $symptomData['notes'] ?? null,
                                    'created_at' => now(),
                                    'updated_at' => now(),
                                ]);
                            } catch (\Exception $tableError) {
                                \Illuminate\Support\Facades\Log::warning('booking_symptoms table error (skipping):', ['error' => $tableError->getMessage()]);
                                // Continue without stopping - the appointment is created successfully
                            }
                        }
                    }
                } catch (\Exception $symptomError) {
                    \Illuminate\Support\Facades\Log::warning('Symptom save error (skipping):', ['error' => $symptomError->getMessage()]);
                    // Continue without stopping - the appointment is created successfully
                }
            }
            
            $fieldmanIds = \App\Services\WalkInFieldmanAssignmentService::syncForWalkIn(
                $appointment,
                $validated['administered_by'] ?? null,
                isset($validated['assigned_fieldman_id']) ? (int) $validated['assigned_fieldman_id'] : null
            );

            \Illuminate\Support\Facades\DB::commit();

            $freshAppointment = $appointment->fresh(['assignedFieldmen', 'user', 'animal', 'treatmentTypes']);

            if ($fieldmanIds !== []) {
                \App\Services\AppointmentStatusLogService::recordForDataManager(
                    $freshAppointment,
                    $walkInStatus
                );
                \App\Services\AppointmentFieldmanNotificationService::notifyWalkInAssigned($freshAppointment);
            } elseif ($walkInStatus !== 'processing' && $walkInStatus !== 'pending') {
                \App\Services\AppointmentStatusLogService::recordForDataManager(
                    $freshAppointment,
                    $walkInStatus
                );
            }

            \App\Services\AppointmentBroadcastService::notify($freshAppointment, 'created');

            return response()->json([
                'success' => true,
                'message' => 'Walk-in appointment created successfully',
                'appointment' => $freshAppointment
            ]);
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\DB::rollBack();
            \Illuminate\Support\Facades\Log::error('Failed to create walk-in appointment: ' . $e->getMessage());
            
            return response()->json([
                'success' => false,
                'error' => 'Failed to create walk-in appointment: ' . $e->getMessage()
            ], 422);
        }
    })->name('admin.walk-in-appointment');

    // VHC (Veterinary Health Card) routes
    Route::get('/vhc', [ClientController::class, 'vhcIndex'])->name('admin.vhc.index');
    Route::get('/vhc/clients/{client}', [ClientController::class, 'vhcClientShow'])->name('admin.vhc.clients.show');
    Route::get('/vhc/{vhc}', [ClientController::class, 'vhcShow'])->name('admin.vhc.show');
    Route::post('/vhc', [ClientController::class, 'vhcStore'])->name('admin.vhc.store');
    Route::put('/vhc/{vhc}', [ClientController::class, 'vhcUpdate'])->name('admin.vhc.update');
    Route::put('/vhc/{vhc}/livestock', [ClientController::class, 'vhcUpdateLivestock'])->name('admin.vhc.livestock.update');
    Route::post('/vhc/{vhc}/livestock', [ClientController::class, 'vhcAddLivestock'])->name('admin.vhc.livestock.add');

    // Profile / settings routes
    Route::get('/settings', [AuthController::class, 'settings'])->name('admin.settings');
    Route::post('/settings/profile', [AuthController::class, 'updateProfile'])->name('admin.settings.profile');
    Route::post('/settings/staff', [AuthController::class, 'storeStaff'])->name('admin.settings.staff');
    Route::post('/settings/staff/{staff}', [AuthController::class, 'updateStaff'])->name('admin.settings.staff.update');
});

// Budget Officer routes (outside admin prefix)
Route::middleware([BlockFieldmanWebAccess::class])->group(function () {
Route::get('/budget/dashboard', [AuthController::class, 'budgetDashboard'])->name('budget.dashboard');
Route::get('/budget/inventory', function () {
    return Inertia::render('budget/InventoryList');
})->name('budget.inventory');

Route::get('/budget/inventory/add', function () {
    return Inertia::render('budget/AddInventory');
})->name('budget.inventory.add');
Route::get('/budget/inventory/history', function (\Illuminate\Http\Request $request) {
    return Inertia::render('budget/InventoryHistory', [
        'inventoryId' => $request->integer('inventory_id') ?: null,
        'search' => (string) $request->query('q', ''),
        'from' => $request->query('from'),
    ]);
})->name('budget.inventory.history');
Route::get('/budget/damage-reports', function () {
    return Inertia::render('budget/DamageReports');
})->name('budget.damage-reports');
Route::get('/budget/inventory/{id}', function ($id) {
    return Inertia::render('budget/InventoryDetail', ['id' => $id]);
})->name('budget.inventory.show');
Route::get('/budget/booked-services', function () {
    return Inertia::render('budget/ServiceHistory');
})->name('budget.booked-services');
Route::redirect('/budget/service-history', '/budget/booked-services');
Route::redirect('/budget/treatments', '/budget/booked-services');
Route::get('/budget/reports', function () {
    return Inertia::render('budget/budgetreports');
})->name('budget.reports');
});
Route::middleware(['auth', BlockFieldmanWebAccess::class])->group(function () {
    Route::get('/budget/profile', [AuthController::class, 'budgetProfile'])->name('budget.profile');
    Route::post('/budget/profile', [AuthController::class, 'updateBudgetProfile'])->name('budget.profile.update');
});

Route::middleware(['auth', BlockFieldmanWebAccess::class])->prefix('api/budget')->group(function () {
    Route::get('/notifications', [App\Http\Controllers\BudgetNotificationController::class, 'index']);
    Route::post('/notifications/{id}/read', [App\Http\Controllers\BudgetNotificationController::class, 'markRead']);
    Route::post('/notifications/read-all', [App\Http\Controllers\BudgetNotificationController::class, 'markAllRead']);
    Route::post('/notifications/scan-alerts', [App\Http\Controllers\BudgetNotificationController::class, 'scanAlerts']);
});
