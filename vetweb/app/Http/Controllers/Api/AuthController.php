<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\OtpCode;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Str;
use App\Mail\ClientRegistrationStatusMail;
use App\Services\ClientRegistrationNotificationService;
use App\Support\OwnerDisplayHelper;

class AuthController extends Controller
{
    /**
     * Login user and create token
     */
    // Diri ang login sa mobile app.
    public function login(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|email',
            'password' => 'required',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'error' => 'Validation failed',
                'messages' => $validator->errors()
            ], 422);
        }

        $user = User::where('email', $request->email)->first();

        if (!$user) {
            return response()->json([
                'success' => false,
                'error' => 'User not found'
            ], 401);
        }

        // Check if password setup is required (walk-in client with real email)
        // Check this BEFORE password validation so they get proper forgot password message
        if ($user->password_setup_required) {
            return response()->json([
                'success' => false,
                'walk_in_forgot_password_required' => true,
                'error' => 'This is a walk-in client account. Please use Forgot Password to set up your password.',
                'user' => [
                    'id' => $user->id,
                    'email' => $user->email,
                    'firstname' => $user->firstname,
                    'lastname' => $user->lastname,
                ]
            ], 403);
        }

        if (!Hash::check($request->password, $user->password)) {
            return response()->json([
                'success' => false,
                'error' => 'Invalid password',
            ], 401);
        }

        if ($user->role === 'client' && $user->approval_status === 'rejected') {
            return response()->json([
                'success' => false,
                'approval_rejected' => true,
                'error' => 'Your account registration was not approved because the details you provided did not match your ID or residence photo. Please register again with correct information and a matching document.',
            ], 403);
        }

        // Generate and store token in remember_token
        $token = Str::random(60);
        $user->remember_token = $token;
        $user->save();

        return response()->json([
            'success' => true,
            'password_setup_required' => false,
            'account_under_review' => $user->role === 'client' && $user->approval_status === 'pending',
            'user' => OwnerDisplayHelper::toAuthUserArray($user),
            'token' => $token
        ]);
    }

    /**
     * Check if an email is available for registration.
     */
    // Diri susihon kung available pa ang email.
    public function checkEmail(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|email',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'error' => 'Invalid email address',
            ], 422);
        }

        $email = strtolower(trim($request->email));
        $available = $this->isEmailAvailableForRegistration($email);

        return response()->json([
            'success' => true,
            'available' => $available,
            'message' => $available ? 'Email is available.' : 'This email is already registered.',
        ]);
    }

    /**
     * Check if a first and last name combination is available for registration.
     */
    // Diri susihon kung naa nay client nga parehas og ngalan.
    public function checkName(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'firstname' => 'required|string|max:255',
            'lastname' => 'required|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'error' => 'First name and last name are required.',
            ], 422);
        }

        $exists = $this->clientNameExists($request->firstname, $request->lastname);

        return response()->json([
            'success' => true,
            'available' => !$exists,
            'message' => $exists
                ? 'A client with this first and last name is already registered.'
                : 'Name is available.',
        ]);
    }

    /**
     * Register a new user
     */
    // Diri ang register sa bag-ong client sa mobile.
    public function register(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'email' => [
                'required',
                'string',
                'email',
                'max:255',
                function ($attribute, $value, $fail) {
                    if (!$this->isEmailAvailableForRegistration($value)) {
                        $fail('This email is already registered.');
                    }
                },
            ],
            'password' => 'required|string|min:6|confirmed',
            'firstname' => 'required|string|max:255',
            'lastname' => 'required|string|max:255',
            'middlename' => 'nullable|string|max:255',
            'age' => 'nullable|integer|min:1|max:120',
            'barangay_id' => 'nullable|exists:barangays,id',
            'zone' => 'nullable|string|max:50',
            'street' => 'required|string|max:255',
            'street_latitude' => 'nullable|numeric|between:-90,90',
            'street_longitude' => 'nullable|numeric|between:-180,180',
            'phone_number' => 'nullable|string|max:20',
            'facebook' => 'nullable|string|max:255',
            'id_document_url' => 'required|url|max:2048',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'error' => 'Validation failed',
                'messages' => $validator->errors()
            ], 422);
        }

        if ($this->clientNameExists($request->firstname, $request->lastname)) {
            return response()->json([
                'success' => false,
                'error' => 'A client with this first and last name is already registered.',
                'messages' => [
                    'firstname' => ['This first and last name combination is already registered.'],
                ],
            ], 422);
        }

        $email = strtolower(trim($request->email));
        User::where('email', $email)
            ->where('role', 'client')
            ->where('approval_status', 'rejected')
            ->delete();

        // Account is under review — client signs in manually after registration.
        $user = User::create([
            'name' => $request->name,
            'email' => $email,
            'password' => Hash::make($request->password),
            'firstname' => $request->firstname,
            'lastname' => $request->lastname,
            'middlename' => $request->middlename,
            'age' => $request->age,
            'barangay_id' => $request->barangay_id,
            'zone' => $request->zone,
            'street' => $request->street,
            'street_latitude' => $request->street_latitude,
            'street_longitude' => $request->street_longitude,
            'phone_number' => $request->phone_number,
            'facebook' => $request->facebook,
            'id_document_url' => $request->id_document_url,
            'role' => 'client',
            'approval_status' => 'pending',
            'remember_token' => null,
        ]);

        try {
            $recipientName = trim(($user->firstname ?? '') . ' ' . ($user->lastname ?? '')) ?: $user->name;
            Mail::to($user->email)->send(new ClientRegistrationStatusMail(
                $recipientName,
                'pending',
                "Thank you for registering with El Salvador Vet Clinic.\n\nYour account is under review. You can sign in to the VetMob app, add animals, and book appointments while we verify your ID or residence document. Your owner name will be marked as Under Review until approved. You will receive another email once your account status is updated.",
            ));
        } catch (\Throwable $e) {
            report($e);
        }

        try {
            ClientRegistrationNotificationService::notifyAdminsOfPendingRegistration($user);
        } catch (\Throwable $e) {
            report($e);
        }

        return response()->json([
            'success' => true,
            'pending_approval' => true,
            'account_under_review' => true,
            'message' => 'Registration submitted successfully. Your account is under review by El Salvador Vet Clinic. Please sign in to add animals and book appointments while waiting for approval.',
            'user' => OwnerDisplayHelper::toAuthUserArray($user),
        ], 201);
    }

    /**
     * Logout user (Clear remember_token)
     */
    // Diri ang pag-logout sa mobile app.
    public function logout(Request $request)
    {
        $user = $request->user();
        $user->remember_token = null;
        $user->save();

        return response()->json([
            'success' => true,
            'message' => 'Logged out successfully'
        ]);
    }

    /**
     * Claim walk-in account - set password for clients registered at clinic
     */
    // Diri i-claim sa client ang iyang account.
    public function claimAccount(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|email|exists:users,email',
            'password' => 'required|string|min:8|confirmed',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'error' => 'Validation failed',
                'messages' => $validator->errors()
            ], 422);
        }

        $user = User::where('email', $request->email)
            ->where('password_setup_required', true)
            ->first();

        if (!$user) {
            return response()->json([
                'success' => false,
                'error' => 'Account not found or already set up'
            ], 404);
        }

        // Update password and mark as set up
        $user->password = Hash::make($request->password);
        $user->password_setup_required = false;
        
        // Generate token
        $token = Str::random(60);
        $user->remember_token = $token;
        $user->save();

        return response()->json([
            'success' => true,
            'message' => 'Account set up successfully',
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'firstname' => $user->firstname,
                'lastname' => $user->lastname,
                'phone_number' => $user->phone_number,
                'role' => $user->role,
            ],
            'token' => $token
        ]);
    }

    /**
     * Send OTP to email for password reset or account claim
     */
    // Diri ipadala ang OTP sa email.
    public function sendOtp(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|email|exists:users,email',
            'purpose' => 'nullable|string|in:password_reset,account_claim',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'error' => 'Validation failed',
                'messages' => $validator->errors()
            ], 422);
        }

        $purpose = $request->input('purpose', 'password_reset');
        
        // Check if user exists
        $user = User::where('email', $request->email)->first();
        
        if (!$user) {
            return response()->json([
                'success' => false,
                'error' => 'User not found'
            ], 404);
        }

        // For account claim, verify user needs password setup
        if ($purpose === 'account_claim' && !$user->password_setup_required) {
            return response()->json([
                'success' => false,
                'error' => 'Account is already set up'
            ], 400);
        }

        // Generate OTP
        $otp = OtpCode::createForEmail($request->email, $purpose, 10);

        // Send email with OTP
        try {
            Mail::to($request->email)->send(new \App\Mail\OtpMail($otp->code, $purpose));
            
            return response()->json([
                'success' => true,
                'message' => 'OTP sent successfully',
                'expires_in' => 600, // 10 minutes in seconds
            ]);
        } catch (\Exception $e) {
            // If email fails, still return OTP for testing
            \Log::error('Failed to send OTP email: ' . $e->getMessage());
            
            return response()->json([
                'success' => true,
                'message' => 'OTP generated (email failed - check config)',
                'otp' => $otp->code, // Return OTP for testing
                'expires_in' => 600,
                'email_error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Verify OTP
     */
    // Diri susihon kung sakto ang OTP.
    public function verifyOtp(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|email',
            'code' => 'required|string|size:6',
            'purpose' => 'nullable|string|in:password_reset,account_claim',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'error' => 'Validation failed',
                'messages' => $validator->errors()
            ], 422);
        }

        $purpose = $request->input('purpose', 'password_reset');
        
        $otp = OtpCode::verify($request->email, $request->code, $purpose);

        if (!$otp) {
            return response()->json([
                'success' => false,
                'error' => 'Invalid or expired OTP'
            ], 400);
        }

        return response()->json([
            'success' => true,
            'message' => 'OTP verified successfully',
            'verified' => true,
        ]);
    }

    /**
     * Reset password with OTP
     */
    // Diri i-reset ang password gamit ang OTP.
    public function resetPasswordWithOtp(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|email|exists:users,email',
            'code' => 'required|string|size:6',
            'password' => 'required|string|min:8|confirmed',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'error' => 'Validation failed',
                'messages' => $validator->errors()
            ], 422);
        }

        // Verify OTP first
        $otp = OtpCode::verify($request->email, $request->code, 'password_reset');

        if (!$otp) {
            return response()->json([
                'success' => false,
                'error' => 'Invalid or expired OTP'
            ], 400);
        }

        // Update password and clear password_setup_required for walk-in clients
        $user = User::where('email', $request->email)->first();
        $user->password = Hash::make($request->password);
        $user->password_setup_required = false; // Clear the walk-in flag
        $user->save();

        // Mark OTP as used
        $otp->markAsUsed();

        return response()->json([
            'success' => true,
            'message' => 'Password reset successfully',
        ]);
    }

    /**
     * Claim account with OTP (for walk-in clients)
     */
    // Diri i-claim ang account gamit ang OTP.
    public function claimAccountWithOtp(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|email|exists:users,email',
            'code' => 'required|string|size:6',
            'password' => 'required|string|min:8|confirmed',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'error' => 'Validation failed',
                'messages' => $validator->errors()
            ], 422);
        }

        // Verify OTP first
        $otp = OtpCode::verify($request->email, $request->code, 'account_claim');

        if (!$otp) {
            return response()->json([
                'success' => false,
                'error' => 'Invalid or expired OTP'
            ], 400);
        }

        $user = User::where('email', $request->email)
            ->where('password_setup_required', true)
            ->first();

        if (!$user) {
            return response()->json([
                'success' => false,
                'error' => 'Account not found or already set up'
            ], 404);
        }

        // Update password and mark as set up
        $user->password = Hash::make($request->password);
        $user->password_setup_required = false;
        
        // Generate token
        $token = Str::random(60);
        $user->remember_token = $token;
        $user->save();

        // Mark OTP as used
        $otp->markAsUsed();

        return response()->json([
            'success' => true,
            'message' => 'Account set up successfully',
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'firstname' => $user->firstname,
                'lastname' => $user->lastname,
                'phone_number' => $user->phone_number,
                'role' => $user->role,
            ],
            'token' => $token
        ]);
    }

    // Diri limpyohan ang bahin sa ngalan para ikumpara.
    private function normalizeNamePart(?string $value): string
    {
        return strtolower(trim(preg_replace('/\s+/', ' ', $value ?? '')));
    }

    // Diri susihon kung naa nay client nga ingon ani og ngalan.
    private function clientNameExists(string $firstname, string $lastname): bool
    {
        $first = $this->normalizeNamePart($firstname);
        $last = $this->normalizeNamePart($lastname);

        if ($first === '' || $last === '') {
            return false;
        }

        return User::where('role', 'client')
            ->whereIn('approval_status', ['pending', 'approved'])
            ->whereRaw('LOWER(TRIM(firstname)) = ?', [$first])
            ->whereRaw('LOWER(TRIM(lastname)) = ?', [$last])
            ->exists();
    }

    // Diri susihon kung magamit pa ang email sa pag-register.
    private function isEmailAvailableForRegistration(string $email): bool
    {
        $email = strtolower(trim($email));
        $user = User::where('email', $email)->first();

        if (!$user) {
            return true;
        }

        return $user->role === 'client' && $user->approval_status === 'rejected';
    }
}
