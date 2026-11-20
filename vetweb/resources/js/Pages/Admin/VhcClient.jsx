import { usePage, Link } from '@inertiajs/react';
import { useState, useEffect, useMemo } from 'react';
import Sidebar from '@/Components/Admin/Sidebar';
import VhcModal from '@/Components/Admin/VhcModal';
import {
    FlashBanner,
    StatCard,
    formatCurrency,
    formatDate,
    getSpeciesSummary,
    getTotalAnimals,
    getValidityStatus,
    purposeTone,
    toneClasses,
} from '@/Components/Admin/vhcUi';

// Diri ang page sa VHC records sa client.
export default function VhcClient({ client, species = [], vhcFees = {} }) {
    const { flash } = usePage().props;
    const [flashMessage, setFlashMessage] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const certificates = client?.certificates || [];

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
        const totalAnimals = certificates.reduce((sum, record) => sum + getTotalAnimals(record), 0);
        const activeCertificates = certificates.filter((record) => getValidityStatus(record).tone === 'success').length;
        const totalRevenue = certificates.reduce((sum, record) => sum + (Number(record.amount_paid) || 0), 0);

        return { totalAnimals, activeCertificates, totalRevenue };
    }, [certificates]);

    return (
        <div className="flex h-screen overflow-hidden bg-canvas">
            <Sidebar />
            <div className="staff-main flex min-h-0 flex-1 flex-col overflow-hidden">
                <header className="shrink-0 border-b border-line bg-white px-6 py-4 lg:px-8">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <nav className="mb-1 flex items-center gap-2 text-xs text-muted">
                                <Link href="/admin/vhc" className="transition hover:text-violet-600">
                                    VHC Records
                                </Link>
                                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                </svg>
                                <span className="font-medium text-navy">{client.name}</span>
                            </nav>
                            <p className="app-kicker">Certificates</p>
                            <h1 className="text-xl font-bold tracking-tight text-navy">{client.name}</h1>
                            <p className="text-sm text-muted">
                                {client.contact_number ? `${client.contact_number} · ` : ''}
                                {certificates.length} certificate{certificates.length === 1 ? '' : 's'}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Link
                                href="/admin/vhc"
                                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
                            >
                                Back
                            </Link>
                            <button
                                type="button"
                                onClick={() => setShowModal(true)}
                                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
                            >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                </svg>
                                Add Certificate
                            </button>
                        </div>
                    </div>
                </header>

                <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 py-5 lg:px-8">
                    <FlashBanner message={flashMessage} />

                    <div className="grid shrink-0 grid-cols-1 gap-4 sm:grid-cols-3">
                        <StatCard
                            label="Certificates"
                            value={certificates.length}
                            hint="In this folder"
                            icon={
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            }
                        />
                        <StatCard
                            label="Animals Covered"
                            value={stats.totalAnimals}
                            hint={`${stats.activeCertificates} active certificate${stats.activeCertificates === 1 ? '' : 's'}`}
                            icon={
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                </svg>
                            }
                        />
                        <StatCard
                            label="Total Paid"
                            value={formatCurrency(stats.totalRevenue) || '₱0.00'}
                            hint="All certificates in folder"
                            icon={
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            }
                        />
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                        <div className="shrink-0 border-b border-gray-100 bg-gray-50/60 px-5 py-4">
                            <h2 className="text-sm font-semibold text-slate-900">Certificates in Folder</h2>
                            <p className="mt-0.5 text-xs text-slate-500">
                                Each certificate is a separate veterinary health record for {client.name}.
                            </p>
                        </div>

                        {certificates.length === 0 ? (
                            <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-16 text-center">
                                <p className="text-sm font-semibold text-slate-700">No certificates in this folder yet</p>
                                <button
                                    type="button"
                                    onClick={() => setShowModal(true)}
                                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-700"
                                >
                                    Add First Certificate
                                </button>
                            </div>
                        ) : (
                            <div className="min-h-0 flex-1 overflow-auto scrollbar-hide">
                                <table className="min-w-[900px] w-full text-left text-sm">
                                    <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50">
                                        <tr className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                                            <th className="px-4 py-3 font-bold">Certificate</th>
                                            <th className="px-4 py-3 font-bold">Purpose</th>
                                            <th className="px-4 py-3 font-bold">Destination</th>
                                            <th className="px-4 py-3 font-bold">Animals</th>
                                            <th className="px-4 py-3 font-bold">Issued / Valid</th>
                                            <th className="px-4 py-3 font-bold">Amount</th>
                                            <th className="px-4 py-3 font-bold">Status</th>
                                            <th className="px-4 py-3 font-bold"><span className="sr-only">Actions</span></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {[...certificates]
                                            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                                            .map((record) => {
                                                const speciesList = getSpeciesSummary(record);
                                                const totalAnimals = getTotalAnimals(record);
                                                const validity = getValidityStatus(record);
                                                const tone = purposeTone(record.purpose);

                                                return (
                                                    <tr key={record.id} className="group transition-colors hover:bg-violet-50/50">
                                                        <td className="px-5 py-4">
                                                            <div className="text-sm font-semibold text-slate-900">
                                                                #{String(record.id).padStart(4, '0')}
                                                            </div>
                                                            <div className="mt-0.5 text-xs text-slate-400">
                                                                {formatDate(record.created_at) || '—'}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-4">
                                                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 ${toneClasses[tone]}`}>
                                                                {record.purpose || '—'}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-4">
                                                            <div className="max-w-[160px] truncate text-sm text-slate-700" title={record.destination}>
                                                                {record.destination || '—'}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-4">
                                                            <div className="text-xs font-semibold tabular-nums text-slate-500">
                                                                {totalAnimals} head{totalAnimals === 1 ? '' : 's'}
                                                            </div>
                                                            {speciesList.length > 0 && (
                                                                <div className="mt-1 max-w-[140px] truncate text-xs text-slate-400">
                                                                    {speciesList.join(', ')}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-4">
                                                            <div className="text-sm text-slate-700">{formatDate(record.issued_on) || '—'}</div>
                                                            <div className="mt-0.5 text-xs text-slate-400">
                                                                Valid: {formatDate(record.valid_till) || '—'}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-4">
                                                            <span className="text-sm font-semibold tabular-nums text-emerald-600">
                                                                {formatCurrency(record.amount_paid) || '—'}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-4">
                                                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${toneClasses[validity.tone]}`}>
                                                                {validity.label}
                                                            </span>
                                                        </td>
                                                        <td className="px-5 py-4 text-right">
                                                            <Link
                                                                href={`/admin/vhc/${record.id}`}
                                                                className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 ring-1 ring-violet-100 transition group-hover:bg-violet-100"
                                                            >
                                                                View
                                                            </Link>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </main>
            </div>

            <VhcModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                species={species}
                vhcFees={vhcFees}
                client={client}
            />
        </div>
    );
}
