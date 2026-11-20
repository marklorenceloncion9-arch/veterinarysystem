<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\User;
use App\Models\Barangay;
use App\Models\Zone;
use App\Models\AnimalType;
use App\Models\Species;
use App\Models\Breed;
use App\Models\Animal;
use App\Models\AnimalRegistration;
use App\Models\PetRegistration;
use App\Models\PaymentType;
use App\Models\RevenueHistory;
use App\Services\VhcFeeService;
use App\Models\VhcClient;
use App\Models\VhcRecord;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use App\Mail\ClientRegistrationStatusMail;
use App\Services\ClientApprovalService;
use App\Services\ClientRegistrationNotificationService;
use Inertia\Inertia;
use Carbon\Carbon;

class ClientController extends Controller
{
    /**
     * Display the clients page.
     */
    // Diri ilista ang mga approved nga client.
    public function index(Request $request)
    {
        return $this->renderClientList($request, 'approved');
    }

    /**
     * Mobile registrations awaiting admin approval.
     */
    // Diri ilista ang mga client nga naghulat og approval.
    public function pendingRegistrations(Request $request)
    {
        return $this->renderClientList($request, 'pending');
    }

    /**
     * Rejected / cancelled mobile registration attempts.
     */
    // Diri ilista ang mga client nga gi-reject.
    public function rejectedRegistrations(Request $request)
    {
        return $this->renderClientList($request, 'rejected');
    }

    // Diri ipakita ang lista sa client base sa status.
    private function renderClientList(Request $request, string $listStatus)
    {
        $query = User::where('role', 'client')
            ->where('approval_status', $listStatus)
            ->with('barangay')
            ->withCount([
                'animals' => fn ($query) => $query->active(),
                'animals as pending_pets_count' => fn ($query) => $query->pendingRegistration(),
            ]);

        $this->applyClientListFilters($query, $request);

        $clients = $query->latest()->get();
        $barangays = Barangay::orderBy('name')->get() ?? [];
        $zones = Zone::orderByRaw(Zone::NATURAL_ORDER)->get(['id', 'barangay_id', 'name']);

        return Inertia::render('Admin/Client', [
            'clients' => $clients,
            'animals' => $this->animalsForList($request, $listStatus),
            'barangays' => $barangays,
            'zones' => $zones,
            'species' => Species::orderBy('species_name')->get(),
            'breeds' => Breed::orderBy('breed_name')->get(),
            'listStatus' => $listStatus,
        ]);
    }

    // Diri ilista ang mga hayop sa mga client nga parehas ang status ug barangay.
    private function animalsForList(Request $request, string $listStatus)
    {
        $query = Animal::query()
            ->active()
            ->with([
                'species.animalType',
                'breed',
                'user.barangay',
                'animalRegistrations',
            ])
            ->whereHas('user', function ($user) use ($request, $listStatus) {
                $user->where('role', 'client')
                    ->where('approval_status', $listStatus);

                if ($request->filled('barangay_id')) {
                    $user->where('barangay_id', $request->barangay_id);
                }
            });

        if ($request->filled('search')) {
            $searchTerm = $request->search;
            $query->where(function ($animal) use ($searchTerm) {
                $animal->where('pet_name', 'like', "%{$searchTerm}%")
                    ->orWhere('identification_number', 'like', "%{$searchTerm}%")
                    ->orWhereHas('species', fn ($species) => $species->where('species_name', 'like', "%{$searchTerm}%"))
                    ->orWhereHas('breed', fn ($breed) => $breed->where('breed_name', 'like', "%{$searchTerm}%"))
                    ->orWhereHas('user', function ($user) use ($searchTerm) {
                        $user->where('firstname', 'like', "%{$searchTerm}%")
                            ->orWhere('lastname', 'like', "%{$searchTerm}%")
                            ->orWhere('middlename', 'like', "%{$searchTerm}%");
                    });
            });
        }

        return $query->orderBy('pet_name')->get()->map(function (Animal $animal) {
            $owner = $animal->user;
            $last = trim((string) $owner?->lastname);
            $first = trim((string) $owner?->firstname);
            $ownerName = $last && $first ? "{$last}, {$first}" : ($last ?: $first ?: 'Unnamed owner');

            return [
                'id' => $animal->id,
                'pet_name' => $animal->pet_name,
                'identification_number' => $animal->identification_number,
                'sex' => $animal->sex,
                'color' => $animal->color,
                'pet_photo_url' => $animal->pet_photo_url,
                'species' => $animal->species?->species_name,
                'breed' => $animal->breed?->breed_name,
                'registration_status' => $animal->registration_status,
                'owner_id' => $owner?->id,
                'owner_name' => $ownerName,
                'barangay' => $owner?->barangay?->name,
            ];
        })->values();
    }

    // Diri i-apply ang search ug filter sa lista sa client.
    private function applyClientListFilters($query, Request $request): void
    {
        if ($request->filled('barangay_id')) {
            $query->where('barangay_id', $request->barangay_id);
        }

        if ($request->filled('search')) {
            $searchTerm = $request->search;
            $query->where(function ($q) use ($searchTerm) {
                $q->where('firstname', 'like', "%{$searchTerm}%")
                    ->orWhere('lastname', 'like', "%{$searchTerm}%")
                    ->orWhere('middlename', 'like', "%{$searchTerm}%")
                    ->orWhere('email', 'like', "%{$searchTerm}%");
            });
        }
    }

