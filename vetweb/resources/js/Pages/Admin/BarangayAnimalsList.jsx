import { Link } from '@inertiajs/react';

const REGISTRATION_BADGE = {
    registered: { label: 'Registered', className: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
    exempt: { label: 'Exempt', className: 'bg-violet-50 text-violet-700 ring-violet-200' },
    declined: { label: 'Declined', className: 'bg-red-50 text-red-700 ring-red-100' },
    unregistered: { label: 'Unregistered', className: 'bg-amber-50 text-amber-800 ring-amber-100' },
};

// Diri limpyohan ang URL sa litrato.
function normalizeMediaUrl(url) {
    if (!url) return '';
    const value = String(url).trim();
    if (!value || value === 'null' || value === 'undefined') return '';
    if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:image')) return value;
    return value.startsWith('/') ? value : `/${value}`;
}

// Diri i-format ang sex sa hayop.
function formatSex(value) {
    if (!value) return '—';
    return value.charAt(0).toUpperCase() + value.slice(1);
}

// Diri ang link padulong sa profile sa hayop, dili sa client.
function animalProfileHref(animal) {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    params.delete('view');
    params.set('from', 'animals');
    return `/admin/clients/${animal.owner_id}/animals/${animal.id}/history?${params.toString()}`;
}

// Diri ang listahan sa mga hayop sulod sa barangay.
export default function BarangayAnimalsList({ animals = [], showBarangayColumn = false }) {
    const sortedAnimals = [...animals].sort((a, b) => {
        const nameA = (a.pet_name || '').toLowerCase();
        const nameB = (b.pet_name || '').toLowerCase();
        return nameA.localeCompare(nameB);
    });

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
            <div className="flex shrink-0 flex-col gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 className="text-base font-semibold text-slate-900">Animals</h3>
                    <p className="mt-1 text-xs text-slate-500">
                        {sortedAnimals.length} animal{sortedAnimals.length === 1 ? '' : 's'} in this folder
                    </p>
                </div>
                <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-500">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                    </svg>
                    Sorted A–Z
                </span>
            </div>

            {sortedAnimals.length === 0 ? (
                <div className="px-6 py-16 text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 ring-1 ring-violet-100">
                        <svg className="h-7 w-7 text-violet-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="4" r="2" />
                            <circle cx="18" cy="8" r="2" />
                            <circle cx="20" cy="16" r="2" />
                            <path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z" />
                        </svg>
                    </div>
                    <p className="text-sm font-semibold text-slate-800">
                        {showBarangayColumn ? 'No animals found' : 'No animals in this barangay'}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">Try another folder or search term.</p>
                </div>
            ) : (
                <div className="relative min-h-0 flex-1 overflow-auto" style={{ scrollbarWidth: 'thin' }}>
                    <table className="w-full min-w-[860px]">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50/90">
                                <th scope="col" className="sticky top-0 z-10 bg-slate-50/95 px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 backdrop-blur-sm">
                                    Animal
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 backdrop-blur-sm">
                                    Species
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 backdrop-blur-sm">
                                    Sex
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 backdrop-blur-sm">
                                    Owner
                                </th>
                                {showBarangayColumn && (
                                    <th scope="col" className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 backdrop-blur-sm">
                                        Barangay
                                    </th>
                                )}
                                <th scope="col" className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 backdrop-blur-sm">
                                    Registration
                                </th>
                                <th scope="col" className="sticky top-0 z-10 bg-slate-50/95 px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 backdrop-blur-sm">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {sortedAnimals.map((animal) => {
                                const photo = normalizeMediaUrl(animal.pet_photo_url);
                                const badge = REGISTRATION_BADGE[animal.registration_status] ?? REGISTRATION_BADGE.unregistered;

                                return (
                                    <tr key={animal.id} className="group transition-colors hover:bg-violet-50/30">
                                        <td className="px-5 py-3">
                                            <div className="flex min-w-0 items-center gap-3">
                                                {photo ? (
                                                    <img
                                                        src={photo}
                                                        alt={animal.pet_name || 'Animal'}
                                                        className="h-10 w-10 shrink-0 rounded-xl object-cover ring-2 ring-white shadow-sm"
                                                    />
                                                ) : (
                                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 text-sm font-bold text-white shadow-sm">
                                                        {(animal.pet_name?.charAt(0) || 'A').toUpperCase()}
                                                    </div>
                                                )}
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-slate-900">
                                                        {animal.pet_name || 'Unnamed animal'}
                                                    </p>
                                                    <p className="truncate text-xs text-slate-400">
                                                        {animal.identification_number || (animal.registration_status === 'exempt' ? 'No ID needed' : 'No ID')}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="text-sm text-slate-800">{animal.species || '—'}</p>
                                            <p className="text-xs text-slate-400">{animal.breed || 'No breed'}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="text-sm text-slate-700">{formatSex(animal.sex)}</p>
                                            {animal.color && <p className="text-xs text-slate-400">{animal.color}</p>}
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="truncate text-sm text-slate-700">{animal.owner_name || '—'}</p>
                                        </td>
                                        {showBarangayColumn && (
                                            <td className="px-4 py-3">
                                                <span className="inline-flex max-w-[10rem] items-center gap-1.5 truncate rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-800 ring-1 ring-inset ring-violet-200/70">
                                                    <span className="truncate">{animal.barangay || '—'}</span>
                                                </span>
                                            </td>
                                        )}
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${badge.className}`}>
                                                {badge.label}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center justify-end">
                                                {animal.owner_id ? (
                                                    <Link
                                                        href={animalProfileHref(animal)}
                                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-violet-700 transition hover:bg-violet-100"
                                                        title="View animal"
                                                    >
                                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                        </svg>
                                                    </Link>
                                                ) : (
                                                    <span className="text-xs text-slate-400">—</span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
