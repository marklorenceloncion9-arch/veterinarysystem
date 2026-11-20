<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class BlockFieldmanWebAccess
{
    /**
     * Fieldmen use the mobile app. A leftover web session is signed out.
     */
    // Diri pugngan ang fieldman nga mo-login sa web.
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && $user->role === 'fieldman') {
            Auth::logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return redirect()
                ->route('admin.login')
                ->withErrors([
                    'email' => 'Fieldman accounts can only sign in on the mobile app.',
                ]);
        }

        return $next($request);
    }
}