    /**
     * Search approved owners by name, phone, or email.
     */
    // Diri pangitaon ang existing nga tag-iya.
    public function searchOwners(Request $request)
    {
        $term = trim((string) $request->query('q', ''));

        if (mb_strlen($term) < 2) {
            return response()->json([]);
        }

        $owners = User::query()
            ->where('role', 'client')
            ->where('approval_status', 'approved')
            ->with('barangay:id,name')
            ->select([
                'id',
                'firstname',
                'middlename',
                'lastname',
                'phone_number',
                'email',
                'barangay_id',
                'zone',
                'street',
                'profile_photo_url',
            ])
            ->where(function ($query) use ($term) {
                $query->where('firstname', 'like', "%{$term}%")
                    ->orWhere('lastname', 'like', "%{$term}%")
                    ->orWhere('middlename', 'like', "%{$term}%")
                    ->orWhere('email', 'like', "%{$term}%")
                    ->orWhere('phone_number', 'like', "%{$term}%");
            })
            ->orderBy('lastname')
            ->orderBy('firstname')
            ->limit(8)
            ->get()
            ->map(fn (User $owner) => [
                'id' => $owner->id,
                'firstname' => $owner->firstname,
                'middlename' => $owner->middlename,
                'lastname' => $owner->lastname,
                'phone_number' => $owner->phone_number,
                'email' => $owner->email,
                'barangay' => $owner->barangay?->name,
                'zone' => $owner->zone,
                'street' => $owner->street,
                'profile_photo_url' => $owner->profile_photo_url,
            ]);

        return response()->json($owners);
    }

    /**
     * Store a new client.
     */
    // Diri i-save ang bag-ong client ug iyang mga hayop.
    public function store(Request $request)
    {
        \Log::info('Client creation attempt', ['request_data' => $request->all()]);

        $validated = $request->validate([
            'lastname' => 'required|string|max:255',
            'firstname' => 'required|string|max:255',
            'middlename' => 'nullable|string|max:255',
            'age' => 'required|integer|min:1|max:150',
            'barangay_id' => 'required|exists:barangays,id',
            'zone' => 'required|string|max:255',
            'street' => 'required|string|max:255',
            'facebook' => 'nullable|string|max:255',
            'phone_number' => 'nullable|string|regex:/^09\d{9}$/',
            'email' => 'required|string|email|max:255|unique:users',
            'password' => 'required|string|min:8|confirmed',
            'role' => 'required|string|in:client',
            'redirect_to' => 'nullable|in:clients,services',
            'pets' => 'nullable|array',
            'pets.*.pet_name' => 'required|string|max:255',
            'pets.*.species_id' => 'required|exists:species,id',
            'pets.*.breed_id' => 'required|exists:breeds,id',
            'pets.*.sex' => 'required|in:male,female',
            'pets.*.color' => 'nullable|string|max:255',
            'pets.*.weight' => 'nullable|numeric|gt:0|max:999.99',
            'pets.*.birthdate' => 'nullable|date|before_or_equal:today',
            // Reproductive Status
            'pets.*.reproductive_status' => 'required|in:pregnant,nursing,not_pregnant',
            'pets.*.weeks_months' => 'nullable|required_if:pets.*.reproductive_status,pregnant,nursing|string|max:50',
            // Diet
            'pets.*.diet' => 'required|in:commercial_food,table_food,both,others',
            'pets.*.diet_other' => 'nullable|required_if:pets.*.diet,others|string|max:255',
            // Deworming History
            'pets.*.dewormed' => 'required|in:yes,no',
            'pets.*.last_deworming_date' => 'nullable|required_if:pets.*.dewormed,yes|date|before_or_equal:today',
            'pets.*.dewormer_name' => 'nullable|string|max:255',
            // Vaccination History
            'pets.*.rabies_vaccine' => 'required|in:yes,no',
            'pets.*.rabies_last_vaccination' => 'nullable|required_if:pets.*.rabies_vaccine,yes|date|before_or_equal:today',
            'pets.*.dhppl_vaccine' => 'required|in:yes,no',
            'pets.*.dhppl_last_vaccination' => 'nullable|required_if:pets.*.dhppl_vaccine,yes|date|before_or_equal:today',
            'pets.*.other_vaccine_name' => 'nullable|string|max:255',
            'pets.*.other_vaccine_last_vaccination' => 'nullable|required_with:pets.*.other_vaccine_name|date|before_or_equal:today',
        ], [
            'pets.*.reproductive_status.required' => 'Reproductive status is required',
            'pets.*.diet.required' => 'Diet is required',
            'pets.*.dewormed.required' => 'Please answer the deworming question',
            'pets.*.rabies_vaccine.required' => 'Please answer the rabies vaccine question',
            'pets.*.dhppl_vaccine.required' => 'Please answer the DHPPL vaccine question',
            'pets.*.weeks_months.required_if' => 'Duration is required',
            'pets.*.diet_other.required_if' => 'Please specify the diet',
            'pets.*.last_deworming_date.required_if' => 'Last deworming date is required',
            'pets.*.rabies_last_vaccination.required_if' => 'Last rabies vaccination date is required',
            'pets.*.dhppl_last_vaccination.required_if' => 'Last DHPPL vaccination date is required',
            'pets.*.other_vaccine_last_vaccination.required_with' => 'Last vaccination date is required',
            'pets.*.birthdate.before_or_equal' => 'Birthdate cannot be in the future',
            'pets.*.last_deworming_date.before_or_equal' => 'Deworming date cannot be in the future',
            'pets.*.rabies_last_vaccination.before_or_equal' => 'Vaccination date cannot be in the future',
            'pets.*.dhppl_last_vaccination.before_or_equal' => 'Vaccination date cannot be in the future',
            'pets.*.other_vaccine_last_vaccination.before_or_equal' => 'Vaccination date cannot be in the future',
            'pets.*.weight.gt' => 'Weight must be greater than 0',
            'pets.*.weight.max' => 'Weight cannot exceed 999.99 kg',
        ]);

        \Log::info('Validation passed', ['validated' => $validated]);

        $pets = $validated['pets'] ?? [];
        $redirectTo = $validated['redirect_to'] ?? 'clients';
        unset($validated['pets'], $validated['redirect_to']);

        $validated['password'] = Hash::make($validated['password']);
        $validated['password_setup_required'] = false;
        $validated['name'] = $validated['firstname'] . ' ' . $validated['lastname'];
        $validated['email_verified_at'] = now();
        $validated['approval_status'] = 'approved';

        \Log::info('About to create user', ['data' => $validated]);

        try {
            $user = \DB::transaction(function () use ($validated, $pets) {
                $user = User::create($validated);

                foreach ($pets as $pet) {
                    $pet['user_id'] = $user->id;
                    // Male animals can never be pregnant or nursing
                    if ($pet['sex'] === 'male') {
                        $pet['reproductive_status'] = 'not_pregnant';
                        $pet['weeks_months'] = null;
                    }
                    $pet['dewormed'] = $pet['dewormed'] ?? 'no';
                    $pet['rabies_vaccine'] = $pet['rabies_vaccine'] ?? 'no';
                    $pet['dhppl_vaccine'] = $pet['dhppl_vaccine'] ?? 'no';
                    Animal::create($pet);
                }

                return $user;
            });
            \Log::info('User created successfully', ['user_id' => $user->id, 'pets_created' => count($pets)]);
        } catch (\Exception $e) {
            \Log::error('Failed to create user', ['error' => $e->getMessage(), 'trace' => $e->getTraceAsString()]);
            return back()->with('error', 'Failed to create client: ' . $e->getMessage());
        }

        $message = count($pets) > 0
            ? 'Client created successfully with ' . count($pets) . ' ' . (count($pets) === 1 ? 'animal' : 'animals') . '!'
            : 'Client created successfully with login account!';

        $route = $redirectTo === 'services' ? 'admin.services' : 'admin.clients';

        return redirect()->route($route)->with('success', $message);
    }

