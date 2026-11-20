import { usePage } from '@inertiajs/react';
import Tabs from '@/Components/Ui/Tabs';

const STATUS_OPTIONS = [
    { key: 'approved', label: 'Approved' },
    { key: 'pending', label: 'Pending' },
    { key: 'rejected', label: 'Cancelled' },
];

// Diri himuon ang link nga dala ang current query string.
function buildHref(path) {
    const params = new URLSearchParams(window.location.search);
    const query = params.toString();
    return query ? `${path}?${query}` : path;
}

// Diri ang dropdown sa approved o pending clients.
export default function ClientStatusDropdown({ listStatus = 'approved', className = '', showCancelled = true }) {
    const { clientRegistrationCounts } = usePage().props;
    const pendingCount = clientRegistrationCounts?.pending ?? 0;
    const rejectedCount = clientRegistrationCounts?.rejected ?? 0;
    const options = showCancelled
        ? STATUS_OPTIONS
        : STATUS_OPTIONS.filter((option) => option.key !== 'rejected');

    return (
        <Tabs
            className={className}
            value={listStatus}
            items={options.map((option) => ({
                id: option.key,
                label: option.label,
                href: buildHref(
                    option.key === 'approved'
                        ? '/admin/barangay-animals'
                        : option.key === 'pending'
                          ? '/admin/barangay-animals/pending'
                          : '/admin/barangay-animals/rejected'
                ),
                count: option.key === 'pending' ? pendingCount : option.key === 'rejected' ? rejectedCount : null,
                tone: option.key === 'pending' && pendingCount > 0 ? 'danger' : 'default',
            }))}
        />
    );
}
