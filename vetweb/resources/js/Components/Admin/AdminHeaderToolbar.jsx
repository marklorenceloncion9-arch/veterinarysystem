import { usePage } from '@inertiajs/react';
import AdminNotificationBell from '@/Components/Admin/AdminNotificationBell';

// Diri i-format ang role sa user para ipakita.
function formatRole(role) {
    if (!role) return 'Admin';
    return role
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

// Diri ang toolbar sa admin header nga naay user info.
export default function AdminHeaderToolbar({ className = '' }) {
    const { auth } = usePage().props;
    const user = auth?.user;
    const displayName = user?.name || 'Admin User';
    const roleLabel = formatRole(user?.role);
    const avatarUrl =
        user?.profile_photo_url ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=16324F&color=fff`;

    return (
        <div className={`flex items-center gap-3 ${className}`}>
            <AdminNotificationBell />
            <div className="flex items-center gap-3 rounded-lg border border-line bg-canvas py-1.5 pl-1.5 pr-4">
                <img
                    src={avatarUrl}
                    alt={displayName}
                    className="h-9 w-9 rounded-lg object-cover"
                />
                <div className="hidden text-sm sm:block">
                    <p className="font-semibold text-ink">{displayName}</p>
                    <p className="text-xs text-teal">{roleLabel}</p>
                </div>
            </div>
        </div>
    );
}