    /**
     * Show client details.
     */
    // Diri ipakita ang detalye sa usa ka client.
    public function show($id)
    {
        $client = User::where('role', 'client')
            ->with([
                'barangay',
                'animals' => fn ($query) => $query
                    ->active()
                    ->orderByDesc('created_at')
                    ->with(['species.animalType', 'breed', 'petRegistrations']),
            ])
            ->findOrFail($id);

        $species = Species::orderBy('species_name')->get();
        $breeds = Breed::orderBy('breed_name')->get();
        $barangays = Barangay::orderBy('name')->get();
        $zones = Zone::orderByRaw(Zone::NATURAL_ORDER)->get(['id', 'barangay_id', 'name']);

        return Inertia::render('Admin/ClientDetails', [
            'client' => $client,
            'species' => $species,
            'breeds' => $breeds,
            'barangays' => $barangays,
            'zones' => $zones,
        ]);
    }

    /**
     * Update client information.
     */
    // Diri usbon ang detalye sa client.
    public function update(Request $request, $id)
    {
        $client = User::where('role', 'client')->findOrFail($id);

        $validated = $request->validate([
            'firstname' => 'required|string|max:255',
            'middlename' => 'nullable|string|max:255',
            'lastname' => 'required|string|max:255',
            'age' => 'required|integer|min:1|max:120',
            'email' => 'required|email|unique:users,email,' . $client->id,
            'password' => 'nullable|string|min:8|confirmed',
            'phone_number' => 'nullable|string|regex:/^09\d{9}$/',
            'barangay_id' => 'required|exists:barangays,id',
            'zone' => 'required|string|max:255',
            'street' => 'required|string|max:255',
            'facebook' => 'nullable|string|max:255',
        ], [
            'email.required' => 'Email address is required.',
            'email.email' => 'Please enter a valid email address.',
            'email.unique' => 'This email is already registered to another account.',
            'password.min' => 'Password must be at least 8 characters.',
            'password.confirmed' => 'Password confirmation does not match.',
        ]);

        $validated['name'] = $validated['firstname'] . ' ' . $validated['lastname'];

        if (!empty($validated['password'])) {
            $validated['password'] = Hash::make($validated['password']);
        } else {
            unset($validated['password']);
        }

        unset($validated['password_confirmation']);

        $client->update($validated);

        if ($request->wantsJson()) {
            return response()->json([
                'message' => 'Client information updated successfully!',
            ]);
        }

        return redirect()->route('admin.clients.show', $client->id)
            ->with('success', 'Client information updated successfully!');
    }

    /**
     * Create login account for client with placeholder email.
     */
    // Diri himuan og login account ang client.
    public function createAccount(Request $request, $id)
    {
        $client = User::where('role', 'client')->findOrFail($id);

        // Check if client already has a real account
        if (!$client->email || !str_ends_with($client->email, '@vetcare.local')) {
            return redirect()->route('admin.clients.show', $client->id)
                ->with('error', 'This client already has a login account.');
        }

        $validated = $request->validate([
            'email' => 'required|email|unique:users,email',
            'password' => 'required|string|min:8|confirmed',
        ], [
            'email.required' => 'Email address is required.',
            'email.email' => 'Please enter a valid email address.',
            'email.unique' => 'This email is already registered to another account.',
            'password.required' => 'Password is required.',
            'password.min' => 'Password must be at least 8 characters.',
            'password.confirmed' => 'Password confirmation does not match.',
        ]);

        $client->update([
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
            'approval_status' => 'approved',
            'email_verified_at' => now(),
        ]);

        return redirect()->route('admin.clients.show', $client->id)
            ->with('success', 'Login account created successfully! Client can now log in with their email and password.');
    }

