import OwnerApprovalBadge from '@/Components/Admin/OwnerApprovalBadge';
import { vaccineCoverageLabel } from '@/utils/vaccinationSchedule';

// Diri limpyohan ang image URL para magamit.
function normalizeMediaUrl(url) {
    if (!url) return '';
    const value = String(url).trim();
    if (!value || value === 'null' || value === 'undefined') return '';
    if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:image')) return value;
    return value.startsWith('/') ? value : `/${value}`;
}

// Diri kuhaon ang ngalan sa barangay.
function getBarangayName(barangay) {
    if (!barangay) return null;
    if (typeof barangay === 'string') return barangay;
    if (typeof barangay === 'object' && barangay.name) return barangay.name;
    return null;
}

// Diri kuhaon ang tibuok ngalan sa tag-iya.
function getOwnerDisplayName(user) {
    if (!user) return 'Unknown';
    if (user.firstname) return `${user.firstname} ${user.lastname || ''}`.trim();
    return user.name || 'Unknown';
}

// Diri kuhaon ang initials sa tag-iya.
function getOwnerInitials(user) {
    if (!user) return '?';
    const first = user.firstname?.trim?.() || '';
    const last = user.lastname?.trim?.() || '';
    if (first && last) return (first[0] + last[0]).toUpperCase();
    if (first) return first.charAt(0).toUpperCase();
    const name = user.name?.trim?.() || '';
    if (!name) return '?';
    const parts = name.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.charAt(0).toUpperCase();
}

// Diri i-convert ang registration status ngadto sa label.
function getRegistrationLabel(status) {
    if (status === 'registered') return 'Registered';
    if (status === 'exempt') return 'Exempt';
    if (status === 'unregistered') return 'Unregistered';
    return null;
}

