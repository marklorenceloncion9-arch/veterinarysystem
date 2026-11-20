<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Appointment;
use App\Models\Complaint;
use App\Models\Animal;
use App\Models\Symptom;
use App\Models\Service;
use App\Models\Inventory;
use App\Models\BookingMedicine;
use App\Models\OutsidePurchaseItem;
use App\Services\AppointmentBroadcastService;
use App\Services\AppointmentClientNotificationService;
use App\Services\AppointmentStatusLogService;
use App\Services\AppointmentStatusService;
use App\Services\BookingAnimalStatusService;
use App\Services\BookingSlotService;
use App\Services\InventoryDeductionService;
use App\Services\ServiceAvailabilityService;
use App\Support\BookingTimeHelper;
use App\Support\BookingTypeLabel;
use App\Support\BudgetOngoingTreatmentFormatter;
use App\Support\ClientAppointmentFormatter;
use App\Support\QuantityFormatter;
use App\Support\ServiceDurationHelper;
use App\Support\TreatmentStaff;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;

class AppointmentController extends Controller
{
    /**
     * Get user's appointments
     */
    // Diri ilista ang mga appointment sa user.
    public function index(Request $request)
    {
        $user = $request->user();

        AppointmentStatusService::cancelPastApprovedClinicalAppointments();

        $appointments = Appointment::where('user_id', $user->id)
            ->with(['animal', 'treatmentType', 'treatmentTypes', 'symptoms', 'statusLogs', 'bookingServices.service'])
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get([
                'id',
                'animal_id',
                'booked_animals',
                'service_type_id',
                'booking_date',
                'booking_time',
                'status',
                'notes',
                'cancellation_reason',
                'is_bitten',
                'bite_details',
                'booking_type',
                'meeting_latitude',
                'meeting_longitude',
                'meeting_place_photo_url',
                'created_at',
                'updated_at',
            ]);

        Appointment::hydrateBookedAnimals($appointments);

        return response()->json([
            'success' => true,
            'appointments' => $appointments->map(
                fn ($appointment) => ClientAppointmentFormatter::format($appointment)
            ),
        ]);
    }