    /**
     * Approve or reject a pending client registration.
     */
    // Diri i-approve o i-reject ang registration sa client.
    public function updateApproval(Request $request, $id)
    {
        $client = User::where('role', 'client')->findOrFail($id);

        $validated = $request->validate([
            'action' => 'required|in:approve,reject',
        ]);

        if ($client->approval_status !== 'pending') {
            return redirect()->route('admin.clients.show', $client->id)
                ->with('error', 'This client is not pending approval.');
        }

        $isApproved = $validated['action'] === 'approve';
        $client->update([
            'approval_status' => $isApproved ? 'approved' : 'rejected',
            'email_verified_at' => $isApproved ? now() : $client->email_verified_at,
            'remember_token' => $isApproved ? $client->remember_token : null,
        ]);

        if (!$isApproved) {
            $cancellationReason = 'Your account registration was not approved because the details you provided did not match your ID or residence photo. All active appointments have been cancelled.';
            ClientApprovalService::cancelActiveAppointmentsForClient($client->fresh(), $cancellationReason);
        }

        ClientRegistrationNotificationService::markClientRegistrationHandled($client->id);
        ClientRegistrationNotificationService::notifyClientOfDecision($client->fresh(), $isApproved);

        if (!$client->email || str_ends_with($client->email, '@vetcare.local')) {
            return redirect()->route('admin.clients.show', $client->id)
                ->with('success', $isApproved ? 'Client approved successfully.' : 'Client registration rejected.');
        }

        try {
            $recipientName = trim(($client->firstname ?? '') . ' ' . ($client->lastname ?? '')) ?: $client->name;
            $bodyMessage = $isApproved
                ? "Your account registration has been approved by El Salvador Vet Clinic. You can now sign in to the VetMob app using your email and password."
                : "The account you created did not match the photo you provided. Your registration was not approved.\n\nAll active appointments have been cancelled. Please register again in the VetMob app with information that matches your barangay residence proof, National ID, or Voter's ID. You may use the same first name, last name, and email when registering again.";

            Mail::to($client->email)->send(new ClientRegistrationStatusMail(
                $recipientName,
                $isApproved ? 'approved' : 'rejected',
                $bodyMessage
            ));
        } catch (\Exception $e) {
            \Log::error('Failed to send client approval email', [
                'client_id' => $client->id,
                'error' => $e->getMessage(),
            ]);
        }

        return redirect()->back()
            ->with('success', $isApproved
                ? 'Client approved successfully. An email notification has been sent.'
                : 'Client registration rejected. An email notification has been sent.');
    }

    /**
     * Get barangays for dropdown.
     */
    // Diri kuhaon ang lista sa barangay.
    public function getBarangays()
    {
        $barangays = Barangay::all();
        return response()->json($barangays);
    }

    /**
     * Get zones for dropdown, optionally filtered by barangay.
     */
    // Diri kuhaon ang mga zone sa barangay.
    public function getZones(Request $request)
    {
        $zones = Zone::query()
            ->when($request->filled('barangay_id'), fn ($query) => $query->where('barangay_id', $request->barangay_id))
            ->orderByRaw(Zone::NATURAL_ORDER)
            ->get(['id', 'barangay_id', 'name']);

        return response()->json($zones);
    }

    /**
     * Store a new zone within a barangay so the list can grow without code changes.
     */
    // Diri i-save ang bag-ong zone.
    public function storeZone(Request $request)
    {
        $validated = $request->validate([
            'barangay_id' => 'required|exists:barangays,id',
            'name' => 'required|string|max:255|unique:zones,name,NULL,id,barangay_id,' . $request->barangay_id,
        ]);

        $zone = Zone::create($validated);

        if ($request->wantsJson()) {
            return response()->json($zone, 201);
        }

        return redirect()->back()->with('success', 'Zone added successfully');
    }

    /**
     * Store a new species.
     */
    // Diri i-save ang bag-ong species.
    public function storeSpecies(Request $request)
    {
        $validated = $request->validate([
            'species_name' => 'required|string|max:255',
            'type_id' => 'required|exists:animal_types,id'
        ]);

        Species::create($validated);

        return redirect()->back()->with('success', 'Species added successfully');
    }

    /**
     * Store a new breed.
     */
    // Diri i-save ang bag-ong breed.
    public function storeBreed(Request $request)
    {
        $validated = $request->validate([
            'breed_name' => 'required|string|max:255',
            'species_id' => 'required|exists:species,id'
        ]);

        Breed::create($validated);

        return redirect()->back()->with('success', 'Breed added successfully');
    }

    /**
     * Get animal types, species, and breeds for forms.
     */
    // Diri kuhaon ang species ug breed para sa form sa hayop.
    public function getAnimalData()
    {
        $animalTypes = AnimalType::with('species.breeds')->get();
        return response()->json($animalTypes);
    }

