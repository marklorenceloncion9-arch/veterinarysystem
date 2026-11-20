import { usePage } from '@inertiajs/react';

// Diri ipakita ang ngalan ug photo sa budget user sa header.
export default function BudgetHeaderUser({ name, photoUrl, role = 'Budget Officer' }) {
    const { auth } = usePage().props;
    const displayName = name || auth?.user?.name || 'Budget Officer';
    const avatarUrl = photoUrl || auth?.user?.profile_photo_url || '';
    const initial = (displayName.trim().charAt(0) || 'B').toUpperCase();

    return (
        <div className="flex items-center gap-3 rounded-lg border border-line bg-canvas py-1.5 pl-1.5 pr-4">
            {avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="h-9 w-9 rounded-lg object-cover" />
            ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy text-sm font-bold text-white">
                    {initial}
                </span>
            )}
            <div className="hidden text-sm sm:block">
                <p className="font-semibold text-ink">{displayName}</p>
                <p className="text-xs text-teal">{role}</p>
            </div>
        </div>
    );
}
