<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use App\Models\User;
use App\Models\Animal;
use App\Models\Appointment;
use App\Models\Barangay;
use App\Models\Zone;
use App\Models\PetRegistration;
use App\Models\PaymentType;
use App\Models\Inventory;
use App\Models\InventoryLog;
use App\Models\Medicine;
use App\Support\InventoryAlertHelper;
use App\Support\StaffNameFormatter;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class AuthController extends Controller
{
    /**
     * Show the admin login form.
     */
    // Diri ipakita ang login page sa admin.
    public function showLoginForm()
    {
        return Inertia::render('Auth/Login', [
            'barangays' => Barangay::orderBy('name')->get(['id', 'name']),
        ]);
    }

    /**
     * Handle an admin login request.
     */
    // Diri ang login sa admin ug staff.
    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required'],
        ]);

        $user = User::where('email', $credentials['email'])->first();

        \Log::info('Admin login attempt', [
            'email' => $credentials['email'],
            'user_found' => !!$user,
            'user_role' => $user?->role,
        ]);

        if (!$user || !Hash::check($credentials['password'], $user->password)) {
            \Log::warning('Admin login failed - invalid credentials', ['email' => $credentials['email']]);
            return back()->withErrors([
                'email' => 'Invalid credentials. Please check your email and password.',
            ])->onlyInput('email');
        }

        if ($user->role === 'fieldman') {
            \Log::warning('Admin login failed - fieldman web login blocked', ['email' => $credentials['email']]);
            return back()->withErrors([
                'email' => 'Fieldman accounts can only sign in on the mobile app.',
            ])->onlyInput('email');
        }

        // Check if user has an admin/staff role.
        if (!in_array($user->role, ['data_manager', 'budget_officer', 'owner'])) {
            \Log::warning('Admin login failed - invalid role', ['email' => $credentials['email'], 'role' => $user->role]);
            return back()->withErrors([
                'email' => 'You do not have permission to access the admin panel.',
            ])->onlyInput('email');
        }

        if (Auth::attempt($credentials)) {
            $request->session()->regenerate();

            // Redirect based on role
            if ($user->role === 'budget_officer') {
                return redirect()->intended('/budget/dashboard');
            }

            return redirect()->intended('/admin/dashboard');
        }

        return back()->withErrors([
            'email' => 'Invalid credentials. Please check your email and password.',
        ])->onlyInput('email');
    }

    /**
     * Handle an admin logout request.
     */
    // Diri ang pag-logout sa admin.
    public function logout(Request $request)
    {
        Auth::logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect('/admin/login');
    }

    /**
     * Generate API token for the authenticated user
     */
    // Diri kuhaon o himuon ang API token sa user.
    public function getApiToken(Request $request)
    {
        if (!$request->user()) {
            return response()->json([
                'success' => false,
                'error' => 'Unauthorized'
            ], 401);
        }

        // Revoke previous admin tokens for this user to avoid stale token reuse
        $request->user()->tokens()->where('name', 'admin-token')->delete();

        $token = $request->user()->createToken('admin-token')->plainTextToken;

        return response()->json([
            'success' => true,
            'token' => $token,
            'user' => $request->user()
        ]);
    }

    /**
     * Public staff registration was removed from the login page.
     */
    // Diri ang register sa admin nga account.
    public function register(Request $request)
    {
        return back()->with('error', 'Staff accounts are added from the admin profile.');
    }

    /**
     * Show the admin dashboard.
     */
    // Diri ipakita ang dashboard sa admin.
    public function dashboard()
    {
        $now = Carbon::now();
        $monthStart = $now->copy()->startOfMonth();
        $monthEnd = $now->copy()->endOfMonth();

        $stats = [
            'totalClients' => User::where('role', 'client')->count(),
            'totalPets' => Animal::whereNull('archived_at')->count(),
            'totalRevenue' => (float) PetRegistration::where('status', 'paid')->sum('amount'),
            'registeredPets' => PetRegistration::where('status', 'paid')->count(),
            'pendingClients' => User::where('role', 'client')->where('approval_status', 'pending')->count(),
            // Same animals the Pending page lists: pets of owners still waiting for approval.
            'pendingAnimals' => Animal::query()
                ->active()
                ->whereHas('user', fn ($user) => $user->where('role', 'client')->where('approval_status', 'pending'))
                ->count(),
            'appointmentsThisMonth' => Appointment::whereBetween('booking_date', [$monthStart, $monthEnd])->count(),
            'completedAppointments' => Appointment::where('status', 'completed')->count(),
            'appointmentsToday' => Appointment::whereDate('booking_date', $now->toDateString())
                ->whereNotIn('status', ['cancelled', 'rejected'])
                ->count(),
        ];

        $registrationFee = PaymentType::getAmount('pet_registration');

        return Inertia::render('Admin/Dashboard', [
            'stats' => $stats,
            'todaySchedule' => $this->buildTodaySchedule(),
            'registrationFee' => $registrationFee,
        ]);
    }

    /**
     * Analytics payload for the admin dashboard charts.
     */
    // Diri himuon ang data sa mga chart sa admin dashboard.
    private function buildAdminDashboardCharts(): array
    {
        $clientsByBarangay = Barangay::query()
            ->withCount(['users as client_count' => function ($query) {
                $query->where('role', 'client');
            }])
            ->orderByDesc('client_count')
            ->orderBy('name')
            ->get(['id', 'name'])
            ->map(function ($barangay) {
                $name = $barangay->name;

                return [
                    'name' => $name,
                    'short_name' => strlen($name) > 22 ? substr($name, 0, 20) . '…' : $name,
                    'count' => (int) $barangay->client_count,
                ];
            })
            ->values()
            ->all();

        $appointmentStatusLabels = [
            'pending' => 'Pending',
            'approved' => 'Approved',
            'processing' => 'Processing',
            'ongoing' => 'Ongoing',
            'completed' => 'Completed',
            'cancelled' => 'Cancelled',
            'rejected' => 'Rejected',
        ];

        $appointmentStatusColors = [
            'pending' => '#f59e0b',
            'approved' => '#3b82f6',
            'processing' => '#8b5cf6',
            'ongoing' => '#6366f1',
            'completed' => '#059669',
            'cancelled' => '#ef4444',
            'rejected' => '#dc2626',
        ];

        $appointmentStatus = Appointment::query()
            ->select('status', DB::raw('COUNT(*) as count'))
            ->groupBy('status')
            ->orderByDesc('count')
            ->get()
            ->map(function ($row) use ($appointmentStatusLabels, $appointmentStatusColors) {
                $status = (string) $row->status;

                return [
                    'status' => $status,
                    'label' => $appointmentStatusLabels[$status] ?? ucfirst($status),
                    'count' => (int) $row->count,
                    'color' => $appointmentStatusColors[$status] ?? '#94a3b8',
                ];
            })
            ->values()
            ->all();

        $petSpecies = Animal::query()
            ->whereNull('archived_at')
            ->join('species', 'animals.species_id', '=', 'species.id')
            ->select('species.species_name as name', DB::raw('COUNT(*) as count'))
            ->groupBy('species.species_name')
            ->orderByDesc('count')
            ->limit(8)
            ->get()
            ->map(fn ($row) => [
                'name' => $row->name,
                'count' => (int) $row->count,
            ])
            ->values()
            ->all();

        $speciesColors = ['#7c3aed', '#3b82f6', '#059669', '#f59e0b', '#ec4899', '#06b6d4', '#84cc16', '#f97316'];

        $petSpecies = array_map(function ($item, $index) use ($speciesColors) {
            $item['color'] = $speciesColors[$index % count($speciesColors)];

            return $item;
        }, $petSpecies, array_keys($petSpecies));

        return [
            'clients_by_barangay' => $clientsByBarangay,
            // 12 months so the dashboard can switch between 3, 6 and 12 month views.
            'monthly_appointments' => $this->buildMonthlyDashboardSeries(12, function (Carbon $start, Carbon $end) {
                return Appointment::whereBetween('booking_date', [$start, $end])->count();
            }),
            'monthly_revenue' => $this->buildMonthlyDashboardSeries(12, function (Carbon $start, Carbon $end) {
                return (float) PetRegistration::where('status', 'paid')
                    ->whereBetween('paid_at', [$start, $end])
                    ->sum('amount');
            }),
            'monthly_client_registrations' => $this->buildMonthlyDashboardSeries(12, function (Carbon $start, Carbon $end) {
                return User::where('role', 'client')
                    ->whereBetween('created_at', [$start, $end])
                    ->count();
            }),
            'daily_appointments' => $this->buildDailyAppointmentSeries(30),
            'weekday_appointments' => $this->buildWeekdayAppointmentSeries(),
            'top_services' => $this->buildTopServices(),
            'appointment_types' => $this->buildAppointmentTypeBreakdown(),
            'appointment_status' => $appointmentStatus,
            'pet_species' => $petSpecies,
        ];
    }

    // Diri ihapon kung unsa nga adlaw sa semana ang pinakadaghan og booking (katapusang 12 ka bulan).
    private function buildWeekdayAppointmentSeries(): array
    {
        $perDay = Appointment::query()
            ->whereBetween('booking_date', [Carbon::today()->subMonths(12)->toDateString(), Carbon::today()->toDateString()])
            ->whereNotIn('status', ['cancelled', 'rejected'])
            ->select(DB::raw('DATE(booking_date) as day'), DB::raw('COUNT(*) as total'))
            ->groupBy('day')
            ->pluck('total', 'day');

        $totals = array_fill(0, 7, 0);
        foreach ($perDay as $day => $total) {
            $totals[Carbon::parse($day)->dayOfWeek] += (int) $total;
        }

        // Monday first, because that is how the clinic week reads.
        $order = [1, 2, 3, 4, 5, 6, 0];
        $names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        return array_map(fn ($dow) => [
            'label' => substr($names[$dow], 0, 3),
            'full_label' => $names[$dow],
            'value' => $totals[$dow],
        ], $order);
    }

    // Diri kuhaon ang mga serbisyo nga pinakadaghan og booking.
    private function buildTopServices(): array
    {
        return DB::table('booking_services')
            ->join('bookings', 'bookings.id', '=', 'booking_services.booking_id')
            ->join('services', 'services.id', '=', 'booking_services.service_type_id')
            ->whereNotIn('bookings.status', ['cancelled', 'rejected'])
            ->select('services.type_name as name', DB::raw('COUNT(*) as count'))
            ->groupBy('services.id', 'services.type_name')
            ->orderByDesc('count')
            ->limit(8)
            ->get()
            ->map(fn ($row) => [
                'name' => (string) $row->name,
                'count' => (int) $row->count,
            ])
            ->values()
            ->all();
    }

    // Diri himuon ang adlaw-adlaw nga ihap sa appointments para sa chart.
    private function buildDailyAppointmentSeries(int $days): array
    {
        $start = Carbon::today()->subDays($days - 1);

        $counts = Appointment::query()
            ->whereBetween('booking_date', [$start->toDateString(), Carbon::today()->toDateString()])
            ->whereNotIn('status', ['cancelled', 'rejected'])
            ->select(DB::raw('DATE(booking_date) as day'), DB::raw('COUNT(*) as total'))
            ->groupBy('day')
            ->pluck('total', 'day');

        $series = [];
        for ($i = 0; $i < $days; $i++) {
            $date = $start->copy()->addDays($i);
            $key = $date->toDateString();

            $series[] = [
                'label' => $date->format('j'),
                'full_label' => $date->format('D, M j'),
                'date' => $key,
                'value' => (int) ($counts[$key] ?? 0),
            ];
        }

        return $series;
    }

    // Diri ihapon ang appointments matag klase (clinic, walk-in, home service).
    private function buildAppointmentTypeBreakdown(): array
    {
        $labels = [
            'appointment' => 'Clinic appointment',
            'walk_in' => 'Walk-in',
            'home_service' => 'Home service',
        ];
        $colors = [
            'appointment' => '#16324f',
            'walk_in' => '#1f7a8c',
            'home_service' => '#d99a00',
        ];

        return Appointment::query()
            ->whereNotIn('status', ['cancelled', 'rejected'])
            ->select('booking_type', DB::raw('COUNT(*) as total'))
            ->groupBy('booking_type')
            ->get()
            ->map(fn ($row) => [
                'type' => (string) $row->booking_type,
                'label' => $labels[$row->booking_type] ?? ucfirst(str_replace('_', ' ', (string) $row->booking_type)),
                'count' => (int) $row->total,
                'color' => $colors[$row->booking_type] ?? '#94a3b8',
            ])
            ->sortByDesc('count')
            ->values()
            ->all();
    }

    // Diri kuhaon ang mga appointment karong adlawa para sa schedule list.
    private function buildTodaySchedule(): array
    {
        return Appointment::query()
            ->with(['user', 'animal'])
            ->whereDate('booking_date', Carbon::today())
            ->whereIn('booking_type', ['appointment', 'home_service'])
            ->whereNotIn('status', ['cancelled', 'rejected'])
            ->orderBy('booking_time')
            ->get()
            ->map(function ($booking) {
                $time = $booking->booking_time ? substr((string) $booking->booking_time, 0, 5) : null;
                $client = $booking->user;
                $clientName = $client
                    ? (trim(($client->firstname ?? '') . ' ' . ($client->lastname ?? '')) ?: ($client->name ?: 'Client'))
                    : 'Client';

                return [
                    'id' => $booking->id,
                    'time' => $time ? Carbon::createFromFormat('H:i', $time)->format('g:i A') : 'No time',
                    'pet' => $booking->petNamesLabel('Pet'),
                    'client' => $clientName,
                    'status' => (string) $booking->status,
                    'type' => (string) $booking->booking_type,
                ];
            })
            ->values()
            ->all();
    }

    /**
     * @param  callable(Carbon, Carbon): (int|float)  $counter
     */
    // Diri himuon ang binulan nga ihap para sa chart.
    private function buildMonthlyDashboardSeries(int $months, callable $counter): array
    {
        $series = [];

        for ($offset = $months - 1; $offset >= 0; $offset--) {
            $date = Carbon::now()->subMonths($offset);
            $start = $date->copy()->startOfMonth();
            $end = $date->copy()->endOfMonth();

            $series[] = [
                'label' => $date->format('M'),
                'full_label' => $date->format('M Y'),
                'month' => $date->format('Y-m'),
                'value' => $counter($start, $end),
            ];
        }

        return $series;
    }

    /**
     * Show the admin profile page.
     */
    // Diri ipakita ang settings page sa admin.
    public function settings()
    {
        $user = Auth::user()?->loadMissing('barangay');

        return Inertia::render('Admin/Settings', $this->staffProfilePageProps($user, includeStaffAccounts: true));
    }

    /**
     * Show the budget officer's own profile page.
     */
    // Diri ipakita ang profile page sa budget officer.
    public function budgetProfile()
    {
        $user = Auth::user()?->loadMissing('barangay');

        if (!$user || $user->role !== 'budget_officer') {
            abort(403, 'Only budget officers can access this profile.');
        }

        return Inertia::render('budget/Profile', $this->staffProfilePageProps($user, includeStaffAccounts: false));
    }

    /**
     * Create a fieldman account. Budget officers are edited, not created here.
     */
    // Diri i-save ang bag-ong staff account.
    public function storeStaff(Request $request)
    {
        $actor = $request->user();

        if (!$actor || !in_array($actor->role, ['data_manager', 'owner'], true)) {
            return back()->with('error', 'You do not have permission to create staff accounts.');
        }

        $validated = $request->validate([
            'firstname' => 'required|string|max:255',
            'lastname' => 'required|string|max:255',
            'middlename' => 'nullable|string|max:255',
            'age' => 'required|integer|min:1|max:120',
            'phone_number' => ['nullable', 'regex:/^09\d{9}$/'],
            'barangay_id' => 'required|exists:barangays,id',
            'zone' => 'nullable|string|max:255',
            'facebook' => 'nullable|string|max:255',
            'email' => 'required|email|max:255|unique:users,email',
            'password' => 'required|string|min:8|confirmed',
        ]);

        $zoneError = $this->zoneErrorForBarangay($validated['barangay_id'], $validated['zone'] ?? null);
        if ($zoneError) {
            return back()->withErrors(['zone' => $zoneError])->withInput();
        }

        $validated = $this->blankStaffFieldsToNull($validated);
        $validated['name'] = trim($validated['firstname'] . ' ' . $validated['lastname']);
        $validated['role'] = 'fieldman';
        $validated['email_verified_at'] = now();
        $validated['approval_status'] = 'approved';

        User::create($validated);

        return back()->with('success', 'Fieldman account created successfully.');
    }

    /**
     * Update an existing budget officer. Fieldmen are created, not edited here.
     */
    // Diri usbon ang detalye sa staff account.
    public function updateStaff(Request $request, User $staff)
    {
        $actor = $request->user();

        if (!$actor || !in_array($actor->role, ['data_manager', 'owner'], true)) {
            return back()->with('error', 'You do not have permission to edit staff accounts.');
        }

        if ($staff->role !== 'budget_officer') {
            return back()->with('error', 'Only budget officer accounts can be edited here.');
        }

        $validated = $request->validate([
            'firstname' => 'required|string|max:255',
            'lastname' => 'required|string|max:255',
            'middlename' => 'nullable|string|max:255',
            'age' => 'required|integer|min:1|max:120',
            'phone_number' => ['nullable', 'regex:/^09\d{9}$/'],
            'barangay_id' => 'required|exists:barangays,id',
            'zone' => 'nullable|string|max:255',
            'facebook' => 'nullable|string|max:255',
            'email' => 'required|email|max:255|unique:users,email,' . $staff->id,
            'password' => 'nullable|string|min:8|confirmed',
        ]);

        $zoneError = $this->zoneErrorForBarangay($validated['barangay_id'], $validated['zone'] ?? null);
        if ($zoneError) {
            return back()->withErrors(['zone' => $zoneError])->withInput();
        }

        $validated = $this->blankStaffFieldsToNull($validated);
        $validated['name'] = trim($validated['firstname'] . ' ' . $validated['lastname']);

        if (empty($validated['password'])) {
            unset($validated['password']);
        }

        $staff->update($validated);

        return back()->with('success', 'Budget officer account updated.');
    }

    /**
     * Update the signed-in admin's own profile.
     */
    // Diri usbon ang profile sa naka-login nga staff.
    public function updateProfile(Request $request)
    {
        $user = $request->user();

        if (!$user) {
            return back()->with('error', 'You must be signed in to update your profile.');
        }

        $validated = $request->validate([
            'firstname' => 'required|string|max:255',
            'lastname' => 'required|string|max:255',
            'middlename' => 'nullable|string|max:255',
            'age' => 'nullable|integer|min:1|max:120',
            'email' => 'required|email|max:255|unique:users,email,' . $user->id,
            'phone_number' => ['nullable', 'regex:/^09\d{9}$/'],
            'facebook' => 'nullable|string|max:255',
            'barangay_id' => 'nullable|exists:barangays,id',
            'zone' => 'nullable|string|max:255',
            'profile_photo_url' => 'nullable|url|max:2048',
            'password' => 'nullable|string|min:8|confirmed',
        ]);

        foreach (['middlename', 'age', 'phone_number', 'facebook', 'barangay_id', 'zone', 'profile_photo_url'] as $field) {
            if (array_key_exists($field, $validated) && $validated[$field] === '') {
                $validated[$field] = null;
            }
        }

        $validated['name'] = trim($validated['firstname'] . ' ' . $validated['lastname']);

        if (empty($validated['password'])) {
            unset($validated['password']);
        }

        $user->update($validated);

        return back()->with('success', 'Profile updated successfully.');
    }

    /**
     * Update the signed-in budget officer's own profile.
     */
    // Diri usbon ang profile sa budget officer.
    public function updateBudgetProfile(Request $request)
    {
        $user = $request->user();

        if (!$user || $user->role !== 'budget_officer') {
            return back()->with('error', 'You do not have permission to update this profile.');
        }

        return $this->updateProfile($request);
    }

    /**
     * Shared profile page props for admin and budget officer.
     */
    // Diri andamon ang props sa staff profile page.
    private function staffProfilePageProps(?User $user, bool $includeStaffAccounts = false): array
    {
        $props = [
            'profile' => $user ? [
                'id' => $user->id,
                'firstname' => $user->firstname ?? '',
                'middlename' => $user->middlename ?? '',
                'lastname' => $user->lastname ?? '',
                'name' => StaffNameFormatter::displayName($user),
                'age' => $user->age,
                'email' => $user->email ?? '',
                'phone_number' => $user->phone_number ?? '',
                'facebook' => $user->facebook ?? '',
                'barangay_id' => $user->barangay_id,
                'barangay' => $user->barangay?->name,
                'zone' => $user->zone ?? '',
                'role' => $user->role,
                'profile_photo_url' => $user->profile_photo_url,
                'created_at' => optional($user->created_at)?->toDateTimeString(),
            ] : null,
            'barangays' => Barangay::orderBy('name')->get(['id', 'name'])->values(),
            'zones' => Zone::orderByRaw(Zone::NATURAL_ORDER)
                ->get(['id', 'barangay_id', 'name'])
                ->map(fn (Zone $zone) => [
                    'id' => $zone->id,
                    'barangay_id' => $zone->barangay_id,
                    'name' => $zone->name,
                ])
                ->values(),
        ];

        if ($includeStaffAccounts) {
            $props['staffAccounts'] = User::query()
                ->whereIn('role', ['budget_officer', 'fieldman'])
                ->with('barangay:id,name')
                ->orderBy('role')
                ->orderBy('lastname')
                ->orderBy('firstname')
                ->get()
                ->map(fn (User $staff) => $this->staffAccountPayload($staff))
                ->values();
        }

        return $props;
    }

    // Diri i-format ang data sa usa ka staff account.
    private function staffAccountPayload(User $staff): array
    {
        return [
            'id' => $staff->id,
            'firstname' => $staff->firstname ?? '',
            'middlename' => $staff->middlename ?? '',
            'lastname' => $staff->lastname ?? '',
            'name' => StaffNameFormatter::displayName($staff),
            'age' => $staff->age,
            'email' => $staff->email ?? '',
            'phone_number' => $staff->phone_number ?? '',
            'facebook' => $staff->facebook ?? '',
            'barangay_id' => $staff->barangay_id,
            'barangay' => $staff->barangay?->name,
            'zone' => $staff->zone ?? '',
            'role' => $staff->role,
            'profile_photo_url' => $staff->profile_photo_url,
            'created_at' => optional($staff->created_at)?->toDateTimeString(),
        ];
    }

    // Diri himuong null ang mga blangko nga field sa staff.
    private function blankStaffFieldsToNull(array $validated): array
    {
        foreach (['middlename', 'phone_number', 'facebook', 'zone'] as $field) {
            if (array_key_exists($field, $validated) && $validated[$field] === '') {
                $validated[$field] = null;
            }
        }

        return $validated;
    }

    // Diri susihon kung sakto ang zone sa barangay.
    private function zoneErrorForBarangay($barangayId, ?string $zone): ?string
    {
        if (!$barangayId) {
            return null;
        }

        $hasZones = Zone::where('barangay_id', $barangayId)->exists();
        if ($hasZones && ($zone === null || trim($zone) === '')) {
            return 'Select a zone for this barangay.';
        }

        return null;
    }

    /**
     * Show the budget officer dashboard.
     */
    // Diri ipakita ang dashboard sa budget officer.
    public function budgetDashboard()
    {
        $inventorySnapshot = $this->buildBudgetInventorySnapshot();

        return Inertia::render('budget/budget_dashboard', [
            'inventoryOverview' => $inventorySnapshot['overview'],
            'stockMovement' => $inventorySnapshot['movement'],
            'attentionItems' => $inventorySnapshot['attention'],
        ]);
    }

    /**
     * Stock status counts, 30-day movement, and medicines needing attention.
     */
    // Diri himuon ang summary sa stock para sa budget dashboard.
    private function buildBudgetInventorySnapshot(): array
    {
        $batchesByMedicine = Inventory::with(['medicine', 'unit'])
            ->get()
            ->groupBy('medicine_id');

        $statusCounts = [
            'good' => 0,
            'low_stock' => 0,
            'out_of_stock' => 0,
            'expired' => 0,
            'expiring' => 0,
        ];

        $usableOnHand = 0.0;
        $attention = [];

        $medicines = Medicine::with('category')->orderBy('name')->get();

        foreach ($medicines as $medicine) {
            $medicineBatches = $batchesByMedicine->get($medicine->id, collect());
            $stockBatches = $medicineBatches->filter(fn ($b) => (float) $b->quantity > 0);
            $activeBatches = $stockBatches->filter(
                fn ($b) => !InventoryAlertHelper::isBatchExpired($b)
            );
            $expiredBatches = $stockBatches->filter(
                fn ($b) => InventoryAlertHelper::isBatchExpired($b)
            );
            $hasExpiringSoon = $activeBatches->contains(
                fn ($b) => InventoryAlertHelper::isBatchExpiringSoon($b)
            );

            $onHand = (float) $activeBatches->sum(fn ($b) => (float) $b->quantity);
            $expiredOnHand = (float) $expiredBatches->sum(fn ($b) => (float) $b->quantity);
            $onHandDisplay = InventoryAlertHelper::displayWholeUnits($onHand);
            $usableOnHand += $onHand;

            $latestBatch = $medicineBatches->sortByDesc('created_at')->first();
            $unitName = $latestBatch?->unit?->name ?? 'units';
            $nearestExpiry = $activeBatches->pluck('expiration_date')->filter()->sort()->first()
                ?? $stockBatches->pluck('expiration_date')->filter()->sort()->first();
            $viewBatchId = $activeBatches->sortBy('expiration_date')->first()?->id
                ?? $expiredBatches->sortBy('expiration_date')->first()?->id
                ?? $latestBatch?->id;

            if ($onHand <= 0 && $expiredOnHand > 0) {
                $status = 'Expired';
                $statusCounts['expired']++;
            } elseif ($onHand <= 0) {
                $status = 'Out of stock';
                $statusCounts['out_of_stock']++;
            } elseif ($onHandDisplay <= InventoryAlertHelper::lowStockThreshold()) {
                $status = 'Low stock';
                $statusCounts['low_stock']++;
            } elseif ($hasExpiringSoon) {
                $status = 'Expiring';
                $statusCounts['expiring']++;
            } else {
                $status = 'Good';
                $statusCounts['good']++;
            }

            if ($status !== 'Good') {
                $attention[] = [
                    'medicine_id' => (int) $medicine->id,
                    'medicine_name' => $medicine->name,
                    'category' => $medicine->category?->name ?? 'Uncategorized',
                    'status' => $status,
                    'on_hand' => $onHandDisplay,
                    'unit' => $unitName,
                    'nearest_expiry' => $nearestExpiry?->format('Y-m-d'),
                    'inventory_id' => $viewBatchId ? (int) $viewBatchId : null,
                ];
            }
        }

        $priority = [
            'Out of stock' => 0,
            'Expired' => 1,
            'Low stock' => 2,
            'Expiring' => 3,
        ];

        usort($attention, function (array $a, array $b) use ($priority) {
            $diff = ($priority[$a['status']] ?? 9) <=> ($priority[$b['status']] ?? 9);
            if ($diff !== 0) {
                return $diff;
            }

            return strcmp($a['medicine_name'], $b['medicine_name']);
        });

        return [
            'overview' => [
                'medicines' => $medicines->count(),
                'usable_on_hand' => InventoryAlertHelper::displayWholeUnits($usableOnHand),
                'status_counts' => $statusCounts,
            ],
            'movement' => $this->buildStockMovementLast30Days(),
            'attention' => array_slice($attention, 0, 10),
        ];
    }

    /**
     * Daily stock-in vs stock-out totals for the last 30 days.
     */
    // Diri kuhaon ang stock in ug out sa miaging 30 ka adlaw.
    private function buildStockMovementLast30Days(): array
    {
        $start = now()->subDays(29)->startOfDay();
        $days = [];

        for ($i = 0; $i < 30; $i++) {
            $day = $start->copy()->addDays($i);
            $key = $day->format('Y-m-d');
            $days[$key] = [
                'date' => $key,
                'label' => $day->format('M j'),
                'in' => 0.0,
                'out' => 0.0,
            ];
        }

        $logs = InventoryLog::with('inventory')
            ->where('created_at', '>=', $start)
            ->get();

        foreach ($logs as $log) {
            $key = Carbon::parse($log->created_at)->format('Y-m-d');
            if (!isset($days[$key])) {
                continue;
            }

            $qty = abs((float) $log->change_qty);
            $inventory = $log->inventory;

            if ($inventory) {
                if ($inventory->isVial() && (float) $inventory->volume_ml > 0) {
                    $qty = $qty / (float) $inventory->volume_ml;
                } elseif ($inventory->isBox() && (float) $inventory->items_per_box > 0) {
                    $qty = $qty / (float) $inventory->items_per_box;
                }
            }

            if (strtolower((string) $log->type) === 'in') {
                $days[$key]['in'] += $qty;
            } else {
                $days[$key]['out'] += $qty;
            }
        }

        return array_values(array_map(function (array $day) {
            return [
                'date' => $day['date'],
                'label' => $day['label'],
                'in' => round($day['in'], 2),
                'out' => round($day['out'], 2),
            ];
        }, $days));
    }
}