    /**
     * Store a new pet for a client.
     */
    // Diri i-save ang bag-ong hayop sa client.
    public function storePet(Request $request, $clientId)
    {
        $client = User::where('role', 'client')->findOrFail($clientId);

        if ($request->exists('pets')) {
            $validated = $request->validate([
                'redirect_to' => 'nullable|in:clients,services',
                'pets' => 'required|array|min:1',
                'pets.*.pet_name' => 'required|string|max:255',
                'pets.*.species_id' => 'required|exists:species,id',
                'pets.*.breed_id' => 'required|exists:breeds,id',
                'pets.*.sex' => 'required|in:male,female',
                'pets.*.color' => 'nullable|string|max:255',
                'pets.*.weight' => 'nullable|numeric|gt:0|max:999.99',
                'pets.*.birthdate' => 'nullable|date|before_or_equal:today',
                'pets.*.reproductive_status' => 'required|in:pregnant,nursing,not_pregnant',
                'pets.*.weeks_months' => 'nullable|required_if:pets.*.reproductive_status,pregnant,nursing|string|max:50',
                'pets.*.diet' => 'required|in:commercial_food,table_food,both,others',
                'pets.*.diet_other' => 'nullable|required_if:pets.*.diet,others|string|max:255',
                'pets.*.dewormed' => 'required|in:yes,no',
                'pets.*.last_deworming_date' => 'nullable|required_if:pets.*.dewormed,yes|date|before_or_equal:today',
                'pets.*.dewormer_name' => 'nullable|string|max:255',
                'pets.*.rabies_vaccine' => 'required|in:yes,no',
                'pets.*.rabies_last_vaccination' => 'nullable|required_if:pets.*.rabies_vaccine,yes|date|before_or_equal:today',
                'pets.*.dhppl_vaccine' => 'required|in:yes,no',
                'pets.*.dhppl_last_vaccination' => 'nullable|required_if:pets.*.dhppl_vaccine,yes|date|before_or_equal:today',
                'pets.*.other_vaccine_name' => 'nullable|string|max:255',
                'pets.*.other_vaccine_last_vaccination' => 'nullable|required_with:pets.*.other_vaccine_name|date|before_or_equal:today',
            ]);

            $pets = $validated['pets'];

            \DB::transaction(function () use ($client, $pets) {
                foreach ($pets as $pet) {
                    $pet['user_id'] = $client->id;
                    if ($pet['sex'] === 'male') {
                        $pet['reproductive_status'] = 'not_pregnant';
                        $pet['weeks_months'] = null;
                    }
                    $pet['dewormed'] = $pet['dewormed'] ?? 'no';
                    $pet['rabies_vaccine'] = $pet['rabies_vaccine'] ?? 'no';
                    $pet['dhppl_vaccine'] = $pet['dhppl_vaccine'] ?? 'no';
                    Animal::create($pet);
                }
            });

            $count = count($pets);
            $message = $count === 1
                ? 'Animal added successfully!'
                : $count . ' animals added successfully!';
            $route = ($validated['redirect_to'] ?? 'clients') === 'services' ? 'admin.services' : 'admin.clients';

            return redirect()->route($route)->with('success', $message);
        }

        $validated = $request->validate([
            'pet_name' => 'required|string|max:255',
            'species_id' => 'required|exists:species,id',
            'breed_id' => 'required|exists:breeds,id',
            'sex' => 'required|in:male,female',
            'color' => 'nullable|string|max:255',
            'weight' => 'nullable|numeric|min:0|max:999.99',
            'birthdate' => 'nullable|date',
            // Reproductive Status
            'reproductive_status' => 'nullable|in:pregnant,nursing,not_pregnant',
            'weeks_months' => 'nullable|string|max:50',
            // Diet
            'diet' => 'nullable|in:commercial_food,table_food,both,others',
            'diet_other' => 'nullable|string|max:255',
            // Deworming History
            'dewormed' => 'nullable|in:yes,no',
            'last_deworming_date' => 'nullable|date',
            'dewormer_name' => 'nullable|string|max:255',
            // Vaccination History
            'rabies_vaccine' => 'nullable|in:yes,no',
            'rabies_last_vaccination' => 'nullable|date',
            'dhppl_vaccine' => 'nullable|in:yes,no',
            'dhppl_last_vaccination' => 'nullable|date',
            'other_vaccine_name' => 'nullable|string|max:255',
            'other_vaccine_last_vaccination' => 'nullable|date',
        ]);

        $pet = Animal::create([
            'user_id' => $client->id,
            'pet_name' => $validated['pet_name'],
            'species_id' => $validated['species_id'],
            'breed_id' => $validated['breed_id'],
            'sex' => $validated['sex'],
            'color' => $validated['color'],
            'weight' => $validated['weight'],
            'birthdate' => $validated['birthdate'],
            // Reproductive Status
            'reproductive_status' => $validated['reproductive_status'],
            'weeks_months' => $validated['weeks_months'],
            // Diet
            'diet' => $validated['diet'],
            'diet_other' => $validated['diet_other'],
            // Deworming History
            'dewormed' => $validated['dewormed'] ?? 'no',
            'last_deworming_date' => $validated['last_deworming_date'],
            'dewormer_name' => $validated['dewormer_name'],
            // Vaccination History
            'rabies_vaccine' => $validated['rabies_vaccine'] ?? 'no',
            'rabies_last_vaccination' => $validated['rabies_last_vaccination'],
            'dhppl_vaccine' => $validated['dhppl_vaccine'] ?? 'no',
            'dhppl_last_vaccination' => $validated['dhppl_last_vaccination'],
            'other_vaccine_name' => $validated['other_vaccine_name'],
            'other_vaccine_last_vaccination' => $validated['other_vaccine_last_vaccination'],
        ]);

        if ($request->wantsJson()) {
            return response()->json([
                'message' => 'Animal added successfully!',
            ]);
        }

        return redirect()->route('admin.clients.show', $client->id)
            ->with('success', 'Animal added successfully!');
    }