// Diri himuon nga readable ang medical value.
function formatMedicalLabel(value) {
    if (value === null || value === undefined || value === '') return '—';
    return String(value).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Diri i-format ang petsa sa medical record.
function formatMedicalDate(value) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Diri i-format ang numero para ipakita.
function formatDisplayNumber(value) {
    if (value == null || value === '') return '0';
    const num = Number(value);
    if (Number.isNaN(num)) return String(value);
    if (Number.isInteger(num)) return String(num);
    return String(parseFloat(num.toFixed(3)));
}

// Diri ang avatar image o fallback initials.
function AvatarImage({ src, alt, fallback, sizeClass = 'h-9 w-9', roundedClass = 'rounded-full' }) {
    const normalized = normalizeMediaUrl(src);
    if (normalized) {
        return (
            <img
                src={normalized}
                alt={alt}
                className={`${sizeClass} ${roundedClass} shrink-0 border border-gray-200 object-cover`}
            />
        );
    }
    return (
        <div className={`flex ${sizeClass} shrink-0 items-center justify-center ${roundedClass} bg-gradient-to-br from-violet-100 to-violet-200 text-sm font-semibold text-violet-700`}>
            {fallback}
        </div>
    );
}

// Diri ang header sa matag medical section.
function ViewSectionHeader({ title, subtitle }) {
    return (
        <div className="mb-4 flex items-start gap-3">
            <div className="mt-0.5 h-8 w-1 shrink-0 rounded-full bg-violet-600" />
            <div>
                <h3 className="text-sm font-bold text-gray-900">{title}</h3>
                {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
            </div>
        </div>
    );
}

// Diri ang usa ka info row nga label ug value.
function ViewInfoRow({ label, value }) {
    if (value == null || value === '') return null;
    return (
        <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3.5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
            <p className="mt-1 text-sm font-semibold text-gray-900">{value}</p>
        </div>
    );
}

// Diri ang panel sa litrato sa hayop nga ma-preview.
function AnimalPhotoPanel({ label, photoUrl, onPreview }) {
    const normalized = normalizeMediaUrl(photoUrl);
    return (
        <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
            {normalized ? (
                <button
                    type="button"
                    onClick={() => onPreview(normalized, label)}
                    className="group relative block w-full overflow-hidden rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300"
                >
                    <img
                        src={normalized}
                        alt={label}
                        className="aspect-[4/3] w-full object-cover transition-transform group-hover:scale-[1.02]"
                    />
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-3 py-2 text-left text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                        Click to enlarge
                    </span>
                </button>
            ) : (
                <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 text-center text-sm text-gray-400">
                    No {label.toLowerCase()} uploaded
                </div>
            )}
        </div>
    );
}

// Diri ang card sa health status nga naay badge ug petsa.
function HealthStatCard({ title, status, detail, date }) {
    const normalized = (status || '').toLowerCase();
    const badge = normalized === 'yes'
        ? 'bg-emerald-100 text-emerald-700'
        : normalized === 'no'
            ? 'bg-red-100 text-red-700'
            : 'bg-gray-100 text-gray-500';
    return (
        <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3">
            <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{title}</p>
                {status ? (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${badge}`}>
                        {formatMedicalLabel(status)}
                    </span>
                ) : null}
            </div>
            <p className="text-sm font-semibold text-gray-900">{detail}</p>
            {date && date !== '-' && date !== '—' ? <p className="mt-0.5 text-xs text-gray-500">{date}</p> : null}
        </div>
    );
}

// Diri ipakita ang pet, owner, ug medical details.
export default function PetMedicalSections({ pet, owner, medical, loading = false, onPreview, variant = 'full' }) {
    if (!pet) return null;

    const showPhotos = variant !== 'history';
    const showProfile = variant !== 'history';
    const showHistory = variant !== 'profile';
    const profile = medical?.profile || medical?.medical_profile || {};
    // Diri kuhaon ang value gikan sa medical profile o pet.
    const pick = (key) => profile[key] ?? pet?.[key] ?? null;
    const ownerName = getOwnerDisplayName(owner);
    const speciesName = typeof pet.species === 'string'
        ? pet.species
        : (pet.species?.species_name || pet.species_name || '—');
    const breedName = typeof pet.breed === 'string'
        ? pet.breed
        : (pet.breed?.breed_name || pet.breed_name || '—');
    const history = medical?.history || [];
    const otherVaccine = pick('other_vaccine_name');
    const hasOtherVaccine = Boolean(otherVaccine && String(otherVaccine).trim());

    return (
        <div className="space-y-5">
            {showPhotos ? (
            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <ViewSectionHeader title="Identification Photos" subtitle="Animal photo and unique markings for verification" />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <AnimalPhotoPanel label="Animal Photo" photoUrl={pet.pet_photo_url} onPreview={onPreview} />
                    <AnimalPhotoPanel label="Unique Markings Photo" photoUrl={pet.markings_photo_url} onPreview={onPreview} />
                </div>
                {pet.markings ? (
                    <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/50 px-4 py-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-600">Markings Description</p>
                        <p className="mt-1 text-sm leading-relaxed text-gray-800">{pet.markings}</p>
                    </div>
                ) : null}
            </section>
            ) : null}

            {showProfile ? (
            <>
            <div className="grid grid-cols-1 gap-5">
                <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <ViewSectionHeader title="Owner Information" subtitle="Client contact and location" />
                    <div className="mb-4 flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3">
                        <AvatarImage
                            src={owner?.profile_photo_url}
                            alt={ownerName}
                            fallback={getOwnerInitials(owner)}
                            sizeClass="h-12 w-12"
                            roundedClass="rounded-xl"
                        />
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-gray-900">{ownerName}</p>
                                <OwnerApprovalBadge user={owner} />
                            </div>
                            {owner?.email ? <p className="truncate text-xs text-gray-500">{owner.email}</p> : null}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <ViewInfoRow label="Full Name" value={ownerName} />
                        <ViewInfoRow label="Phone" value={owner?.phone_number} />
                        <ViewInfoRow label="Email" value={owner?.email} />
                        <ViewInfoRow label="Barangay" value={getBarangayName(owner?.barangay)} />
                        <ViewInfoRow label="Zone" value={owner?.zone} />
                    </div>
                </section>

                <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <ViewSectionHeader title="Animal Profile" subtitle="Physical details and registration" />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <ViewInfoRow
                            label="Identification No."
                            value={pet.identification_number || (pet.registration_status === 'exempt' ? 'No ID needed' : '—')}
                        />
                        <ViewInfoRow label="Species" value={speciesName} />
                        <ViewInfoRow label="Breed" value={breedName} />
                        <ViewInfoRow label="Color" value={pet.color} />
                        <ViewInfoRow label="Sex" value={pet.sex ? formatMedicalLabel(pet.sex) : null} />
                        <ViewInfoRow label="Birthdate" value={formatMedicalDate(pet.birthdate)} />
                        <ViewInfoRow
                            label="Weight"
                            value={pet.weight != null && pet.weight !== '' ? `${formatDisplayNumber(pet.weight)} kg` : null}
                        />
                        <ViewInfoRow
                            label="Registration"
                            value={pet.registration_status ? getRegistrationLabel(pet.registration_status) : null}
                        />
                    </div>
                </section>
            </div>

            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <ViewSectionHeader title="Medical Profile" subtitle="Reproductive status, diet, deworming, and vaccinations" />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <HealthStatCard
                        title="Reproductive"
                        detail={formatMedicalLabel(pick('reproductive_status'))}
                        date={pick('weeks_months') ? `Duration: ${pick('weeks_months')}` : null}
                    />
                    <HealthStatCard
                        title="Diet"
                        detail={formatMedicalLabel(pick('diet'))}
                        date={pick('diet_other') || null}
                    />
                    <HealthStatCard
                        title="Deworming"
                        status={pick('dewormed')}
                        detail={pick('dewormed') === 'yes'
                            ? (pick('dewormer_name') || 'Recorded')
                            : pick('dewormed') === 'no' ? 'Not dewormed' : '—'}
                        date={pick('dewormed') === 'yes' ? formatMedicalDate(pick('last_deworming_date')) : null}
                    />
                    <HealthStatCard
                        title="Rabies Vaccine"
                        status={pick('rabies_vaccine')}
                        detail={pick('rabies_vaccine') === 'yes'
                            ? 'Vaccinated'
                            : pick('rabies_vaccine') === 'no' ? 'Not vaccinated' : '—'}
                        date={pick('rabies_vaccine') === 'yes' ? vaccineCoverageLabel(pick('rabies_last_vaccination'), pick('rabies_dose_type')) : null}
                    />
                    <HealthStatCard
                        title="DHPPL Vaccine"
                        status={pick('dhppl_vaccine')}
                        detail={pick('dhppl_vaccine') === 'yes'
                            ? 'Vaccinated'
                            : pick('dhppl_vaccine') === 'no' ? 'Not vaccinated' : '—'}
                        date={pick('dhppl_vaccine') === 'yes' ? vaccineCoverageLabel(pick('dhppl_last_vaccination'), pick('dhppl_dose_type')) : null}
                    />
                    {hasOtherVaccine ? (
                        <HealthStatCard
                            title="Other Vaccine"
                            detail={String(otherVaccine).trim()}
                            date={vaccineCoverageLabel(pick('other_vaccine_last_vaccination'), pick('other_vaccine_dose_type'))}
                        />
                    ) : null}
                </div>
            </section>
            </>
            ) : null}

            {showHistory ? (
            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <ViewSectionHeader
                    title={`Medical History${medical?.historyCount || medical?.history_count ? ` (${medical.historyCount || medical.history_count})` : ''}`}
                    subtitle="Past treatments, vaccines, and services"
                />
                {loading ? (
                    <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
                        Loading medical history...
                    </div>
                ) : history.length ? (
                    <div className="space-y-2">
                        {history.map((entry, index) => (
                            <div key={`${entry.id}-${index}`} className="rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3">
                                <div className="flex items-start gap-3">
                                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">
                                        {index + 1}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-gray-900">{entry.service_type}</p>
                                        <p className="mt-0.5 text-xs text-gray-500">
                                            {entry.booking_type_label ? `${entry.booking_type_label} · ` : ''}
                                            {formatMedicalDate(entry.treatment_date) || formatMedicalDate(entry.created_at) || '—'}
                                            {entry.treatment_time ? ` · ${entry.treatment_time}` : ''}
                                            {entry.administered_by ? ` · ${entry.administered_by}` : ''}
                                        </p>
                                        {entry.notes ? (
                                            <p className="mt-1 text-sm leading-relaxed text-gray-700">{entry.notes}</p>
                                        ) : null}
                                        {entry.medicines?.length ? (
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                {entry.medicines.map((m, i) => (
                                                    <span key={i} className="inline-flex rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-violet-100">
                                                        {m.medicine_name}{m.quantity ? ` · ${formatDisplayNumber(m.quantity)}${m.unit ? ` ${m.unit}` : ''}` : ''}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : null}
                                        {entry.outside_items?.length ? (
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                {entry.outside_items.map((item, i) => (
                                                    <span key={i} className="inline-flex rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-800 ring-1 ring-violet-200">
                                                        Outside clinic · {item.name}{item.quantity ? ` · ${item.quantity}` : ''}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="py-2 text-sm text-gray-500">No medical history recorded yet.</p>
                )}
            </section>
            ) : null}
        </div>
    );
}
