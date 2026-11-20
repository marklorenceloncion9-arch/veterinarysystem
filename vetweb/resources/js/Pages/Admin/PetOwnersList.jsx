import React from 'react';
import { Link, router } from '@inertiajs/react';

const STATUS_META = {
    approved: {
        title: 'Client Directory',
        empty: 'No approved clients found',
        badge: { label: 'Approved', className: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
    },
    pending: {
        title: 'Pending Registrations',
        empty: 'No pending registrations found',
        badge: { label: 'Under Review', className: 'bg-red-50 text-red-700 ring-red-100' },
    },
    rejected: {
        title: 'Cancelled Registrations',
        empty: 'No cancelled registrations found',
        badge: { label: 'Cancelled', className: 'bg-slate-100 text-slate-700 ring-slate-200' },
    },
};

// Diri limpyohan ang URL sa litrato.
function normalizeMediaUrl(url) {
    if (!url) return '';
    const value = String(url).trim();
    if (!value || value === 'null' || value === 'undefined') return '';
    if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:image')) return value;
    return value.startsWith('/') ? value : `/${value}`;
}

// Diri ang link padulong sa client, ug ang back mobalik sa Clients list.
function clientDetailsHref(clientId) {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    params.set('view', 'clients');
    params.set('from', 'clients');
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    if (path.endsWith('/pending')) params.set('list', 'pending');
    else if (path.endsWith('/rejected')) params.set('list', 'rejected');
    else params.delete('list');
    return `/admin/clients/${clientId}?${params.toString()}`;
}

// Diri i-format ang petsa.
function formatDate(value) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

// Diri i-format ang ngalan sa client.
function formatClientName(client) {
    const last = client.lastname?.trim();
    const first = client.firstname?.trim();
    if (last && first) return `${last}, ${first}`;
    return last || first || 'Unnamed client';
}

// Diri ang listahan sa mga tag-iya sa hayop.
function PetOwnersList({ clients, showBarangayColumn = false, listStatus = 'approved' }) {
    const meta = STATUS_META[listStatus] ?? STATUS_META.approved;
    const showReviewColumns = listStatus === 'pending' || listStatus === 'rejected';

    const sortedClients = [...clients].sort((a, b) => {
        const lastNameA = (a.lastname || '').toLowerCase();
        const lastNameB = (b.lastname || '').toLowerCase();
        if (lastNameA !== lastNameB) {
            return lastNameA.localeCompare(lastNameB);
        }
        const firstNameA = (a.firstname || '').toLowerCase();
        const firstNameB = (b.firstname || '').toLowerCase();
        return firstNameA.localeCompare(firstNameB);
    });

    const totalAnimals = clients.reduce((sum, c) => sum + (c.animals_count || 0), 0);

    // Diri i-approve o i-reject ang registration.
    const handleApproval = (clientId, action) => {
        const label = action === 'approve' ? 'approve this registration' : 'reject this registration';
        if (!window.confirm(`Are you sure you want to ${label}?`)) return;
        router.post(`/admin/clients/${clientId}/approval`, { action });
    };

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
            <div className="flex shrink-0 flex-col gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900">{meta.title}</h3>
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${meta.badge.className}`}>
                            {meta.badge.label}
                        </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                        {clients.length} owner{clients.length === 1 ? '' : 's'}
                        {listStatus === 'approved' && totalAnimals > 0 && ` · ${totalAnimals} registered animal${totalAnimals === 1 ? '' : 's'}`}
                    </p>
                </div>
                <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-500">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                    </svg>
                    Sorted A–Z
                </span>
            </div>

            {clients.length === 0 ? (
                <div className="px-6 py-16 text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 ring-1 ring-violet-100">
                        <svg className="h-7 w-7 text-violet-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </div>
                    <p className="text-sm font-semibold text-slate-800">{meta.empty}</p>
                    <p className="mt-1 text-sm text-slate-400">Try a different barangay folder or search term.</p>
                </div>
            ) : (
                <div
                    className="relative min-h-0 flex-1 overflow-auto"
                    style={{ scrollbarWidth: 'thin' }}
                >
                    <table className="w-full min-w-[860px]">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50/90">
                                <th scope="col" className="sticky top-0 z-10 bg-slate-50/95 px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 backdrop-blur-sm">
                                    Client
                                </th>
                                {showBarangayColumn && (
                                    <th scope="col" className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 backdrop-blur-sm">
                                        Barangay
                                    </th>
                                )}
                                <th scope="col" className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 backdrop-blur-sm">
                                    Contact
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 backdrop-blur-sm">
                                    Zone
                                </th>
                                {showReviewColumns && (
                                    <th scope="col" className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 backdrop-blur-sm">
                                        Submitted
                                    </th>
                                )}
                                {showReviewColumns && (
                                    <th scope="col" className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 backdrop-blur-sm">
                                        ID / Residence
                                    </th>
                                )}
                                {listStatus === 'approved' && (
                                    <th scope="col" className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 backdrop-blur-sm">
                                        Animals
                                    </th>
                                )}
                                <th scope="col" className="sticky top-0 z-10 bg-slate-50/95 px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 backdrop-blur-sm">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {sortedClients.map((client) => (
                                <tr key={client.id} className="group transition-colors hover:bg-violet-50/30">
                                    <td className="px-5 py-3">
                                        <div className="flex min-w-0 items-center gap-3">
                                            {normalizeMediaUrl(client.profile_photo_url) ? (
                                                <img
                                                    src={normalizeMediaUrl(client.profile_photo_url)}
                                                    alt={formatClientName(client)}
                                                    className="h-10 w-10 shrink-0 rounded-xl object-cover ring-2 ring-white shadow-sm"
                                                />
                                            ) : (
                                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 text-sm font-bold text-white shadow-sm">
                                                    {(client.firstname?.charAt(0) || client.lastname?.charAt(0) || 'C').toUpperCase()}
                                                </div>
                                            )}
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold text-slate-900">
                                                    {formatClientName(client)}
                                                </p>
                                                {client.middlename && (
                                                    <p className="truncate text-xs text-slate-400">{client.middlename}</p>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    {showBarangayColumn && (
                                        <td className="px-4 py-3">
                                            <span className="inline-flex max-w-[10rem] items-center gap-1.5 truncate rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-800 ring-1 ring-inset ring-violet-200/70">
                                                <svg className="h-3 w-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                                    <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V16a1 1 0 001 1h2a1 1 0 001-1v-1a1 1 0 011-1h2a1 1 0 011 1v1a1 1 0 001 1h2a1 1 0 001-1v-5.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                                                </svg>
                                                <span className="truncate">{client.barangay?.name || '—'}</span>
                                            </span>
                                        </td>
                                    )}
                                    <td className="px-4 py-3">
                                        <div className="space-y-1">
                                            <p className="truncate text-sm text-slate-700" title={client.email}>
                                                {client.email || <span className="text-slate-400">No email</span>}
                                            </p>
                                            <p className="text-xs text-slate-400">
                                                {client.phone_number || 'No phone'}
                                            </p>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                                            {client.zone || '—'}
                                        </span>
                                    </td>
                                    {showReviewColumns && (
                                        <td className="px-4 py-3 text-sm text-slate-600">
                                            {formatDate(client.created_at)}
                                        </td>
                                    )}
                                    {showReviewColumns && (
                                        <td className="px-4 py-3">
                                            {normalizeMediaUrl(client.id_document_url) ? (
                                                <a
                                                    href={normalizeMediaUrl(client.id_document_url)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-block overflow-hidden rounded-lg ring-1 ring-slate-200 transition hover:ring-violet-300"
                                                >
                                                    <img
                                                        src={normalizeMediaUrl(client.id_document_url)}
                                                        alt="Verification document"
                                                        className="h-12 w-16 object-cover"
                                                    />
                                                </a>
                                            ) : (
                                                <span className="text-xs text-slate-400">No document</span>
                                            )}
                                        </td>
                                    )}
                                    {listStatus === 'approved' && (
                                        <td className="px-4 py-3 text-center">
                                            <span className={`inline-flex min-w-[1.75rem] items-center justify-center rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${
                                                client.animals_count > 0
                                                    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                                                    : 'bg-slate-100 text-slate-500'
                                            }`}>
                                                {client.animals_count || 0}
                                            </span>
                                        </td>
                                    )}
                                    <td className="px-5 py-3">
                                        <div className="flex items-center justify-end gap-2">
                                            <Link
                                                href={clientDetailsHref(client.id)}
                                                className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-violet-700 transition hover:bg-violet-100"
                                                title="View details"
                                            >
                                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                                                </svg>
                                                {(client.pending_pets_count || 0) > 0 && (
                                                    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold tabular-nums text-white ring-2 ring-white">
                                                        {client.pending_pets_count > 99 ? '99+' : client.pending_pets_count}
                                                    </span>
                                                )}
                                            </Link>
                                            {listStatus === 'pending' && (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleApproval(client.id, 'reject')}
                                                        className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                                                    >
                                                        Reject
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleApproval(client.id, 'approve')}
                                                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
                                                    >
                                                        Approve
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default PetOwnersList;