    /**
     * Update an existing pet for a client.
     */
    // Diri usbon ang detalye sa hayop sa client.
    public function updatePet(Request $request, $clientId, $petId)
    {
        $client = User::where('role', 'client')->findOrFail($clientId);
        $pet = Animal::where('id', $petId)->where('user_id', $client->id)->firstOrFail();

        $nullableFields = [
            'color', 'markings', 'weight', 'birthdate', 'reproductive_status', 'weeks_months',
            'diet', 'diet_other', 'dewormed', 'last_deworming_date', 'dewormer_name',
            'rabies_vaccine', 'rabies_last_vaccination', 'dhppl_vaccine', 'dhppl_last_vaccination',
            'other_vaccine_name', 'other_vaccine_last_vaccination',
        ];

        $request->merge(
            collect($request->only($nullableFields))
                ->map(fn ($value) => $value === '' ? null : $value)
                ->all()
        );

        $validated = $request->validate([
            'pet_name' => 'required|string|max:255',
            'species_id' => 'required|exists:species,id',
            'breed_id' => 'required|exists:breeds,id',
            'sex' => 'required|in:male,female',
            'color' => 'nullable|string|max:255',
            'markings' => 'nullable|string|max:255',
            'weight' => 'nullable|numeric|min:0|max:999.99',
            'birthdate' => 'nullable|date',
            // Reproductive Status
            'reproductive_status' => 'nullable|in:pregnant,nursing,not_pregnant',
            'weeks_months' => 'nullable|string|max:50',
            // Diet
            'diet' => 'nullable|in:commercial_food,table_food,both,others',
            'diet_other' => 'nullable|string|max:255',
            // Deworming History
            'dewormed' => 'nullable|in:yes,no',
            'last_deworming_date' => 'nullable|date',
            'dewormer_name' => 'nullable|string|max:255',
            // Vaccination History
            'rabies_vaccine' => 'nullable|in:yes,no',
            'rabies_last_vaccination' => 'nullable|date',
            'dhppl_vaccine' => 'nullable|in:yes,no',
            'dhppl_last_vaccination' => 'nullable|date',
            'other_vaccine_name' => 'nullable|string|max:255',
            'other_vaccine_last_vaccination' => 'nullable|date',
        ]);

        $pet->update([
            'pet_name' => $validated['pet_name'],
            'species_id' => $validated['species_id'],
            'breed_id' => $validated['breed_id'],
            'sex' => $validated['sex'],
            'color' => $validated['color'] ?? null,
            'markings' => $validated['markings'] ?? null,
            'weight' => $validated['weight'] ?? null,
            'birthdate' => $validated['birthdate'] ?? null,
            // Reproductive Status
            'reproductive_status' => $validated['reproductive_status'] ?? null,
            'weeks_months' => $validated['weeks_months'] ?? null,
            // Diet
            'diet' => $validated['diet'] ?? null,
            'diet_other' => $validated['diet_other'] ?? null,
            // Deworming History
            'dewormed' => $validated['dewormed'] ?? 'no',
            'last_deworming_date' => $validated['last_deworming_date'] ?? null,
            'dewormer_name' => $validated['dewormer_name'] ?? null,
            // Vaccination History
            'rabies_vaccine' => $validated['rabies_vaccine'] ?? 'no',
            'rabies_last_vaccination' => $validated['rabies_last_vaccination'] ?? null,
            'dhppl_vaccine' => $validated['dhppl_vaccine'] ?? 'no',
            'dhppl_last_vaccination' => $validated['dhppl_last_vaccination'] ?? null,
            'other_vaccine_name' => $validated['other_vaccine_name'] ?? null,
            'other_vaccine_last_vaccination' => $validated['other_vaccine_last_vaccination'] ?? null,
        ]);

        return redirect()
            ->route('admin.clients.animals.history', [$client->id, $pet->id])
            ->with('success', 'Animal updated successfully!');
    }

    /**
     * Update pet registration status (approve or decline).
     * Creates/updates record in pet_registrations table.
     */
    // Diri usbon ang registration status sa hayop.
    public function updatePetStatus(Request $request, $clientId, $petId)
    {
        $client = User::where('role', 'client')->findOrFail($clientId);
        $pet = Animal::where('id', $petId)->where('user_id', $client->id)->firstOrFail();

        $validated = $request->validate([
            'registration_status' => 'required|in:registered,declined,unregistered',
        ]);

        $newStatus = $validated['registration_status'];
        $paymentTypeId = PaymentType::getId('pet_registration');
        
        // Get the fee that was in effect at the time of approval (based on approval date)
        $approvalDate = now();
        $registrationFee = $this->getHistoricalFeeForDate($paymentTypeId, $approvalDate);

        // Handle each status
        switch ($newStatus) {
            case 'registered':
                // Create or update registration as paid
                PetRegistration::updateOrCreate(
                    [
                        'animal_id' => $pet->id,
                        'client_id' => $client->id,
                    ],
                    [
                        'payment_type_id' => $paymentTypeId,
                        'amount' => $registrationFee ?? 0,
                        'status' => 'paid',
                        'payment_method' => 'Registration Approval',
                        'paid_at' => $approvalDate,
                        'notes' => 'Registration approved for ' . $pet->pet_name,
                    ]
                );

                $identificationNumber = $pet->assignIdentificationNumber();
                $message = $registrationFee
                    ? 'Pet approved and registered! ID: ' . $identificationNumber . ' · Fee: ₱' . $registrationFee
                    : 'Pet approved and registered! ID: ' . $identificationNumber . ' · No fee configured.';
                break;

            case 'declined':
                // Create or update registration as cancelled
                PetRegistration::updateOrCreate(
                    [
                        'animal_id' => $pet->id,
                        'client_id' => $client->id,
                    ],
                    [
                        'payment_type_id' => $paymentTypeId,
                        'amount' => 0,
                        'status' => 'cancelled',
                        'payment_method' => null,
                        'paid_at' => null,
                        'notes' => 'Registration declined for ' . $pet->pet_name,
                    ]
                );
                $message = 'Pet registration declined.';
                break;

            case 'unregistered':
                // Remove any existing registration record
                PetRegistration::where('animal_id', $pet->id)
                    ->where('client_id', $client->id)
                    ->delete();
                $message = 'Pet marked as unregistered.';
                break;
        }

        // Reload the client with updated animals
        $client->load([
            'animals' => fn ($query) => $query
                ->active()
                ->orderByDesc('created_at')
                ->with(['species.animalType', 'breed', 'petRegistrations']),
        ]);

        return redirect()->back()->with('success', $message);
    }

