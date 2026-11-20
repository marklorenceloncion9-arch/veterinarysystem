<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class BroadcastAuthMiddleware
{
    /**
     * Authenticate broadcasting requests from either the mobile bearer token
     * or the admin web session.
     */
    // Diri i-authenticate ang broadcast gamit token o session.
    public function handle(Request $request, Closure $next)
    {
        $token = $request->bearerToken();

        if ($token) {
            $user = User::where('remember_token', $token)->first();

            if ($user) {
                $request->setUserResolver(fn () => $user);

                return $next($request);
            }
        }

        if (Auth::check()) {
            return $next($request);
        }

        return response()->json(['message' => 'Unauthenticated.'], 403);
    }
}
