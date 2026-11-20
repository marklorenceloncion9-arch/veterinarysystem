import { usePage, Link } from '@inertiajs/react';
import { useState, useEffect, useMemo } from 'react';
import Sidebar from '@/Components/Admin/Sidebar';
import VhcModal from '@/Components/Admin/VhcModal';
import {
    FlashBanner,
    StatCard,
    formatCurrency,
    formatDate,
    getInitial,
} from '@/Components/Admin/vhcUi';

// Diri ang page sa listahan sa VHC.
export default function Vhc({ vhcClients = [], species = [], vhcFees = {} }) {
    const { flash } = usePage().props;
    const [flashMessage, setFlashMessage] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('newest');

    useEffect(() => {
        if (flash?.success) {
            setFlashMessage({ type: 'success', text: flash.success });
            const timer = setTimeout(() => setFlashMessage(null), 3000);
            return () => clearTimeout(timer);
        }
        if (flash?.error) {
            setFlashMessage({ type: 'error', text: flash.error });
            const timer = setTimeout(() => setFlashMessage(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [flash]);

    const stats = useMemo(() => {
        const totalCertificates = vhcClients.reduce((sum, client) => sum + (client.certificates_count || 0), 0);
        const totalAnimals = vhcClients.reduce((sum, client) => sum + (client.total_animals || 0), 0);
        const totalRevenue = vhcClients.reduce((sum, client) => sum + (Number(client.total_amount_paid) || 0), 0);

        return { totalCertificates, totalAnimals, totalRevenue };
    }, [vhcClients]);

    const filteredClients = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();

        let clients = vhcClients.filter((client) => {
            if (!query) return true;

            return (
                client.name?.toLowerCase().includes(query) ||
                client.contact_number?.toLowerCase().includes(query) ||
                String(client.id).includes(query)
            );
        });

        clients = [...clients].sort((a, b) => {
            if (sortBy === 'name') {
                return (a.name || '').localeCompare(b.name || '');
            }
            if (sortBy === 'oldest') {
                return new Date(a.latest_certificate_at || 0) - new Date(b.latest_certificate_at || 0);
            }
            return new Date(b.latest_certificate_at || 0) - new Date(a.latest_certificate_at || 0);
        });

        return clients;
    }, [vhcClients, searchQuery, sortBy]);

    return (
        <div className="flex h-screen overflow-hidden bg-canvas">
            <Sidebar />
            <div className="staff-main flex min-h-0 flex-1 flex-col overflow-hidden">
                <header className="shrink-0 border-b border-line bg-white px-6 py-4 lg:px-8">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="app-kicker">Certificates</p>
                            <h1 className="text-xl font-bold tracking-tight text-navy">VHC Records</h1>
                            <p className="text-sm text-muted">Group veterinary health certificates by client</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowModal(true)}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
                        >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                            New Client Folder
                        </button>
                    </div>
                </header>

                <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 py-5 lg:px-8">
                    <FlashBanner message={flashMessage} />

                    <div className="grid shrink-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <StatCard
                            label="Client Folders"
                            value={vhcClients.length}
                            hint="Grouped by owner"
                            icon={
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                </svg>
                            }
                        />
                        <StatCard
                            label="Total Certificates"
                            value={stats.totalCertificates}
                            hint="Across all folders"
                            icon={
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            }
                        />
                        <StatCard
                            label="Animals Covered"
                            value={stats.totalAnimals}
                            hint="Across all certificates"
                            icon={
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                </svg>
                            }
                        />
                        <StatCard
                            label="Total Revenue"
                            value={formatCurrency(stats.totalRevenue) || '₱0.00'}
                            hint="Collected fees"
                            icon={
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            }
                        />
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                        <div className="shrink-0 border-b border-gray-100 bg-gray-50/60 px-5 py-4">
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                                <div>
                                    <h2 className="text-sm font-semibold text-slate-900">Client Folders</h2>
                                    <p className="mt-0.5 text-xs text-slate-500">
                                        {filteredClients.length} of {vhcClients.length} folder
                                        {vhcClients.length === 1 ? '' : 's'} shown
                                    </p>
                                </div>

                                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                                    <div className="relative min-w-[240px] flex-1 sm:max-w-xs">
                                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                                            <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                            </svg>
                                        </div>
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="Search client name or contact..."
                                            className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-10 text-sm outline-none transition focus:border-violet-300 focus:bg-white focus:ring-2 focus:ring-violet-100"
                                        />
                                        {searchQuery && (
                                            <button
                                                type="button"
                                                onClick={() => setSearchQuery('')}
                                                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                                            >
                                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>

                                    <select
                                        value={sortBy}
                                        onChange={(e) => setSortBy(e.target.value)}
                                        className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-2 focus:ring-violet-100"
                                    >
                                        <option value="newest">Recently updated</option>
                                        <option value="oldest">Oldest first</option>
                                        <option value="name">Name A–Z</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {filteredClients.length === 0 ? (
                            <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-16 text-center">
                                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50 ring-1 ring-slate-100">
                                    <svg className="h-8 w-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                    </svg>
                                </div>
                                <p className="text-sm font-semibold text-slate-700">
                                    {searchQuery ? 'No matching client folders found' : 'No VHC client folders yet'}
                                </p>
                                <p className="mt-1 text-sm text-slate-400">
                                    {searchQuery
                                        ? 'Try adjusting your search.'
                                        : 'Create a new client folder with their first certificate.'}
                                </p>
                                {!searchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => setShowModal(true)}
                                        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-700"
                                    >
                                        New Client Folder
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="min-h-0 flex-1 overflow-auto divide-y divide-gray-100 scrollbar-hide">
                                {filteredClients.map((client) => (
                                    <div
                                        key={client.id}
                                        className="group flex flex-col gap-4 px-5 py-5 transition hover:bg-violet-50/50 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div className="flex min-w-0 items-center gap-4">
                                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
                                                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                                </svg>
                                            </div>
                                            <div className="flex min-w-0 items-center gap-3">
                                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-sm font-bold text-white ring-2 ring-white">
                                                    {getInitial(client.name)}
                                                </div>
                                                <div className="min-w-0">
                                                    <h3 className="truncate text-base font-semibold text-slate-900">
                                                        {client.name}
                                                    </h3>
                                                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                                                        {client.contact_number && <span>{client.contact_number}</span>}
                                                        <span>
                                                            {client.certificates_count} certificate
                                                            {client.certificates_count === 1 ? '' : 's'}
                                                        </span>
                                                        <span>{client.total_animals} head{client.total_animals === 1 ? '' : 's'}</span>
                                                        {client.latest_certificate_at && (
                                                            <span>Updated {formatDate(client.latest_certificate_at)}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex shrink-0 items-center gap-2 sm:pl-4">
                                            <Link
                                                href={`/admin/vhc/clients/${client.id}`}
                                                className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-4 py-2.5 text-xs font-semibold text-violet-700 ring-1 ring-violet-100 transition group-hover:bg-violet-100"
                                            >
                                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                                </svg>
                                                Open Folder
                                            </Link>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </main>
            </div>

            <VhcModal isOpen={showModal} onClose={() => setShowModal(false)} species={species} vhcFees={vhcFees} />
        </div>
    );
}