    /**
     * Get the historical fee amount that was in effect on a specific date
     */
    // Diri kuhaon ang bayad nga epektibo sa maong petsa.
    private function getHistoricalFeeForDate($paymentTypeId, $date)
    {
        // Get the most recent fee change before or on this date
        $historyEntry = RevenueHistory::where('payment_type_id', $paymentTypeId)
            ->where('effective_date', '<=', $date)
            ->orderBy('effective_date', 'desc')
            ->first();
        
        if ($historyEntry) {
            return $historyEntry->new_amount;
        }
        
        // Check if there's any history AFTER this date
        // If so, use the old_amount from the earliest history as the baseline
        $futureHistory = RevenueHistory::where('payment_type_id', $paymentTypeId)
            ->where('effective_date', '>', $date)
            ->orderBy('effective_date', 'asc')
            ->first();
        
        if ($futureHistory) {
            // This date is before any changes, so use the original amount (old_amount of first change)
            return $futureHistory->old_amount;
        }
        
        // If no history at all, return current amount from payment type
        $paymentType = PaymentType::find($paymentTypeId);
        return $paymentType ? $paymentType->amount : 0;
    }

    /**
     * Validation rules for VHC certificate forms.
     */
    // Diri ang validation rules sa VHC form.
    private function vhcValidationRules(bool $includeLivestock = false, bool $forExistingClient = false): array
    {
        $rules = [
            'vhc_client_id' => 'nullable|exists:vhc_clients,id',
            'name' => ($forExistingClient ? 'nullable' : 'required') . '|string|max:255',
            'age' => 'nullable|string|max:255',
            'color' => 'nullable|string|max:255',
            'contact_number' => 'nullable|string|regex:/^09\d{9}$/',
            'purpose' => 'required|string|max:255',
            'origin' => 'required|string|max:255',
            'animals_origin' => 'nullable|string|max:255',
            'destination' => 'required|string|max:255',
            'slh' => 'nullable|string|max:255',
            'issued_on' => 'nullable|date',
            'valid_till' => 'nullable|date|after_or_equal:issued_on',
            'or_number' => 'nullable|string|max:255',
            'amount_paid' => 'nullable|numeric|min:0',
            'issued_at' => 'nullable|string|max:255',
            'inspected_by' => 'nullable|string|max:255',
        ];

        if ($includeLivestock) {
            $rules['livestock'] = 'required|array|min:1';
            $rules['livestock.*.species_id'] = 'required|exists:species,id';
            $rules['livestock.*.male_count'] = 'required|integer|min:0';
            $rules['livestock.*.female_count'] = 'required|integer|min:0';
        }

        return $rules;
    }

    /**
     * Friendly field names for VHC validation errors.
     */
    // Diri ang ngalan sa mga field para sa VHC validation.
    private function vhcValidationAttributes(): array
    {
        return [
            'name' => 'name',
            'age' => 'age',
            'color' => 'color',
            'contact_number' => 'contact number',
            'purpose' => 'purpose',
            'origin' => 'origin',
            'animals_origin' => 'animals origin',
            'destination' => 'destination',
            'slh' => 'SLH',
            'issued_on' => 'issued on',
            'valid_till' => 'valid till',
            'or_number' => 'O.R Number',
            'amount_paid' => 'amount paid',
            'issued_at' => 'issued at',
            'inspected_by' => 'inspected by',
            'livestock' => 'livestock & poultry',
            'livestock.*.species_id' => 'species',
            'livestock.*.male_count' => 'male count',
            'livestock.*.female_count' => 'female count',
        ];
    }

    /**
     * Get livestock and poultry species for VHC forms.
     */
    // Diri kuhaon ang mga species nga pwede sa VHC.
    private function getVhcSpecies()
    {
        $typeIds = AnimalType::whereIn('type_name', ['Livestock', 'Poultry'])->pluck('id');

        if ($typeIds->isEmpty()) {
            return Species::orderBy('species_name')->get();
        }

        return Species::whereIn('type_id', $typeIds)
            ->with('animalType')
            ->orderBy('species_name')
            ->get();
    }

    /**
     * Shared props for VHC Inertia pages.
     */
    // Diri andamon ang props sa VHC page.
    private function vhcPageProps(VhcFeeService $vhcFeeService): array
    {
        return [
            'species' => $this->getVhcSpecies(),
            'vhcFees' => $vhcFeeService->getFees(),
        ];
    }

    /**
     * Resolve or create the VHC client folder for a certificate.
     */
    // Diri pangitaon o himuon ang VHC client.
    private function resolveVhcClient(array &$validated): VhcClient
    {
        if (! empty($validated['vhc_client_id'])) {
            $client = VhcClient::findOrFail($validated['vhc_client_id']);
            $validated['name'] = $client->name;
            $validated['contact_number'] = $client->contact_number;

            return $client;
        }

        $client = VhcClient::create([
            'name' => $validated['name'],
            'contact_number' => $validated['contact_number'] ?? null,
        ]);

        $validated['vhc_client_id'] = $client->id;

        return $client;
    }

    /**
     * Display the VHC (Veterinary Health Card) list.
     */
    // Diri ilista ang mga VHC client ug record.
    public function vhcIndex(VhcFeeService $vhcFeeService)
    {
        $vhcClients = VhcClient::with(['certificates.livestock.species'])
            ->withCount('certificates')
            ->latest('updated_at')
            ->get()
            ->map(function (VhcClient $client) {
                $certificates = $client->certificates;
                $latestCertificate = $certificates->sortByDesc('created_at')->first();

                return [
                    'id' => $client->id,
                    'name' => $client->name,
                    'contact_number' => $client->contact_number,
                    'certificates_count' => $client->certificates_count,
                    'total_amount_paid' => $certificates->sum(fn ($record) => (float) ($record->amount_paid ?? 0)),
                    'total_animals' => $certificates->sum(function ($record) {
                        return $record->livestock->sum(
                            fn ($entry) => (int) $entry->male_count + (int) $entry->female_count
                        );
                    }),
                    'latest_certificate_at' => $latestCertificate?->created_at,
                    'latest_certificate_id' => $latestCertificate?->id,
                ];
            });

        return Inertia::render('Admin/vhc', [
            'vhcClients' => $vhcClients,
            ...$this->vhcPageProps($vhcFeeService),
        ]);
    }

