// Diri kuhaon ang tibuok ngalan sa tag-iya.
export function getOwnerDisplayName(user) {
    if (!user) return 'Unknown';
    if (user.firstname) return `${user.firstname} ${user.lastname || ''}`.trim();
    return user.name || 'Unknown';
}

// Diri kuhaon ang label sa approval status sa tag-iya.
export function getOwnerApprovalLabel(user) {
    const status = user?.approval_status;
    if (status === 'pending') return 'Under Review';
    if (status === 'approved') return 'Approved';
    if (status === 'rejected') return 'Rejected';
    return null;
}

// Diri ang badge sa approval status sa tag-iya.
export default function OwnerApprovalBadge({ user, className = '' }) {
    const label = getOwnerApprovalLabel(user);
    if (!label) return null;

    const styles = {
        'Under Review': 'bg-amber-50 text-amber-700 ring-amber-100',
        Approved: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
        Rejected: 'bg-red-50 text-red-700 ring-red-100',
    };

    return (
        <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${styles[label] || 'bg-slate-50 text-slate-600 ring-slate-100'} ${className}`}>
            {label}
        </span>
    );
}
