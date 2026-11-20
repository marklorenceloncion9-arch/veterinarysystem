<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;

class TokenAuthMiddleware
{
    /**
     * Handle an incoming request.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  \Closure  $next
     * @return mixed
     */
    // Diri i-authenticate ang mobile user gamit ang bearer token.
    public function handle(Request $request, Closure $next)
    {
        try {
            $token = $request->bearerToken();
            Log::info('TokenAuthMiddleware: Token received', ['token_length' => strlen($token ?? '')]);

            if (!$token) {
                return response()->json([
                    'success' => false,
                    'error' => 'Unauthorized - No token provided'
                ], 401);
            }

            $user = User::where('remember_token', $token)->first();
            Log::info('TokenAuthMiddleware: User lookup result', ['user_found' => $user ? 'Yes' : 'No']);

            if (!$user) {
                return response()->json([
                    'success' => false,
                    'error' => 'Unauthorized - Invalid token'
                ], 401);
            }

            if ($user->role === 'client' && $user->approval_status === 'rejected') {
                return response()->json([
                    'success' => false,
                    'approval_rejected' => true,
                    'error' => 'The account you created did not match the photo you provided. Please register again with correct information and a matching ID or residence document.',
                ], 403);
            }

            // Set the authenticated user on the request and Auth facade.
            Auth::setUser($user);
            $request->setUserResolver(function () use ($user) {
                return $user;
            });

            Log::info('TokenAuthMiddleware: Authentication successful, proceeding to next middleware');
            return $next($request);
        } catch (\Exception $e) {
            \Log::error('TokenAuthMiddleware error', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            
            return response()->json([
                'success' => false,
                'error' => 'Authentication error: ' . $e->getMessage()
            ], 500);
        }
    }
}