    /**
     * Create a new appointment with complaint and symptoms
     */
    // Diri i-save ang bag-ong booking sa appointment.
    public function store(Request $request)
    {
        // Debug: Log incoming request data
        \Log::info('Appointment store request data: ' . json_encode($request->all()));
        \Log::info('Animal ID received: ' . json_encode($request->input('pet_id')));
        \Log::info('Animal IDs received: ' . json_encode($request->input('pet_ids')));
        
        $isDoorToDoor = filter_var($request->input('is_door_to_door', false), FILTER_VALIDATE_BOOLEAN);
        $bookingType = $isDoorToDoor ? 'home_service' : 'appointment';

        $validator = Validator::make($request->all(), [
            'pet_id' => 'nullable|exists:animals,id',
            'pet_ids' => 'nullable|array|min:1',
            'pet_ids.*' => 'integer|exists:animals,id',
            'pet_services' => 'nullable|array',
            'pet_services.*.pet_id' => 'required_with:pet_services|integer|exists:animals,id',
            'pet_services.*.treatment_type_ids' => 'required_with:pet_services|array|min:1',
            'pet_services.*.treatment_type_ids.*' => 'integer|exists:services,id',
            'treatment_type_id' => 'required|exists:services,id',
            'treatment_type_ids' => 'nullable|array',
            'treatment_type_ids.*' => 'exists:services,id',
            'appointment_date' => 'required|date',
            'appointment_time' => 'required|date_format:H:i',
            'duration_minutes' => 'nullable|integer|min:10|max:240',
            'notes' => 'nullable|string',
            'symptoms' => 'nullable|array',
            'symptoms.*.name' => 'required_with:symptoms|string',
            'symptoms.*.days_count' => 'nullable|integer|min:1',
            'symptoms.*.notes' => 'nullable|string',
            'is_bitten' => 'nullable|boolean',
            'bite_details' => 'nullable|string',
            'is_door_to_door' => 'nullable|boolean',
            'meeting_latitude' => $isDoorToDoor ? 'required|numeric|between:8.50,8.63' : 'nullable|numeric',
            'meeting_longitude' => $isDoorToDoor ? 'required|numeric|between:124.44,124.60' : 'nullable|numeric',
            'meeting_place_photo_url' => $isDoorToDoor ? 'nullable|url|max:500' : 'nullable|url|max:500',
        ], [
            'meeting_latitude.required' => 'Please pin your meeting place on the map.',
            'meeting_longitude.required' => 'Please pin your meeting place on the map.',
            'meeting_latitude.between' => 'Home Services booking is only available inside El Salvador City.',
            'meeting_longitude.between' => 'Home Services booking is only available inside El Salvador City.',
        ]);

        $normalizedTime = BookingTimeHelper::normalizeToHi($request->appointment_time);
        $durationMinutes = BookingTimeHelper::resolveDurationMinutes(
            $request->input('duration_minutes') ? (int) $request->input('duration_minutes') : null
        );

        // Existing bookings do not occupy exclusive slots. Only vet unavailability,
        // past times, and clinic hours can make a time unbookable.
        $blockedRanges = \App\Models\VetUnavailability::getBlockedRangesForDate($request->appointment_date);

        $today = now()->format('Y-m-d');
        $currentTime = now()->format('H:i');

        if (!$normalizedTime || !BookingTimeHelper::isRangeAvailable(
            $normalizedTime,
            $durationMinutes,
            $blockedRanges,
            $request->appointment_date,
            $currentTime
        )) {
            return response()->json([
                'success' => false,
                'error' => 'This time slot is not available for the selected services. Please choose another time.'
            ], 422);
        }

        if ($validator->fails()) {
            \Log::error('Validation failed:', $validator->errors()->toArray());
            return response()->json([
                'success' => false,
                'error' => 'Validation failed',
                'messages' => $validator->errors()
            ], 422);
        }

        $user = $request->user();

        $requestedPetIds = collect($request->input('pet_ids', []))
            ->when($request->filled('pet_id'), fn ($ids) => $ids->push($request->pet_id))
            ->map(fn ($id) => (int) $id)
            ->filter(fn ($id) => $id > 0)
            ->unique()
            ->values();

        if ($requestedPetIds->isEmpty()) {
            return response()->json([
                'success' => false,
                'error' => 'Please select at least one animal',
                'messages' => ['pet_ids' => ['Please select at least one animal']],
            ], 422);
        }

        // Verify all animals belong to user
        $pets = Animal::whereIn('id', $requestedPetIds->all())
            ->where('user_id', $user->id)
            ->get();

        if ($pets->count() !== $requestedPetIds->count()) {
            return response()->json([
                'success' => false,
                'error' => 'One or more animals were not found or do not belong to you'
            ], 404);
        }

        // Preserve selection order from the client.
        $petsById = $pets->keyBy('id');
        $orderedPets = $requestedPetIds
            ->map(fn ($id) => $petsById->get($id))
            ->filter()
            ->values();
        $primaryPet = $orderedPets->first();
        $petIds = $orderedPets->pluck('id')->all();

        // Build per-pet service map. Fall back to shared treatment_type_ids for all pets.
        $petServicesInput = collect($request->input('pet_services', []));
        $servicesByPetId = [];

        if ($petServicesInput->isNotEmpty()) {
            foreach ($petServicesInput as $entry) {
                $petId = (int) ($entry['pet_id'] ?? 0);
                if (!in_array($petId, $petIds, true)) {
                    return response()->json([
                        'success' => false,
                        'error' => 'pet_services includes an animal that was not selected',
                    ], 422);
                }
                $ids = collect($entry['treatment_type_ids'] ?? [])
                    ->map(fn ($id) => (int) $id)
                    ->filter(fn ($id) => $id > 0)
                    ->unique()
                    ->values()
                    ->all();
                if (empty($ids)) {
                    return response()->json([
                        'success' => false,
                        'error' => 'Each selected animal must have at least one service',
                    ], 422);
                }
                $servicesByPetId[$petId] = $ids;
            }

            foreach ($petIds as $petId) {
                if (empty($servicesByPetId[$petId])) {
                    return response()->json([
                        'success' => false,
                        'error' => 'Each selected animal must have at least one service',
                    ], 422);
                }
            }
        } else {
            $sharedIds = collect($request->treatment_type_ids ?? [])
                ->when($request->filled('treatment_type_id'), fn ($ids) => $ids->push($request->treatment_type_id))
                ->map(fn ($id) => (int) $id)
                ->filter(fn ($id) => $id > 0)
                ->unique()
                ->values()
                ->all();

            if (empty($sharedIds) && $request->filled('treatment_type_id')) {
                $sharedIds = [(int) $request->treatment_type_id];
            }

            foreach ($petIds as $petId) {
                $servicesByPetId[$petId] = $sharedIds;
            }
        }

        $allTreatmentTypeIds = collect($servicesByPetId)->flatten()->unique()->values()->all();
        if (empty($allTreatmentTypeIds)) {
            return response()->json([
                'success' => false,
                'error' => 'Please select at least one service',
            ], 422);
        }

        $primaryServiceId = (int) ($request->treatment_type_id ?: $allTreatmentTypeIds[0]);
        if (!in_array($primaryServiceId, $allTreatmentTypeIds, true)) {
            $primaryServiceId = (int) $allTreatmentTypeIds[0];
        }

        $availabilityError = app(ServiceAvailabilityService::class)->assertServicesAvailable($allTreatmentTypeIds);
        if ($availabilityError) {
            return response()->json([
                'success' => false,
                'error' => $availabilityError,
            ], 422);
        }

        try {
            DB::beginTransaction();

            if (BookingSlotService::isClinicBooking($bookingType)) {
                $slotError = BookingSlotService::availabilityError(
                    $request->appointment_date,
                    $normalizedTime,
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
            }

            // Create appointment with 'pending' status (waiting for admin approval)
            $appointment = Appointment::create([
                'user_id' => $user->id,
                'animal_id' => $primaryPet->id,
                'service_type_id' => $primaryServiceId,
                'booking_date' => $request->appointment_date,
                'booking_time' => $normalizedTime,
                'duration_minutes' => $durationMinutes,
                'status' => 'pending', // Pending admin approval
                'notes' => $request->notes,
                'booking_type' => $bookingType,
                'meeting_latitude' => $isDoorToDoor ? $request->meeting_latitude : null,
                'meeting_longitude' => $isDoorToDoor ? $request->meeting_longitude : null,
                'meeting_place_photo_url' => $isDoorToDoor ? ($request->meeting_place_photo_url ?: null) : null,
                'is_bitten' => $request->is_bitten ?? false,
                'bite_details' => $request->is_bitten ? $request->bite_details : null,
            ]);

            $appointment->syncBookedAnimalIds($petIds);

            $now = now();
            $serviceRows = [];
            foreach ($servicesByPetId as $petId => $serviceIds) {
                foreach ($serviceIds as $serviceId) {
                    $serviceRows[] = [
                        'booking_id' => $appointment->id,
                        'service_type_id' => $serviceId,
                        'animal_id' => $petId,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ];
                }
            }
            if (!empty($serviceRows)) {
                DB::table('booking_services')->insert($serviceRows);
            }

            // Store symptoms directly with appointment using booking_symptoms table
            if ($request->has('symptoms') && is_array($request->symptoms)) {
                \Log::info('Attaching symptoms to appointment: ' . json_encode($request->symptoms));
                foreach ($request->symptoms as $symptomData) {
                    // Find or create symptom by name
                    $symptomName = $symptomData['name'] ?? $symptomData['symptom_id'] ?? null;
                    if ($symptomName) {
                        $symptom = Symptom::firstOrCreate(
                            ['name' => $symptomName],
                            ['name' => $symptomName]
                        );
                        // Ensure we have a valid symptom ID before attaching
                        if ($symptom && $symptom->id) {
                            // Attach symptom directly to appointment using booking_symptoms table
                            \DB::table('booking_symptoms')->insert([
                                'booking_id' => $appointment->id,
                                'symptom_id' => $symptom->id,
                                'days_count' => $symptomData['days_count'] ?? null,
                                'notes' => $symptomData['notes'] ?? null,
                                'created_at' => now(),
                                'updated_at' => now(),
                            ]);
                        }
                    }
                }
                \Log::info('Symptoms attached. Count: ' . count($request->symptoms));
            } else {
                \Log::info('No symptoms to attach. has(): ' . ($request->has('symptoms') ? 'true' : 'false'));
            }

            DB::commit();

            AppointmentStatusLogService::recordForAuthenticatedUser($appointment, 'pending');

            AppointmentBroadcastService::notify($appointment->fresh(['treatmentTypes', 'animal']), 'created');

            $petNames = $orderedPets->pluck('pet_name')->filter()->values();
            $appointment->loadMissing('treatmentTypes');

            return response()->json([
                'success' => true,
                'message' => $isDoorToDoor
                    ? 'Home Services booking submitted for review'
                    : 'Appointment submitted for review',
                'appointment' => [
                    'id' => $appointment->id,
                    'petName' => $petNames->implode(', '),
                    'petNames' => $petNames->all(),
                    'service' => $appointment->treatmentTypes?->first()?->type_name ?? $appointment->treatmentType?->type_name,
                    'date' => $appointment->booking_date->format('Y-m-d'),
                    'date_formatted' => $appointment->booking_date->format('M d, Y'),
                    'time' => date('h:i A', strtotime($appointment->booking_time)),
                    'status' => $appointment->status,
                    'notes' => $appointment->notes,
                    'isDoorToDoor' => $isDoorToDoor,
                    'meetingLatitude' => $appointment->meeting_latitude,
                    'meetingLongitude' => $appointment->meeting_longitude,
                    'meetingPlaceLabel' => $isDoorToDoor ? 'MEETING PLACE' : null,
                    'meetingPlacePhotoUrl' => $appointment->meeting_place_photo_url,
                ],
            ], 201);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json([
                'success' => false,
                'error' => 'Failed to create appointment',
                'message' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Cancel an appointment
     */
    // Diri i-cancel ang appointment.
    public function cancel(Request $request, $id)
    {
        $user = $request->user();
        
        $appointment = Appointment::where('id', $id)
            ->where('user_id', $user->id)
            ->first();

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

        if (!in_array($appointment->status, ['pending', 'approved'], true)) {
            return response()->json([
                'success' => false,
                'error' => 'This appointment can no longer be cancelled because it is already being processed.',
            ], 422);
        }

        $validated = $request->validate([
            'cancellation_reason' => 'required|string|min:3|max:1000',
        ], [
            'cancellation_reason.required' => 'Please provide a reason for cancelling this appointment.',
            'cancellation_reason.min' => 'Cancellation reason must be at least 3 characters.',
        ]);

        $reason = trim($validated['cancellation_reason']);

        $appointment->update([
            'status' => 'cancelled',
            'cancellation_reason' => $reason,
        ]);

        BookingAnimalStatusService::syncAnimalsToBookingStatus($appointment, 'cancelled', $reason);

        AppointmentStatusLogService::record(
            $appointment->fresh(),
            'cancelled',
            null,
            $user->id
        );

        AppointmentBroadcastService::notify($appointment->fresh(), 'cancelled');

        return response()->json([
            'success' => true,
            'message' => 'Appointment cancelled successfully',
        ]);
    }

    /**
     * Update booked services for a pending appointment (client).
     */
    // Diri usbon ang mga serbisyo sa appointment.
    public function updateServices(Request $request, $id)
    {
        $user = $request->user();

        $appointment = Appointment::where('id', $id)
            ->where('user_id', $user->id)
            ->first();

        if (!$appointment) {
            return response()->json([
                'success' => false,
                'error' => 'Appointment not found',
            ], 404);
        }

        if ($appointment->status !== 'pending') {
            return response()->json([
                'success' => false,
                'error' => 'Services can only be edited while the appointment is pending approval.',
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'treatment_type_id' => 'required|exists:services,id',
            'treatment_type_ids' => 'required|array|min:1',
            'treatment_type_ids.*' => 'exists:services,id',
            'appointment_date' => 'required|date_format:Y-m-d',
            'appointment_time' => 'required|date_format:H:i',
            'symptoms' => 'nullable|array',
            'symptoms.*.name' => 'required_with:symptoms|string',
            'symptoms.*.days_count' => 'nullable|integer|min:1',
            'symptoms.*.notes' => 'nullable|string',
            'is_bitten' => 'nullable|boolean',
            'bite_details' => 'nullable|string',
            'meeting_place_photo_url' => 'nullable|url|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'error' => 'Validation failed',
                'messages' => $validator->errors(),
            ], 422);
        }

        $treatmentTypeIds = array_values(array_unique(array_map('intval', $request->treatment_type_ids)));
        $primaryTreatmentTypeId = (int) $request->treatment_type_id;

        if (!in_array($primaryTreatmentTypeId, $treatmentTypeIds, true)) {
            $treatmentTypeIds[] = $primaryTreatmentTypeId;
        }

        $availabilityError = app(ServiceAvailabilityService::class)->assertServicesAvailable($treatmentTypeIds);
        if ($availabilityError) {
            return response()->json([
                'success' => false,
                'error' => $availabilityError,
            ], 422);
        }

        $durationMinutes = ServiceDurationHelper::totalMinutesForServiceIds($treatmentTypeIds);
        $normalizedTime = BookingTimeHelper::normalizeToHi($request->appointment_time);
        $bookingDate = $request->appointment_date;

        $blockedRanges = \App\Models\VetUnavailability::getBlockedRangesForDate($bookingDate);

        $today = now()->format('Y-m-d');
        $currentTime = now()->format('H:i');

        if (!$normalizedTime || !BookingTimeHelper::isRangeAvailable(
            $normalizedTime,
            $durationMinutes,
            $blockedRanges,
            $bookingDate,
            $currentTime
        )) {
            return response()->json([
                'success' => false,
                'error' => 'This time slot is not available for the selected services. Please choose another date or time.',
            ], 422);
        }

        try {
            DB::beginTransaction();

            $updatePayload = [
                'service_type_id' => $primaryTreatmentTypeId,
                'booking_date' => $bookingDate,
                'booking_time' => $normalizedTime,
                'duration_minutes' => $durationMinutes,
                'is_bitten' => $request->boolean('is_bitten'),
                'bite_details' => $request->boolean('is_bitten') ? $request->bite_details : null,
            ];

            if (BookingSlotService::isClinicBooking($appointment->booking_type)) {
                $slotError = BookingSlotService::availabilityError(
                    $bookingDate,
                    $normalizedTime,
                    (int) $appointment->id,
                    true
                );
                if ($slotError) {
                    DB::rollBack();
                    return response()->json([
                        'success' => false,
                        'error' => $slotError,
                    ], 422);
                }
            }

            if ($appointment->isHomeService() && $request->exists('meeting_place_photo_url')) {
                $updatePayload['meeting_place_photo_url'] = $request->input('meeting_place_photo_url') ?: null;
            }

            $appointment->update($updatePayload);

            $appointment->treatmentTypes()->sync($treatmentTypeIds);

            DB::table('booking_symptoms')->where('booking_id', $appointment->id)->delete();

            if ($request->has('symptoms') && is_array($request->symptoms)) {
                foreach ($request->symptoms as $symptomData) {
                    $symptomName = $symptomData['name'] ?? null;
                    if (!$symptomName) {
                        continue;
                    }

                    $symptom = Symptom::firstOrCreate(
                        ['name' => $symptomName],
                        ['name' => $symptomName]
                    );

                    if ($symptom && $symptom->id) {
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
            }

            DB::commit();

            $appointment = $appointment->fresh(['animal', 'treatmentType', 'treatmentTypes', 'symptoms', 'statusLogs']);

            AppointmentBroadcastService::notify($appointment, 'updated');

            return response()->json([
                'success' => true,
                'message' => 'Appointment updated successfully',
                'appointment' => [
                    'id' => $appointment->id,
                    'petName' => $appointment->animal?->pet_name ?? 'Unknown',
                    'service' => $appointment->treatmentTypes?->first()?->type_name ?? $appointment->treatmentType?->type_name,
                    'services' => $appointment->treatmentTypes?->pluck('type_name')->filter()->values() ?? [],
                    'date' => $appointment->booking_date->format('Y-m-d'),
                    'date_formatted' => $appointment->booking_date->format('M d, Y'),
                    'time' => date('h:i A', strtotime($appointment->booking_time)),
                    'status' => $appointment->status,
                    'notes' => $appointment->notes,
                    'symptoms' => $appointment->symptoms?->map(function ($symptom) {
                        return [
                            'name' => $symptom->name,
                            'days_count' => $symptom->pivot->days_count,
                            'notes' => $symptom->pivot->notes,
                        ];
                    }) ?? [],
                    'isBitten' => $appointment->is_bitten ?? false,
                    'biteDetails' => $appointment->bite_details,
                    'isDoorToDoor' => $appointment->isHomeService(),
                    'meetingLatitude' => $appointment->meeting_latitude,
                    'meetingLongitude' => $appointment->meeting_longitude,
                    'meetingPlaceLabel' => $appointment->isHomeService() ? 'MEETING PLACE' : null,
                    'meetingPlacePhotoUrl' => $appointment->meeting_place_photo_url,
                    'status_history' => AppointmentStatusLogService::formatHistoryForApi($appointment, 'client'),
                ],
            ]);
        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json([
                'success' => false,
                'error' => 'Failed to update appointment services',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Update an appointment
     */
    // Diri usbon ang detalye sa appointment.
    public function update(Request $request, $id)
    {
        $user = $request->user();
        
        $appointment = Appointment::where('id', $id)
            ->where('user_id', $user->id)
            ->first();

        if (!$appointment) {
            return response()->json([
                'success' => false,
                'error' => 'Appointment not found'
            ], 404);
        }

        // Update appointment status
        if ($request->has('status')) {
            $validStatuses = ['pending', 'approved', 'processing', 'ongoing', 'completed', 'cancelled'];
            
            if (in_array($request->status, $validStatuses)) {
                $appointment->update(['status' => $request->status]);
                AppointmentStatusLogService::recordForAuthenticatedUser($appointment->fresh(), $request->status);
            } else {
                return response()->json([
                    'success' => false,
                    'error' => 'Invalid status'
                ], 400);
            }
        }
        
        return response()->json([
            'success' => true,
            'message' => 'Appointment updated successfully',
        ]);
    }

    /**
     * Update appointment status (Admin only)
     */
    // Diri usbon ang status sa appointment.
    public function updateStatus(Request $request, $id)
    {
        \Log::info('updateStatus called: id=' . $id . ', request_data=' . json_encode($request->all()));
        
        try {
            $appointment = Appointment::with(['animal'])->find($id);

            if (!$appointment) {
                \Log::error('Appointment not found: id=' . $id);
                return response()->json([
                    'success' => false,
                    'error' => 'Appointment not found'
                ], 404);
            }

            $validStatuses = ['pending', 'approved', 'rejected', 'completed', 'cancelled', 'processing', 'ongoing'];
            
            $status = $request->input('status');
            \Log::info('Checking status: status=' . $status . ', valid_statuses=' . json_encode($validStatuses));
            
            if ($status && in_array($status, $validStatuses)) {
                if ($status === 'cancelled' && $appointment->status === 'approved') {
                    if (!BookingTimeHelper::isBookingScheduleDay($appointment->booking_date)) {
                        return response()->json([
                            'success' => false,
                            'error' => 'Cancel (Late) is only available on the scheduled appointment date.',
                        ], 422);
                    }
                }

                if ($status === 'approved') {
                    $unapproved = BookingAnimalStatusService::unapprovedAnimals($appointment);
                    if ($unapproved->isNotEmpty()) {
                        \Log::warning('Approval blocked because a pet is not registered or exempt', [
                            'appointment_id' => $appointment->id,
                            'animal_ids' => $unapproved->pluck('id')->all(),
                        ]);

                        return response()->json([
                            'success' => false,
                            'error' => 'Cannot approve appointment. Each remaining animal must be registered or exempt first.'
                        ], 422);
                    }

                    if ($appointment->isHomeService()) {
                        $fieldmanIds = collect($request->input('assigned_fieldman_ids', []))
                            ->when(
                                $request->filled('assigned_fieldman_id'),
                                fn ($ids) => $ids->push($request->input('assigned_fieldman_id'))
                            )
                            ->map(fn ($id) => (int) $id)
                            ->filter(fn ($id) => $id > 0)
                            ->unique()
                            ->values();

                        if ($fieldmanIds->isEmpty()) {
                            return response()->json([
                                'success' => false,
                                'error' => 'Please assign at least one fieldman before approving this Home Service booking.',
                            ], 422);
                        }

                        $validFieldmenCount = \App\Models\User::query()
                            ->whereIn('id', $fieldmanIds)
                            ->where('role', 'fieldman')
                            ->count();

                        if ($validFieldmenCount !== $fieldmanIds->count()) {
                            return response()->json([
                                'success' => false,
                                'error' => 'One or more selected fieldmen are invalid.',
                            ], 422);
                        }
                    }
                }

                $clinicalFieldmanIds = [];
                $isClinicDoctor = false;
                if ($status === 'processing' && $appointment->booking_type === 'appointment') {
                    if (!BookingTimeHelper::isBookingScheduleDay($appointment->booking_date)) {
                        return response()->json([
                            'success' => false,
                            'error' => 'Clinic appointments can be marked as processing on the scheduled date.',
                        ], 422);
                    }

                    $administeredByInput = trim((string) $request->input('administered_by', ''));
                    $administeredByName = trim((string) (preg_replace('/\s*\([^)]+\)\s*$/', '', $administeredByInput) ?? $administeredByInput));
                    $isClinicDoctor = strcasecmp($administeredByName, TreatmentStaff::DEFAULT_ADMINISTERED_BY) === 0;

                    $clinicalFieldmanIds = \App\Services\WalkInFieldmanAssignmentService::resolveFieldmanIds(
                        $administeredByInput !== '' ? $administeredByInput : null,
                        $request->filled('assigned_fieldman_id')
                            ? (int) $request->input('assigned_fieldman_id')
                            : null
                    );

                    if ($clinicalFieldmanIds === [] && !$isClinicDoctor) {
                        return response()->json([
                            'success' => false,
                            'error' => 'Please select who will administer this appointment.',
                        ], 422);
                    }
                }

                $affectedAnimalIds = [];
                $affectedAnimalNames = [];
                if (in_array($status, ['approved', 'cancelled'], true)) {
                    foreach ($appointment->resolvedAnimals() as $animal) {
                        $animalStatus = $animal->pivot?->status ?? 'pending';
                        $shouldInclude = $status === 'approved'
                            ? $animalStatus === 'pending'
                            : $animalStatus !== 'cancelled';

                        if ($shouldInclude) {
                            $affectedAnimalIds[] = (int) $animal->id;
                            $affectedAnimalNames[] = $animal->pet_name ?: 'Animal';
                        }
                    }
                }

                $appointment->update(['status' => $status]);

                if (in_array($status, ['approved', 'cancelled'], true)) {
                    BookingAnimalStatusService::syncAnimalsToBookingStatus(
                        $appointment,
                        $status,
                        $status === 'cancelled'
                            ? trim((string) $request->input('cancellation_reason', '')) ?: null
                            : null
                    );
                }

                if ($status === 'approved' && $appointment->isHomeService()) {
                    $fieldmanIds = collect($request->input('assigned_fieldman_ids', []))
                        ->when(
                            $request->filled('assigned_fieldman_id'),
                            fn ($ids) => $ids->push($request->input('assigned_fieldman_id'))
                        )
                        ->map(fn ($id) => (int) $id)
                        ->filter(fn ($id) => $id > 0)
                        ->unique()
                        ->values()
                        ->all();

                    $appointment->assignedFieldmen()->sync($fieldmanIds);
                    $appointment->load('assignedFieldmen');

                    $assignedNames = $appointment->assignedFieldmen
                        ->map(fn ($fieldman) => TreatmentStaff::displayName($fieldman))
                        ->filter()
                        ->unique()
                        ->values();

                    if ($assignedNames->isNotEmpty()) {
                        $administeredBy = $assignedNames->implode(', ');
                        foreach ($appointment->treatableAnimalIds() as $animalId) {
                            $appointment->setAnimalAdministeredBy($animalId, $administeredBy);
                        }
                        $appointment->update(['administered_by' => $administeredBy]);
                    }
                }

                if ($status === 'processing' && $appointment->booking_type === 'appointment' && $isClinicDoctor && $clinicalFieldmanIds === []) {
                    $appointment->assignedFieldmen()->sync([]);
                    foreach ($appointment->treatableAnimalIds() as $animalId) {
                        $appointment->setAnimalAdministeredBy($animalId, TreatmentStaff::DEFAULT_ADMINISTERED_BY);
                    }
                    $appointment->update(['administered_by' => TreatmentStaff::DEFAULT_ADMINISTERED_BY]);
                } elseif ($status === 'processing' && $appointment->booking_type === 'appointment' && $clinicalFieldmanIds !== []) {
                    $appointment->assignedFieldmen()->sync($clinicalFieldmanIds);
                    $appointment->load('assignedFieldmen');

                    $assignedNames = $appointment->assignedFieldmen
                        ->map(fn ($fieldman) => TreatmentStaff::displayName($fieldman))
                        ->filter()
                        ->unique()
                        ->values();

                    if ($assignedNames->isNotEmpty()) {
                        $administeredBy = $assignedNames->implode(', ');
                        foreach ($appointment->treatableAnimalIds() as $animalId) {
                            $appointment->setAnimalAdministeredBy($animalId, $administeredBy);
                        }
                        $appointment->update(['administered_by' => $administeredBy]);
                    }
                }

                $freshAppointment = $appointment->fresh();

                if ($affectedAnimalIds !== [] && in_array($status, ['approved', 'cancelled'], true)) {
                    AppointmentStatusLogService::recordAnimalAction(
                        $freshAppointment,
                        $status,
                        $affectedAnimalIds,
                        $affectedAnimalNames,
                        AppointmentStatusLogService::resolveAnimalServices($freshAppointment, $affectedAnimalIds),
                        $status === 'cancelled'
                            ? trim((string) $request->input('cancellation_reason', '')) ?: null
                            : null
                    );
                } else {
                    AppointmentStatusLogService::recordForDataManager($freshAppointment, $status);
                }
                
                \Log::info('Status updated successfully: appointment_id=' . $appointment->id . ', new_status=' . $status);

                if ($status === 'approved') {
                    AppointmentClientNotificationService::notifyApproved($freshAppointment);

                    if ($freshAppointment->isHomeService()) {
                        \App\Services\AppointmentFieldmanNotificationService::notifyHomeServiceAssigned($freshAppointment);
                    }
                }

                if ($status === 'processing' && $freshAppointment->booking_type === 'appointment') {
                    \App\Services\AppointmentFieldmanNotificationService::notifyClinicalAssigned($freshAppointment);
                }

                if ($status === 'cancelled') {
                    $cancellationReason = trim((string) $request->input('cancellation_reason', ''));

                    if ($cancellationReason !== '' && empty($freshAppointment->cancellation_reason)) {
                        $freshAppointment->update(['cancellation_reason' => $cancellationReason]);
                        $freshAppointment = $freshAppointment->fresh();
                    }

                    AppointmentClientNotificationService::notifyCancelled(
                        $freshAppointment,
                        $cancellationReason !== ''
                            ? $cancellationReason
                            : (string) ($freshAppointment->cancellation_reason ?? 'Cancelled by the clinic.')
                    );
                }

                AppointmentBroadcastService::notify($freshAppointment, 'updated');
                
                return response()->json([
                    'success' => true,
                    'message' => 'Appointment status updated successfully',
                    'appointment' => $appointment->load(['pet', 'user'])
                ]);
            } else {
                \Log::error('Invalid status', ['status' => $status, 'valid_statuses' => $validStatuses]);
                return response()->json([
                    'success' => false,
                    'error' => 'Invalid status. Valid statuses are: ' . implode(', ', $validStatuses)
                ], 400);
            }
        } catch (\Exception $e) {
            \Log::error('Update status error', [
                'id' => $id,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            
            // Return plain text error for debugging
            return response('Server error: ' . $e->getMessage(), 500);
        }
    }

    // Diri usbon ang status sa usa ka hayop sa booking.
    public function updateAnimalStatus(Request $request, $id, $animalId)
    {
        $appointment = Appointment::with(['animal'])->find($id);
        if (!$appointment) {
            return response()->json([
                'success' => false,
                'error' => 'Appointment not found',
            ], 404);
        }

        $status = $request->input('status');
        if ($status !== 'approved') {
            return response()->json([
                'success' => false,
                'error' => 'Only approved is allowed for this animal status update.',
            ], 400);
        }

        if (!in_array($appointment->status, ['pending', 'approved'], true)) {
            return response()->json([
                'success' => false,
                'error' => 'This appointment can no longer change animal approval.',
            ], 422);
        }

        $animal = $appointment->resolvedAnimals()->firstWhere('id', (int) $animalId);
        if (!$animal) {
            return response()->json([
                'success' => false,
                'error' => 'That animal is not booked on this appointment.',
            ], 404);
        }

        $currentAnimalStatus = $animal->pivot?->status ?? 'pending';
        if ($currentAnimalStatus === 'cancelled') {
            return response()->json([
                'success' => false,
                'error' => 'This animal has already been cancelled.',
            ], 422);
        }

        if ($currentAnimalStatus === 'approved') {
            return response()->json([
                'success' => true,
                'message' => 'Animal is already approved',
            ]);
        }

        if (!in_array($animal->registration_status, ['registered', 'exempt'], true)) {
            return response()->json([
                'success' => false,
                'error' => 'Cannot approve this animal. Pet must be registered or exempt first.',
            ], 422);
        }

        $previousBookingStatus = $appointment->status;
        BookingAnimalStatusService::setAnimalStatus($appointment, (int) $animalId, 'approved');
        $resultingStatus = BookingAnimalStatusService::applyDerivedBookingStatus($appointment);
        $petName = $animal->pet_name ?: 'this animal';
        $fresh = $appointment->fresh();

        AppointmentStatusLogService::recordAnimalAction(
            $fresh,
            'approved',
            [(int) $animalId],
            [$petName],
            AppointmentStatusLogService::resolveAnimalServices($fresh, [(int) $animalId])
        );

        if ($resultingStatus === 'approved' && $previousBookingStatus !== 'approved') {
            AppointmentClientNotificationService::notifyApproved($fresh);
        } else {
            AppointmentClientNotificationService::notifyAnimalChanged($fresh, $petName, 'approved');
        }

        AppointmentBroadcastService::notify($fresh, 'updated');

        return response()->json([
            'success' => true,
            'message' => $resultingStatus === 'approved' && $previousBookingStatus !== 'approved'
                ? 'Animal approved. The appointment is now approved.'
                : 'Animal approved.',
            'appointment' => [
                'id' => $fresh->id,
                'status' => $fresh->status,
            ],
        ]);
    }

    // Diri i-cancel ang usa ka hayop sa booking.
    public function cancelAnimal(Request $request, $id, $animalId)
    {
        $validated = $request->validate([
            'cancellation_reason' => 'required|string|min:3|max:1000',
        ], [
            'cancellation_reason.required' => 'A cancellation reason is required so the client can be notified.',
        ]);

        $appointment = Appointment::with(['animal'])->find($id);
        if (!$appointment) {
            return response()->json([
                'success' => false,
                'error' => 'Appointment not found',
            ], 404);
        }

        if (!in_array($appointment->status, ['pending', 'approved'], true)) {
            return response()->json([
                'success' => false,
                'error' => 'This appointment can no longer cancel individual animals.',
            ], 422);
        }

        $animal = $appointment->resolvedAnimals()->firstWhere('id', (int) $animalId);
        if (!$animal) {
            return response()->json([
                'success' => false,
                'error' => 'That animal is not booked on this appointment.',
            ], 404);
        }

        $currentAnimalStatus = $animal->pivot?->status ?? 'pending';
        if ($currentAnimalStatus === 'cancelled') {
            return response()->json([
                'success' => false,
                'error' => 'This animal is already cancelled.',
            ], 400);
        }

        if (
            $appointment->status === 'approved'
            && $currentAnimalStatus === 'approved'
            && !BookingTimeHelper::isBookingScheduleDay($appointment->booking_date)
        ) {
            return response()->json([
                'success' => false,
                'error' => 'Cancel (Late) is only available on the scheduled appointment date.',
            ], 422);
        }

        $reason = trim($validated['cancellation_reason']);
        $previousBookingStatus = $appointment->status;
        BookingAnimalStatusService::setAnimalStatus($appointment, (int) $animalId, 'cancelled', $reason);
        $resultingStatus = BookingAnimalStatusService::applyDerivedBookingStatus($appointment, $reason);
        $petName = $animal->pet_name ?: 'this animal';
        $fresh = $appointment->fresh();

        AppointmentStatusLogService::recordAnimalAction(
            $fresh,
            'cancelled',
            [(int) $animalId],
            [$petName],
            AppointmentStatusLogService::resolveAnimalServices($fresh, [(int) $animalId]),
            $reason
        );

        if ($resultingStatus === 'cancelled' && $previousBookingStatus !== 'cancelled') {
            AppointmentClientNotificationService::notifyCancelled($fresh, $reason);
        } else {
            AppointmentClientNotificationService::notifyAnimalChanged($fresh, $petName, 'cancelled', $reason);
        }

        AppointmentBroadcastService::notify(
            $fresh,
            $resultingStatus === 'cancelled' ? 'cancelled' : 'updated'
        );

        return response()->json([
            'success' => true,
            'message' => $resultingStatus === 'cancelled' && $previousBookingStatus !== 'cancelled'
                ? 'Animal cancelled. The appointment is now cancelled.'
                : 'Animal cancelled.',
            'appointment' => [
                'id' => $fresh->id,
                'status' => $fresh->status,
            ],
        ]);
    }

    // Diri usbon dungan ang status sa daghang hayop sa booking.
    public function bulkUpdateAnimals(Request $request, $id)
    {
        $validated = $request->validate([
            'animal_ids' => 'required|array|min:1',
            'animal_ids.*' => 'integer',
            'action' => 'required|in:approve,cancel',
            'cancellation_reason' => 'required_if:action,cancel|string|min:3|max:1000',
        ], [
            'cancellation_reason.required_if' => 'A cancellation reason is required so the client can be notified.',
        ]);

        $appointment = Appointment::with(['animal'])->find($id);
        if (!$appointment) {
            return response()->json([
                'success' => false,
                'error' => 'Appointment not found',
            ], 404);
        }

        if (!in_array($appointment->status, ['pending', 'approved'], true)) {
            return response()->json([
                'success' => false,
                'error' => 'This appointment can no longer change individual animals.',
            ], 422);
        }

        $animalIds = collect($validated['animal_ids'])
            ->map(fn ($animalId) => (int) $animalId)
            ->unique()
            ->values();

        $bookedIds = collect($appointment->bookedAnimalEntries())->pluck('animal_id')->map(fn ($id) => (int) $id);
        $invalidIds = $animalIds->diff($bookedIds);
        if ($invalidIds->isNotEmpty()) {
            return response()->json([
                'success' => false,
                'error' => 'One or more selected animals are not booked on this appointment.',
            ], 422);
        }

        $action = $validated['action'];
        $previousBookingStatus = $appointment->status;
        $changedIds = [];
        $changedNames = [];

        foreach ($animalIds as $animalId) {
            $animal = $appointment->resolvedAnimals()->firstWhere('id', $animalId);
            if (!$animal) {
                continue;
            }

            $currentAnimalStatus = $animal->pivot?->status ?? 'pending';
            $petName = $animal->pet_name ?: 'this animal';

            if ($action === 'approve') {
                if ($currentAnimalStatus === 'cancelled') {
                    continue;
                }
                if ($currentAnimalStatus === 'approved') {
                    continue;
                }
                if (!in_array($animal->registration_status, ['registered', 'exempt'], true)) {
                    return response()->json([
                        'success' => false,
                        'error' => "Cannot approve {$petName}. Pet must be registered or exempt first.",
                    ], 422);
                }

                BookingAnimalStatusService::setAnimalStatus($appointment, $animalId, 'approved');
                $changedIds[] = (int) $animalId;
                $changedNames[] = $petName;
                continue;
            }

            if ($currentAnimalStatus === 'cancelled') {
                continue;
            }

            if (
                $appointment->status === 'approved'
                && $currentAnimalStatus === 'approved'
                && !BookingTimeHelper::isBookingScheduleDay($appointment->booking_date)
            ) {
                return response()->json([
                    'success' => false,
                    'error' => 'Cancel (Late) is only available on the scheduled appointment date.',
                ], 422);
            }

            $reason = trim($validated['cancellation_reason']);
            BookingAnimalStatusService::setAnimalStatus($appointment, $animalId, 'cancelled', $reason);
            $changedIds[] = (int) $animalId;
            $changedNames[] = $petName;
        }

        if ($changedNames === []) {
            $message = $action === 'approve'
                ? 'No pending animals were selected to approve.'
                : 'No animals were selected to cancel.';

            return response()->json([
                'success' => false,
                'error' => $message,
            ], 422);
        }

        $cancellationReason = $action === 'cancel' ? trim($validated['cancellation_reason']) : null;
        $resultingStatus = BookingAnimalStatusService::applyDerivedBookingStatus($appointment, $cancellationReason);
        $fresh = $appointment->fresh();
        $count = count($changedNames);
        $logAction = $action === 'approve' ? 'approved' : 'cancelled';
        $reason = $action === 'cancel' ? trim($validated['cancellation_reason']) : null;

        AppointmentStatusLogService::recordAnimalAction(
            $fresh,
            $logAction,
            $changedIds,
            $changedNames,
            AppointmentStatusLogService::resolveAnimalServices($fresh, $changedIds),
            $reason
        );

        if ($action === 'approve') {
            if ($resultingStatus === 'approved' && $previousBookingStatus !== 'approved') {
                AppointmentClientNotificationService::notifyApproved($fresh);
            } else {
                foreach ($changedNames as $petName) {
                    AppointmentClientNotificationService::notifyAnimalChanged($fresh, $petName, 'approved');
                }
            }
        } else {
            $reason = trim($validated['cancellation_reason']);

            if ($resultingStatus === 'cancelled' && $previousBookingStatus !== 'cancelled') {
                AppointmentClientNotificationService::notifyCancelled($fresh, $reason);
            } else {
                foreach ($changedNames as $petName) {
                    AppointmentClientNotificationService::notifyAnimalChanged($fresh, $petName, 'cancelled', $reason);
                }
            }
        }

        AppointmentBroadcastService::notify(
            $fresh,
            ($action === 'cancel' && $resultingStatus === 'cancelled') ? 'cancelled' : 'updated'
        );

        $actionLabel = $action === 'approve' ? 'approved' : 'cancelled';

        return response()->json([
            'success' => true,
            'message' => $count === 1
                ? ucfirst($actionLabel) . " {$changedNames[0]}."
                : ucfirst($actionLabel) . " {$count} animals.",
            'appointment' => [
                'id' => $fresh->id,
                'status' => $fresh->status,
            ],
            'changed_count' => $count,
        ]);
    }

    /**
     * Get processing appointments for budget officer treatments
     */
    // Diri kuhaon ang mga appointment nga gi-process pa.
    public function getProcessingAppointments()
    {
        $appointments = Appointment::where('status', 'ongoing')
            ->with([
                'animal.species',
                'animal.breed',
                'user',
                'treatmentType',
                'treatmentTypes',
                'bookingServices.service',
                'bookingMedicines.inventory.medicine',
            ])
            ->orderBy('booking_date', 'asc')
            ->orderBy('booking_time', 'asc')
            ->get([
                'id',
                'animal_id',
                'booked_animals',
                'service_type_id',
                'booking_date',
                'booking_time',
                'duration_minutes',
                'status',
                'notes',
                'administered_by',
                'is_bitten',
                'bite_details',
                'user_id',
                'created_at',
            ]);

        Appointment::hydrateBookedAnimals($appointments);

        $appointmentsWithSymptoms = $appointments->map(
            fn ($appointment) => BudgetOngoingTreatmentFormatter::format($appointment)
        );

        return response()->json([
            'success' => true,
            'appointments' => $appointmentsWithSymptoms,
        ]);
    }

    /**
     * Admin selects inventory during processing and hands off to the budget officer.
     */
    // Diri ipasa sa budget officer ang appointment.
    public function handoffToBudget(Request $request, $id)
    {
        try {
            DB::beginTransaction();

            $appointment = Appointment::with('animal')->find($id);
            if (!$appointment) {
                return response()->json([
                    'success' => false,
                    'error' => 'Appointment not found',
                ], 404);
            }

            if ($appointment->status !== 'processing') {
                if ($appointment->booking_type === 'walk_in' && $appointment->status === 'pending') {
                    $appointment->update(['status' => 'processing']);
                    AppointmentStatusLogService::recordForDataManager(
                        $appointment->fresh(),
                        'processing'
                    );
                } else {
                    return response()->json([
                        'success' => false,
                        'error' => 'Only processing appointments can be marked as ongoing.',
                    ], 422);
                }
            }

            $treatments = $this->resolveTreatmentsFromRequest($request, $appointment);
            if ($missing = $this->jsonIfAnimalsMissingMedicine($appointment, $treatments)) {
                DB::rollBack();
                return $missing;
            }
            $this->applyAnimalTreatments($appointment, $treatments);

            $appointment->update([
                'status' => 'ongoing',
                'administered_by' => $this->summarizeAdministeredBy($treatments, $appointment),
            ]);

            AppointmentStatusLogService::recordForDataManager(
                $appointment->fresh(),
                'ongoing'
            );

            DB::commit();

            $freshAppointment = $appointment->fresh(['assignedFieldmen', 'user', 'animal', 'treatmentTypes']);

            if ($freshAppointment->booking_type === 'walk_in') {
                \App\Services\WalkInFieldmanAssignmentService::syncForWalkIn(
                    $freshAppointment,
                    $freshAppointment->administered_by,
                    $request->filled('assigned_fieldman_id')
                        ? (int) $request->input('assigned_fieldman_id')
                        : null
                );

                $freshAppointment = $freshAppointment->fresh([
                    'assignedFieldmen',
                    'user',
                    'animal',
                    'treatmentTypes',
                ]);

                \App\Services\AppointmentFieldmanNotificationService::notifyWalkInAssigned($freshAppointment);
            }

            AppointmentBroadcastService::notify($freshAppointment, 'updated');

            return response()->json([
                'success' => true,
                'message' => 'Appointment marked as ongoing.',
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            DB::rollBack();
            throw $e;
        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Fieldman selects inventory after creating a walk-in and marks it ongoing.
     */
    // Diri himuong ongoing ang walk-in nga appointment.
    public function markWalkInOngoing(Request $request, $id)
    {
        $user = $request->user();
        if (!$user || $user->role !== 'fieldman') {
            return response()->json([
                'success' => false,
                'error' => 'Unauthorized',
            ], 403);
        }

        try {
            DB::beginTransaction();

            $appointment = Appointment::with('animal')->find($id);
            if (!$appointment) {
                return response()->json([
                    'success' => false,
                    'error' => 'Appointment not found',
                ], 404);
            }

            if ($appointment->booking_type !== 'walk_in') {
                return response()->json([
                    'success' => false,
                    'error' => 'Only walk-in appointments can be marked ongoing from the fieldman app.',
                ], 422);
            }

            if (!in_array($appointment->status, ['processing', 'pending'], true)) {
                return response()->json([
                    'success' => false,
                    'error' => 'Only processing walk-ins can be marked as ongoing.',
                ], 422);
            }

            if ($appointment->status === 'pending') {
                $appointment->update(['status' => 'processing']);
                AppointmentStatusLogService::recordForAuthenticatedUser(
                    $appointment->fresh(),
                    'processing'
                );
            }

            $treatments = $this->resolveTreatmentsFromRequest($request, $appointment);
            if ($missing = $this->jsonIfAnimalsMissingMedicine($appointment, $treatments)) {
                DB::rollBack();
                return $missing;
            }
            $this->applyAnimalTreatments($appointment, $treatments);

            $appointment->update([
                'status' => 'ongoing',
                'administered_by' => $this->summarizeAdministeredBy($treatments, $appointment),
            ]);

            AppointmentStatusLogService::recordForAuthenticatedUser(
                $appointment->fresh(),
                'ongoing'
            );

            DB::commit();

            AppointmentBroadcastService::notify($appointment->fresh(), 'updated');

            $formatted = \App\Support\AdminAppointmentFormatter::format($appointment->fresh());
            $formatted['booking_type'] = 'walk_in';
            $formatted['booking_type_label'] = 'Walk-in';
            $formatted['display_status'] = 'ongoing';

            return response()->json([
                'success' => true,
                'message' => 'Walk-in marked as ongoing.',
                'appointment' => $formatted,
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            DB::rollBack();
            throw $e;
        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Fieldman accepts an approved appointment and marks it processing.
     */
    // Diri himuong processing sa fieldman ang appointment.
    public function markFieldmanAppointmentProcessing(Request $request, $id)
    {
        $user = $request->user();
        if (!$user || $user->role !== 'fieldman') {
            return response()->json([
                'success' => false,
                'error' => 'Unauthorized',
            ], 403);
        }

        $appointment = Appointment::find($id);
        if (!$appointment) {
            return response()->json([
                'success' => false,
                'error' => 'Appointment not found',
            ], 404);
        }

        if (!in_array($appointment->booking_type, ['appointment', 'home_service'], true)) {
            return response()->json([
                'success' => false,
                'error' => 'Only scheduled appointments can be marked as processing.',
            ], 422);
        }

        if ($denied = $this->denyIfNotAssignedFieldman($appointment, $user)) {
            return $denied;
        }

        if ($appointment->status === 'processing') {
            $formatted = \App\Support\AdminAppointmentFormatter::format($appointment->fresh());
            $formatted['booking_type'] = $appointment->booking_type;
            $formatted['booking_type_label'] = BookingTypeLabel::label($appointment->booking_type);
            $formatted['display_status'] = 'processing';

            return response()->json([
                'success' => true,
                'message' => 'Appointment is already processing.',
                'appointment' => $formatted,
            ]);
        }

        if ($appointment->status !== 'approved') {
            return response()->json([
                'success' => false,
                'error' => 'Only approved appointments can be marked as processing.',
            ], 422);
        }

        $appointment->update(['status' => 'processing']);

        AppointmentStatusLogService::recordForAuthenticatedUser(
            $appointment->fresh(),
            'processing'
        );

        AppointmentBroadcastService::notify($appointment->fresh(), 'updated');

        $formatted = \App\Support\AdminAppointmentFormatter::format($appointment->fresh());
        $formatted['booking_type'] = $appointment->booking_type;
        $formatted['booking_type_label'] = BookingTypeLabel::label($appointment->booking_type);
        $formatted['display_status'] = 'processing';

        return response()->json([
            'success' => true,
            'message' => 'Appointment marked as processing.',
            'appointment' => $formatted,
        ]);
    }

    /**
     * Fieldman records inventory for a processing appointment and marks it ongoing.
     */
    // Diri himuong ongoing sa fieldman ang appointment.
    public function markFieldmanAppointmentOngoing(Request $request, $id)
    {
        $user = $request->user();
        if (!$user || $user->role !== 'fieldman') {
            return response()->json([
                'success' => false,
                'error' => 'Unauthorized',
            ], 403);
        }

        try {
            DB::beginTransaction();

            $appointment = Appointment::with('animal')->find($id);
            if (!$appointment) {
                return response()->json([
                    'success' => false,
                    'error' => 'Appointment not found',
                ], 404);
            }

            if (!in_array($appointment->booking_type, ['appointment', 'home_service'], true)) {
                return response()->json([
                    'success' => false,
                    'error' => 'Only scheduled appointments can be continued from the fieldman app.',
                ], 422);
            }

            if ($appointment->status !== 'processing') {
                return response()->json([
                    'success' => false,
                    'error' => 'Only processing appointments can be marked as ongoing.',
                ], 422);
            }

            if ($denied = $this->denyIfNotAssignedFieldman($appointment, $user)) {
                return $denied;
            }

            $treatments = $this->resolveTreatmentsFromRequest($request, $appointment);
            if ($missing = $this->jsonIfAnimalsMissingMedicine($appointment, $treatments)) {
                DB::rollBack();
                return $missing;
            }
            $this->applyAnimalTreatments($appointment, $treatments);

            $appointment->update([
                'status' => 'ongoing',
                'administered_by' => $this->summarizeAdministeredBy($treatments, $appointment),
            ]);

            AppointmentStatusLogService::recordForAuthenticatedUser(
                $appointment->fresh(),
                'ongoing'
            );

            DB::commit();

            AppointmentBroadcastService::notify($appointment->fresh(), 'updated');

            $formatted = \App\Support\AdminAppointmentFormatter::format($appointment->fresh());
            $formatted['booking_type'] = $appointment->booking_type;
            $formatted['booking_type_label'] = BookingTypeLabel::label($appointment->booking_type);
            $formatted['display_status'] = 'ongoing';

            return response()->json([
                'success' => true,
                'message' => 'Appointment marked as ongoing.',
                'appointment' => $formatted,
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            DB::rollBack();
            throw $e;
        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Fieldman cancels an approved appointment before starting the visit.
     */
    // Diri i-cancel sa fieldman ang appointment.
    public function cancelByFieldman(Request $request, $id)
    {
        $user = $request->user();
        if (!$user || $user->role !== 'fieldman') {
            return response()->json([
                'success' => false,
                'error' => 'Unauthorized',
            ], 403);
        }

        $validated = $request->validate([
            'cancellation_reason' => 'required|string|min:3|max:1000',
        ], [
            'cancellation_reason.required' => 'Please provide a reason for cancelling this appointment.',
            'cancellation_reason.min' => 'Cancellation reason must be at least 3 characters.',
        ]);

        $appointment = Appointment::find($id);
        if (!$appointment) {
            return response()->json([
                'success' => false,
                'error' => 'Appointment not found',
            ], 404);
        }

        if (!in_array($appointment->booking_type, ['appointment', 'home_service'], true)) {
            return response()->json([
                'success' => false,
                'error' => 'Only scheduled appointments can be cancelled here.',
            ], 422);
        }

        if ($appointment->status !== 'approved') {
            return response()->json([
                'success' => false,
                'error' => 'Only approved appointments can be cancelled by the fieldman.',
            ], 422);
        }

        if ($denied = $this->denyIfNotAssignedFieldman($appointment, $user)) {
            return $denied;
        }

        $reason = trim($validated['cancellation_reason']);

        $appointment->update([
            'status' => 'cancelled',
            'cancellation_reason' => $reason,
        ]);

        BookingAnimalStatusService::syncAnimalsToBookingStatus($appointment, 'cancelled', $reason);

        AppointmentStatusLogService::recordForAuthenticatedUser(
            $appointment->fresh(),
            'cancelled',
            null,
            $reason
        );

        AppointmentClientNotificationService::notifyCancelled($appointment->fresh(), $reason);

        AppointmentBroadcastService::notify($appointment->fresh(), 'cancelled');

        return response()->json([
            'success' => true,
            'message' => 'Appointment cancelled successfully.',
        ]);
    }

    /**
     * Complete treatment and deduct selected inventory items.
     */
    // Diri i-complete sa admin ang treatment.
    public function completeTreatment(Request $request, $id)
    {
        return $this->completeOngoingAppointment($request, $id, 'budget_officer');
    }

    // Diri i-complete sa fieldman ang appointment.
    public function completeFieldmanAppointment(Request $request, $id)
    {
        $user = $request->user();
        if (!$user || $user->role !== 'fieldman') {
            return response()->json([
                'success' => false,
                'error' => 'Unauthorized',
            ], 403);
        }

        $appointment = Appointment::find($id);
        if (!$appointment) {
            return response()->json([
                'success' => false,
                'error' => 'Appointment not found',
            ], 404);
        }

        if (!in_array($appointment->booking_type, ['appointment', 'home_service'], true)) {
            return response()->json([
                'success' => false,
                'error' => 'Only scheduled appointments can be completed from the fieldman app.',
            ], 422);
        }

        if ($denied = $this->denyIfNotAssignedFieldman($appointment, $user)) {
            return $denied;
        }

        return $this->completeOngoingAppointment($request, $id, 'fieldman');
    }

    // Diri tapuson ang ongoing nga appointment ug ang tambal.
    private function completeOngoingAppointment(Request $request, $id, string $actorType)
    {
        $validated = $request->validate([
            'pet_weight' => 'nullable|numeric|min:0',
            'administered_by' => 'nullable|string|min:2|max:255',
            'selected_items' => 'nullable|array',
            'selected_items.*.inventory_id' => 'required|exists:inventory,id',
            'selected_items.*.quantity' => 'required|numeric|min:0.01',
        ]);

        $appointment = Appointment::with(['animal', 'bookingMedicines'])->find($id);
        if (!$appointment) {
            return response()->json([
                'success' => false,
                'error' => 'Appointment not found',
            ], 404);
        }

        if ($appointment->status === 'completed') {
            return response()->json([
                'success' => true,
                'message' => 'Visit is already completed.',
            ]);
        }

        if ($appointment->status !== 'ongoing') {
            return response()->json([
                'success' => false,
                'error' => 'Only ongoing appointments can be completed with inventory.',
            ], 422);
        }

        try {
            DB::beginTransaction();

            $appointment->refresh();
            $appointment->load(['animal', 'bookingMedicines']);

            if (isset($validated['pet_weight']) && $appointment->animal) {
                $appointment->animal->update(['weight' => $validated['pet_weight']]);
            }

            $selectedItems = $validated['selected_items'] ?? [];
            $usingPlannedItems = empty($selectedItems) && $appointment->bookingMedicines->isNotEmpty();

            if ($usingPlannedItems) {
                $selectedItems = $appointment->bookingMedicines->map(function ($bookingMedicine) {
                    return [
                        'medicine_id' => $bookingMedicine->medicine_id,
                        'quantity' => (float) $bookingMedicine->quantity_used,
                        'animal_id' => $bookingMedicine->animal_id,
                    ];
                })->toArray();
            }

            if (!empty($selectedItems) && !$usingPlannedItems) {
                $appointment->bookingMedicines()->delete();
            }

            $petWeight = isset($validated['pet_weight'])
                ? (float) $validated['pet_weight']
                : (float) ($appointment->animal?->weight ?? 0);
            if ($petWeight <= 0) {
                $petWeight = null;
            }

            foreach ($selectedItems as $selectedItem) {
                $medicineId = $selectedItem['medicine_id'] ?? null;
                $animalId = isset($selectedItem['animal_id']) ? (int) $selectedItem['animal_id'] : null;

                if (!$medicineId) {
                    $reference = Inventory::find($selectedItem['inventory_id'] ?? null);
                    if (!$reference) {
                        throw new \Exception('Inventory item not found.');
                    }
                    $medicineId = $reference->medicine_id;
                }

                $result = InventoryDeductionService::deductFifo(
                    $medicineId,
                    (float) $selectedItem['quantity'],
                    $usingPlannedItems ? null : $petWeight,
                    $appointment->id,
                    \App\Models\InventoryLog::REASON_USED,
                    $animalId ?: null
                );

                if ($usingPlannedItems) {
                    $query = $appointment->bookingMedicines()->where('medicine_id', $medicineId);
                    if ($animalId) {
                        $query->where('animal_id', $animalId);
                    }
                    $query->update(['inventory_id' => $result['primary_inventory_id']]);
                } else {
                    BookingMedicine::create([
                        'booking_id' => $appointment->id,
                        'animal_id' => $animalId ?: $appointment->animal_id,
                        'inventory_id' => $result['primary_inventory_id'],
                        'medicine_id' => $medicineId,
                        'quantity_used' => $result['quantity_used'],
                        'unit_name' => $result['unit_name'],
                        'dosage_ml' => $result['dosage_ml'],
                    ]);
                }
            }

            $appointment->updateQuietly([
                'status' => 'completed',
                'administered_by' => $validated['administered_by'] ?? $appointment->administered_by,
            ]);

            if ($actorType === 'fieldman') {
                AppointmentStatusLogService::recordForAuthenticatedUser(
                    $appointment->fresh(),
                    'completed'
                );
            } else {
                AppointmentStatusLogService::recordForBudgetOfficer(
                    $appointment->fresh(),
                    'completed'
                );
            }

            DB::commit();

            AppointmentBroadcastService::notify($appointment->fresh(), 'updated');

            $response = [
                'success' => true,
                'message' => empty($selectedItems)
                    ? 'Treatment completed.'
                    : 'Treatment completed and inventory deducted successfully.',
            ];

            if ($actorType === 'fieldman') {
                $formatted = \App\Support\AdminAppointmentFormatter::format($appointment->fresh());
                $formatted['booking_type'] = $appointment->booking_type;
                $formatted['booking_type_label'] = BookingTypeLabel::label($appointment->booking_type);
                $formatted['display_status'] = 'completed';
                $response['appointment'] = $formatted;
            }

            return response()->json($response);
        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * Save planned medicines for a booking (deduction happens at completion via FIFO).
     */
    // Diri balibaran kung dili assigned nga fieldman.
    private function denyIfNotAssignedFieldman(Appointment $appointment, $user)
    {
        if ($appointment->isHomeService() && !$appointment->isAssignedToFieldman($user->id)) {
            return response()->json([
                'success' => false,
                'error' => 'This Home Service visit is assigned to another fieldman.',
            ], 403);
        }

        if ($appointment->booking_type === 'appointment' && !$appointment->isAssignedToFieldman($user->id)) {
            return response()->json([
                'success' => false,
                'error' => 'This clinic appointment is assigned to another fieldman.',
            ], 403);
        }

        return null;
    }

    /**
     * @return list<array{animal_id: int, pet_weight: float|null, administered_by: string, selected_items: array}>
     */
    // Diri kuhaon ang mga treatment gikan sa request.
    private function resolveTreatmentsFromRequest(Request $request, Appointment $appointment): array
    {
        $treatableIds = $appointment->treatableAnimalIds();

        if ($request->has('treatments')) {
            $validated = $request->validate([
                'treatments' => 'required|array|min:1',
                'treatments.*.animal_id' => 'required|integer|exists:animals,id',
                'treatments.*.pet_weight' => 'nullable|numeric|min:0',
                'treatments.*.administered_by' => 'required|string|min:2|max:255',
                'treatments.*.selected_items' => 'present|array',
                'treatments.*.selected_items.*.inventory_id' => 'required|exists:inventory,id',
                'treatments.*.selected_items.*.quantity' => 'required|numeric|min:0.01',
                'treatments.*.outside_items' => 'nullable|array',
                'treatments.*.outside_items.*.name' => 'required|string|max:255',
                'treatments.*.outside_items.*.quantity' => 'required|numeric|min:0.01',
                'treatments.*.outside_items.*.status' => 'nullable|string|max:100',
            ]);

            $treatments = array_map(function ($treatment) {
                return [
                    'animal_id' => (int) $treatment['animal_id'],
                    'pet_weight' => isset($treatment['pet_weight']) ? (float) $treatment['pet_weight'] : null,
                    'administered_by' => trim((string) $treatment['administered_by']),
                    'selected_items' => $treatment['selected_items'],
                    'outside_items' => $this->normalizeOutsideItems($treatment['outside_items'] ?? []),
                ];
            }, $validated['treatments']);

            $requestedIds = collect($treatments)->pluck('animal_id')->map(fn ($id) => (int) $id)->all();
            if (count($requestedIds) !== count(array_unique($requestedIds))) {
                throw new \Exception('Each animal can only have one treatment payload.');
            }

            foreach ($requestedIds as $animalId) {
                if ($treatableIds !== [] && !in_array($animalId, $treatableIds, true)) {
                    throw new \Exception('One or more selected animals are not part of this booking.');
                }
            }

            return $treatments;
        }

        $validated = $request->validate([
            'pet_weight' => 'nullable|numeric|min:0',
            'administered_by' => 'required|string|min:2|max:255',
            'selected_items' => 'present|array',
            'selected_items.*.inventory_id' => 'required|exists:inventory,id',
            'selected_items.*.quantity' => 'required|numeric|min:0.01',
            'outside_items' => 'nullable|array',
            'outside_items.*.name' => 'required|string|max:255',
            'outside_items.*.quantity' => 'required|numeric|min:0.01',
            'outside_items.*.status' => 'nullable|string|max:100',
            'animal_id' => 'nullable|integer|exists:animals,id',
        ]);

        $animalId = (int) ($validated['animal_id'] ?? ($treatableIds[0] ?? $appointment->animal_id));
        if ($animalId <= 0) {
            throw new \Exception('An animal is required to record treatment.');
        }
        if ($treatableIds !== [] && !in_array($animalId, $treatableIds, true)) {
            throw new \Exception('This animal is not part of the booking.');
        }

        return [[
            'animal_id' => $animalId,
            'pet_weight' => isset($validated['pet_weight']) ? (float) $validated['pet_weight'] : null,
            'administered_by' => trim((string) $validated['administered_by']),
            'selected_items' => $validated['selected_items'],
            'outside_items' => $this->normalizeOutsideItems($validated['outside_items'] ?? []),
        ]];
    }

    // Diri limpyohon ang mga tambal nga paliton sa gawas.
    private function normalizeOutsideItems(array $items): array
    {
        return collect($items)
            ->map(function ($item) {
                return [
                    'name' => trim((string) ($item['name'] ?? '')),
                    'quantity' => (float) ($item['quantity'] ?? 0),
                    'status' => OutsidePurchaseItem::displayStatus($item['status'] ?? null),
                ];
            })
            ->filter(fn ($item) => $item['name'] !== '' && $item['quantity'] > 0)
            ->values()
            ->all();
    }

    /**
     * @param  list<array{animal_id: int, pet_weight: float|null, administered_by: string, selected_items: array}>  $treatments
     */
    // Diri mo-error kung naay hayop nga walay tambal.
    private function jsonIfAnimalsMissingMedicine(Appointment $appointment, array $treatments): ?\Illuminate\Http\JsonResponse
    {
        $missing = $this->animalsMissingMedicine($appointment, $treatments);
        if ($missing === []) {
            return null;
        }

        $names = collect($missing)->pluck('name')->filter()->values();
        $error = $names->count() === 1
            ? "Select at least one medicine for {$names->first()} before marking as ongoing."
            : 'Select at least one medicine for every booked animal before marking as ongoing.';

        return response()->json([
            'success' => false,
            'error' => $error,
            'missing_pets' => $missing,
        ], 422);
    }

    /**
     * @param  list<array{animal_id?: int, selected_items?: array}>  $treatments
     * @return list<array{id: int, name: string}>
     */
    // Diri pangitaon ang mga hayop nga walay tambal.
    private function animalsMissingMedicine(Appointment $appointment, array $treatments): array
    {
        $treatableIds = $appointment->treatableAnimalIds();
        $itemsByAnimalId = [];
        $outsideByAnimalId = [];
        foreach ($treatments as $treatment) {
            $animalId = (int) ($treatment['animal_id'] ?? 0);
            $items = $treatment['selected_items'] ?? [];
            $outsideItems = $treatment['outside_items'] ?? [];
            $itemsByAnimalId[$animalId] = is_array($items) ? $items : [];
            $outsideByAnimalId[$animalId] = is_array($outsideItems) ? $outsideItems : [];
        }

        $missing = [];
        $resolvedIds = [];
        foreach ($appointment->resolvedAnimals() as $animal) {
            $animalId = (int) $animal->id;
            $resolvedIds[] = $animalId;
            if (!in_array($animalId, $treatableIds, true)) {
                continue;
            }
            $items = $itemsByAnimalId[$animalId] ?? [];
            $outsideItems = $outsideByAnimalId[$animalId] ?? [];
            if ($items === [] && $outsideItems === []) {
                $missing[] = [
                    'id' => $animalId,
                    'name' => $animal->pet_name ?: 'Unknown',
                ];
            }
        }

        foreach ($treatableIds as $animalId) {
            if (in_array($animalId, $resolvedIds, true)) {
                continue;
            }
            $items = $itemsByAnimalId[$animalId] ?? [];
            $outsideItems = $outsideByAnimalId[$animalId] ?? [];
            if ($items === [] && $outsideItems === []) {
                $missing[] = [
                    'id' => $animalId,
                    'name' => 'Unknown',
                ];
            }
        }

        return $missing;
    }

    /**
     * @param  list<array{animal_id: int, pet_weight: float|null, administered_by: string, selected_items: array}>  $treatments
     */
    // Diri i-save ang treatment sa matag hayop.
    private function applyAnimalTreatments(Appointment $appointment, array $treatments): void
    {
        $appointment->bookingMedicines()->delete();

        foreach ($treatments as $treatment) {
            $animalId = (int) $treatment['animal_id'];
            $petWeight = $treatment['pet_weight'] ?? null;
            if ($petWeight !== null && $petWeight <= 0) {
                $petWeight = null;
            }

            if ($petWeight !== null) {
                Animal::whereKey($animalId)->update(['weight' => $petWeight]);
            }

            $this->planBookingMedicines(
                $appointment,
                $treatment['selected_items'],
                $petWeight,
                $animalId
            );
            $this->syncOutsidePurchaseItems(
                $appointment,
                $animalId,
                $treatment['outside_items'] ?? []
            );

            if (!empty($treatment['administered_by'])) {
                $appointment->setAnimalAdministeredBy($animalId, $treatment['administered_by']);
            }
        }

        $appointment->clearResolvedAnimals();
    }

    /**
     * @param  list<array{administered_by?: string}>  $treatments
     */
    // Diri tigumon kinsa ang nagtambal sa mga hayop.
    private function summarizeAdministeredBy(array $treatments, Appointment $appointment): string
    {
        $names = collect($treatments)
            ->pluck('administered_by')
            ->filter()
            ->map(fn ($name) => trim((string) $name))
            ->filter()
            ->unique()
            ->values();

        if ($names->isNotEmpty()) {
            return $names->implode(', ');
        }

        return (string) ($appointment->administered_by ?: '');
    }

    // Diri planuhon ang tambal nga gamiton sa booking.
    private function planBookingMedicines(Appointment $appointment, array $selectedItems, ?float $petWeight, ?int $animalId = null): void
    {
        foreach ($selectedItems as $selectedItem) {
            $reference = Inventory::with('medicine')->find($selectedItem['inventory_id']);
            if (!$reference) {
                throw new \Exception('Inventory item not found.');
            }

            $fifoBatch = InventoryDeductionService::oldestBatch($reference->medicine_id);
            if (!$fifoBatch) {
                throw new \Exception("No stock available for {$reference->medicine?->name}.");
            }

            $requestedQty = (float) $selectedItem['quantity'];
            $logQty = $requestedQty;
            $bookingUnit = $fifoBatch->unit?->name ?? 'unit';

            if ($fifoBatch->isVial()) {
                if ($petWeight === null || $petWeight <= 0) {
                    throw new \Exception("Pet weight is required for vial item {$fifoBatch->medicine?->name}.");
                }
                $logQty = round($petWeight * 0.10, 2);
                $bookingUnit = 'ml';
            } elseif ($fifoBatch->isBox()) {
                $bookingUnit = 'items';
            }

            BookingMedicine::create([
                'booking_id' => $appointment->id,
                'animal_id' => $animalId,
                'inventory_id' => $fifoBatch->id,
                'medicine_id' => $fifoBatch->medicine_id,
                'quantity_used' => $logQty,
                'unit_name' => $bookingUnit,
                'dosage_ml' => $fifoBatch->isVial() ? $logQty : null,
            ]);
        }
    }

    // Diri i-save ang mga tambal nga paliton sa gawas.
    private function syncOutsidePurchaseItems(Appointment $appointment, int $animalId, array $items): void
    {
        $appointment->outsidePurchaseItems()->where('animal_id', $animalId)->delete();

        foreach ($items as $item) {
            $appointment->outsidePurchaseItems()->create([
                'animal_id' => $animalId,
                'item_name' => $item['name'],
                'quantity' => $item['quantity'],
                'status' => OutsidePurchaseItem::displayStatus($item['status'] ?? null),
                'issued_at' => now(),
            ]);
        }
    }
}
