<?php

use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('App.Models.User.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id;
});

Broadcast::channel('admin.appointments', function ($user) {
    return in_array($user->role, ['data_manager', 'budget_officer', 'owner', 'fieldman']);
});
