<?php

use Illuminate\Foundation\Application;
use App\Http\Middleware\HandleInertiaRequests;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Console\Scheduling\Schedule;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withBroadcasting(
        __DIR__.'/../routes/channels.php',
        attributes: ['middleware' => ['web', 'api', \App\Http\Middleware\BroadcastAuthMiddleware::class]],
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->web(append: [
            HandleInertiaRequests::class,
        ]);
        $middleware->prepend([
            \App\Http\Middleware\CorsMiddleware::class,
        ]);
        $middleware->redirectGuestsTo(fn () => route('admin.login'));
        $middleware->validateCsrfTokens(except: [
            'admin/logout',
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->respond(function ($response, \Throwable $e, \Illuminate\Http\Request $request) {
            if ($response->getStatusCode() !== 419) {
                return $response;
            }

            if ($request->expectsJson() || $request->is('api/*')) {
                return response()->json([
                    'success' => false,
                    'message' => 'Your session expired. Please sign in again.',
                ], 419);
            }

            return redirect()
                ->route('admin.login')
                ->with('error', 'Your session expired. Please sign in again.');
        });
    })
    ->withSchedule(function (Schedule $schedule): void {
        $schedule->command('inventory:check-alerts')->dailyAt('08:00');
        $schedule->command('appointments:send-today-reminders')->dailyAt('07:00');
        $schedule->command('appointments:process-status')->dailyAt('00:05');
    })->create();