    /**
     * Display a VHC client folder with all certificates.
     */
    // Diri ipakita ang detalye sa VHC client.
    public function vhcClientShow(VhcClient $client, VhcFeeService $vhcFeeService)
    {
        $client->load(['certificates' => function ($query) {
            $query->with('livestock.species')->latest();
        }]);

        return Inertia::render('Admin/VhcClient', [
            'client' => $client,
            ...$this->vhcPageProps($vhcFeeService),
        ]);
    }

    /**
     * Display the VHC create form.
     */
    // Diri ipakita ang form sa bag-ong VHC.
    public function vhcCreate(VhcFeeService $vhcFeeService)
    {
        return Inertia::render('Admin/VhcCreate', $this->vhcPageProps($vhcFeeService));
    }

    /**
     * Store a new VHC (Veterinary Health Card) record.
     */
    // Diri i-save ang bag-ong VHC record.
    public function vhcStore(Request $request, VhcFeeService $vhcFeeService)
    {
        $forExistingClient = $request->filled('vhc_client_id');

        $validated = $request->validate(
            $this->vhcValidationRules(true, $forExistingClient),
            [],
            $this->vhcValidationAttributes()
        );

        if (!isset($validated['amount_paid']) || $validated['amount_paid'] === '' || $validated['amount_paid'] === null) {
            $issuedOn = !empty($validated['issued_on']) ? Carbon::parse($validated['issued_on']) : now();
            $validated['amount_paid'] = $vhcFeeService->calculateAmount($validated['livestock'], $issuedOn);
        }

        if (empty($validated['issued_at'])) {
            $validated['issued_at'] = 'El Salvador City';
        }

        $client = $this->resolveVhcClient($validated);

        // Create VHC record
        $vhc = VhcRecord::create(collect($validated)->except('livestock')->all());

        // Create livestock entries
        foreach ($validated['livestock'] as $livestock) {
            $vhc->livestock()->create($livestock);
        }

        $client->touch();

        if ($forExistingClient) {
            return redirect()->route('admin.vhc.clients.show', $client)
                ->with('success', 'Veterinary Health Certificate added successfully!');
        }

        return redirect()->route('admin.vhc.clients.show', $client)
            ->with('success', 'VHC client folder and certificate created successfully!');
    }

    /**
     * Display a VHC (Veterinary Health Card) record.
     */
    // Diri ipakita ang detalye sa usa ka VHC record.
    public function vhcShow(VhcRecord $vhc, VhcFeeService $vhcFeeService)
    {
        $vhc->load(['livestock.species', 'client']);

        return Inertia::render('Admin/VhcView', [
            'record' => $vhc,
            ...$this->vhcPageProps($vhcFeeService),
        ]);
    }

    /**
     * Update a VHC (Veterinary Health Card) record.
     */
    // Diri usbon ang detalye sa VHC record.
    public function vhcUpdate(Request $request, \App\Models\VhcRecord $vhc)
    {
        $validated = $request->validate(
            $this->vhcValidationRules(),
            [],
            $this->vhcValidationAttributes()
        );

        $vhc->update($validated);

        return redirect()->route('admin.vhc.show', $vhc)
            ->with('success', 'Veterinary Health Certificate updated successfully!');
    }

    /**
     * Sync livestock and poultry entries on a VHC record.
     */
    // Diri usbon ang livestock sa VHC record.
    public function vhcUpdateLivestock(Request $request, \App\Models\VhcRecord $vhc)
    {
        $validated = $request->validate([
            'livestock' => 'required|array|min:1',
            'livestock.*.species_id' => 'required|exists:species,id',
            'livestock.*.male_count' => 'required|integer|min:0',
            'livestock.*.female_count' => 'required|integer|min:0',
        ], [], $this->vhcValidationAttributes());

        $vhc->livestock()->delete();

        foreach ($validated['livestock'] as $livestock) {
            $vhc->livestock()->create($livestock);
        }

        return redirect()->route('admin.vhc.show', $vhc)
            ->with('success', 'Livestock and poultry details updated successfully!');
    }

    /**
     * Add livestock to a VHC (Veterinary Health Card) record.
     */
    // Diri idugang ang livestock sa VHC record.
    public function vhcAddLivestock(Request $request, \App\Models\VhcRecord $vhc)
    {
        $validated = $request->validate([
            'species_id' => 'required|exists:species,id',
            'male_count' => 'required|integer|min:0',
            'female_count' => 'required|integer|min:0',
        ]);

        // Create a new livestock entry
        $vhc->livestock()->create($validated);

        return redirect()->route('admin.vhc.show', $vhc)
            ->with('success', 'Livestock added successfully!');
    }

    /**
     * Display a pet history (vaccines/treatments/vitamins) timeline.
     */
    // Diri ipakita ang medical history sa hayop.
    public function petHistory(Request $request, $clientId, $petId)
    {
        $client = User::where('role', 'client')->findOrFail($clientId);

        $pet = Animal::where('id', $petId)
            ->where('user_id', $client->id)
            ->with(['species.animalType', 'breed', 'animalRegistrations'])
            ->firstOrFail();

        $history = \App\Support\AnimalMedicalSummary::buildHistory($pet);

        $species = Species::orderBy('species_name')->get();
        $breeds = Breed::orderBy('breed_name')->get();

        return Inertia::render('Admin/PetHistory', [
            'client' => $client,
            'pet' => $pet,
            'history' => $history,
            'species' => $species,
            'breeds' => $breeds,
        ]);
    }
}
