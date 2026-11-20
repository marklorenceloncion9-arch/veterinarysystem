import { Link, router, usePage } from '@inertiajs/react';
import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/Components/Admin/Sidebar';
import AnimalQrModal from '@/Components/Admin/AnimalQrModal';
import { printSavedOutsideClinicReceipt } from '@/Components/Admin/OutsidePurchaseReceipt';
import { vaccineCoverageLabel } from '@/utils/vaccinationSchedule';

// Diri ang row sa info nga naay icon.
function InfoRow({ icon, label, value }) {
    return (
        <div className="flex items-start gap-3 rounded-xl border border-violet-100 bg-violet-50/60 p-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 ring-1 ring-violet-100">
                {icon}
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
                <p className="mt-0.5 break-words text-sm font-semibold text-gray-900">{value || 'N/A'}</p>
            </div>
        </div>
    );
}

// Diri ang gamay nga stat card.
function MiniStat({ label, value, icon }) {
    return (
        <div className="rounded-xl border border-violet-100 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-2xl font-bold tracking-tight text-gray-900">{value}</p>
                    <p className="mt-0.5 text-xs font-medium text-gray-500">{label}</p>
                </div>
                {icon && (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white shadow-sm shadow-violet-200">
                        {icon}
                    </div>
                )}
            </div>
        </div>
    );
}

// Diri ang header sa section.
function SectionHeader({ title, subtitle, compact = false }) {
    return (
        <div className={`flex items-start gap-3 ${compact ? 'mb-4' : 'mb-5'}`}>
            <div className={`mt-0.5 shrink-0 rounded-full bg-violet-600 ${compact ? 'h-8 w-1' : 'h-10 w-1'}`} />
            <div>
                <h3 className={`font-bold text-gray-900 ${compact ? 'text-sm' : 'text-lg'}`}>{title}</h3>
                {subtitle && <p className={`mt-0.5 text-gray-500 ${compact ? 'text-xs' : 'text-sm'}`}>{subtitle}</p>}
            </div>
        </div>
    );
}

// Diri ang field sa edit form.
function EditFormField({ label, error, required, hint, children }) {
    return (
        <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
                {label}{required && <span className="text-red-500"> *</span>}
            </label>
            {children}
            {hint && !error && <p className="mt-1.5 text-xs text-gray-500">{hint}</p>}
            {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
        </div>
    );
}

// Diri ang pill button sa option.
function OptionPill({ active, onClick, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-xl border px-3.5 py-2 text-sm font-medium transition-all ${
                active
                    ? 'border-violet-200 bg-violet-50 text-violet-700 shadow-sm'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-violet-200 hover:bg-violet-50/40'
            }`}
        >
            {children}
        </button>
    );
}

// Diri ang row sa pili nga Yes o No.
function YesNoRow({ label, value, onChange }) {
    return (
        <div className="flex flex-col gap-3 rounded-xl border border-violet-100 bg-violet-50/60 p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-medium text-gray-700">{label}</span>
            <div className="flex gap-2">
                <OptionPill active={value === 'yes'} onClick={() => onChange('yes')}>Yes</OptionPill>
                <OptionPill active={value === 'no'} onClick={() => onChange('no')}>No</OptionPill>
            </div>
        </div>
    );
}

// Diri ang class sa edit input depende sa error.
const editFieldClass = (hasError) =>
    `block w-full rounded-xl border bg-gray-50 px-4 py-2.5 text-sm text-gray-700 transition-colors focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100 ${
        hasError ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-violet-300'
    }`;

const hiddenScrollbarClass = '[&::-webkit-scrollbar]:hidden';
const hiddenScrollbarStyle = { scrollbarWidth: 'none', msOverflowStyle: 'none' };

// Diri i-convert ang value para sa date input.
const toDateInputValue = (value) => {
    if (!value) return '';
    const raw = String(value).trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return raw.slice(0, 10);
    return dt.toISOString().slice(0, 10);
};

// Diri limpyohan ang payload sa edit.
const normalizeEditPayload = (payload) => {
    const cleaned = { ...payload };

    Object.keys(cleaned).forEach((key) => {
        if (cleaned[key] === '') {
            cleaned[key] = null;
        }
    });

    if (cleaned.dewormed !== 'yes') {
        cleaned.last_deworming_date = null;
        cleaned.dewormer_name = null;
    }
    if (cleaned.rabies_vaccine !== 'yes') {
        cleaned.rabies_last_vaccination = null;
    }
    if (cleaned.dhppl_vaccine !== 'yes') {
        cleaned.dhppl_last_vaccination = null;
    }
    if (cleaned.reproductive_status !== 'pregnant' && cleaned.reproductive_status !== 'nursing') {
        cleaned.weeks_months = null;
    }
    if (cleaned.diet !== 'others') {
        cleaned.diet_other = null;
    }
    if (!cleaned.other_vaccine_name) {
        cleaned.other_vaccine_last_vaccination = null;
    }

    return cleaned;
};

// Diri himuon ang edit form gikan sa hayop.
const buildEditFormFromPet = (pet) => ({
    pet_name: pet?.pet_name ?? '',
    species_id: pet?.species_id ?? '',
    breed_id: pet?.breed_id ?? '',
    sex: pet?.sex ?? '',
    color: pet?.color ?? '',
    weight: pet?.weight ?? '',
    birthdate: toDateInputValue(pet?.birthdate),
    registration_status: pet?.registration_status ?? 'unregistered',
    markings: pet?.markings ?? '',
    reproductive_status: pet?.reproductive_status ?? '',
    weeks_months: pet?.weeks_months ?? '',
    diet: pet?.diet ?? '',
    diet_other: pet?.diet_other ?? '',
    dewormed: pet?.dewormed ?? 'no',
    last_deworming_date: toDateInputValue(pet?.last_deworming_date),
    dewormer_name: pet?.dewormer_name ?? '',
    rabies_vaccine: pet?.rabies_vaccine ?? 'no',
    rabies_last_vaccination: toDateInputValue(pet?.rabies_last_vaccination),
    dhppl_vaccine: pet?.dhppl_vaccine ?? 'no',
    dhppl_last_vaccination: toDateInputValue(pet?.dhppl_last_vaccination),
    other_vaccine_name: pet?.other_vaccine_name ?? '',
    other_vaccine_last_vaccination: toDateInputValue(pet?.other_vaccine_last_vaccination),
});

// Diri ang badge sa registration status.
function StatusBadge({ status }) {
    if (status === 'exempt') {
        return (
            <span className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700 ring-1 ring-violet-200">
                Exempt
            </span>
        );
    }

    const styles = {
        registered: 'bg-violet-100 text-violet-800 ring-violet-200',
        declined: 'bg-violet-50 text-violet-500 ring-violet-100',
        unregistered: 'bg-violet-50 text-violet-600 ring-violet-100',
    };

    const labels = {
        registered: 'Registered',
        declined: 'Declined',
        unregistered: 'Pending',
    };

    const key = status || 'unregistered';

    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${styles[key] || styles.unregistered}`}>
            {labels[key] || key}
        </span>
    );
}

// Diri ang card sa health status.
function HealthCard({ title, status, detail, date }) {
    const isYes = status === 'yes';
    const isNo = status === 'no';

    return (
        <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50/80 to-white p-4 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">{title}</p>
                {isYes || isNo ? (
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        isYes ? 'bg-violet-100 text-violet-700' : 'bg-violet-50 text-violet-400'
                    }`}>
                        {isYes ? 'Yes' : 'No'}
                    </span>
                ) : null}
            </div>
            <p className="font-semibold text-gray-900">{detail || '-'}</p>
            {date && date !== '-' && date !== '—' ? <p className="mt-1.5 text-xs text-gray-500">{date}</p> : null}
        </div>
    );
}

// Diri ang page sa history sa hayop.
export default function PetHistory({ client, pet, history, species = [], breeds = [] }) {
    // Helper function to check if animal is livestock or poultry (exempt from registration)
    // Diri i-check kung exempt sa registration ang hayop.
    const isExemptFromRegistration = (p) => {
        const typeName = p.species?.animalType?.type_name;
        return typeName === 'Livestock' || typeName === 'Poultry';
    };

    const [search, setSearch] = useState('');
    const [showEditModal, setShowEditModal] = useState(false);
    const [showQrModal, setShowQrModal] = useState(false);
    const [photoPreview, setPhotoPreview] = useState({ open: false, url: '', label: '' });
    const [availableBreeds, setAvailableBreeds] = useState([]);
    const [formErrors, setFormErrors] = useState({});
    const [flashMessage, setFlashMessage] = useState(null);
    const page = usePage();
    const { flash } = page.props;
    const fromAnimals = new URLSearchParams((page.url || '').split('?')[1] || '').get('from') === 'animals';
    const animalsListHref = (() => {
        const params = new URLSearchParams((page.url || '').split('?')[1] || '');
        params.delete('from');
        const qs = params.toString();
        return qs ? `/admin/barangay-animals?${qs}` : '/admin/barangay-animals';
    })();
    const clientPageHref = (() => {
        const qs = (page.url || '').split('?')[1] || '';
        return qs ? `/admin/clients/${client.id}?${qs}` : `/admin/clients/${client.id}`;
    })();
    const backHref = fromAnimals ? animalsListHref : clientPageHref;
    const [editForm, setEditForm] = useState(() => buildEditFormFromPet(pet));

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

    // Diri ipakita ang success message kadiyot.
    const showSuccessMessage = (text) => {
        setFlashMessage({ type: 'success', text });
        setTimeout(() => setFlashMessage(null), 3000);
    };

    // Diri i-format ang petsa ug oras.
    const formatDateTime = (value) => {
        if (!value) return '-';
        const dt = new Date(value);
        if (Number.isNaN(dt.getTime())) return String(value);

        return dt.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    // Diri i-format ang petsa.
    const formatDate = (value) => {
        if (!value) return '-';
        const dt = new Date(value);
        if (Number.isNaN(dt.getTime())) return String(value);
        return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    };

    // Diri i-format ang petsa o null kung wala.
    const formatDateOrNull = (value) => {
        if (!value) return null;
        const dt = new Date(value);
        if (Number.isNaN(dt.getTime())) return null;
        return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    };

    const hasOtherVaccine = Boolean(String(pet.other_vaccine_name ?? '').trim());

    // Diri i-format ang label nga readable.
    const formatLabel = (value) => {
        if (!value) return '-';
        return String(value).replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
    };

    // Diri kwentahon ang edad sa hayop.
    const calculateAge = (birthdate) => {
        if (!birthdate) return null;
        const birth = new Date(birthdate);
        if (Number.isNaN(birth.getTime())) return null;

        const today = new Date();
        let years = today.getFullYear() - birth.getFullYear();
        let months = today.getMonth() - birth.getMonth();

        if (months < 0 || (months === 0 && today.getDate() < birth.getDate())) {
            years -= 1;
            months += 12;
        }

        if (years > 0) {
            return `${years} yr${years === 1 ? '' : 's'}`;
        }

        if (months > 0) {
            return `${months} mo${months === 1 ? '' : 's'}`;
        }

        return '< 1 mo';
    };

    const ownerName = [client.firstname, client.middlename, client.lastname].filter(Boolean).join(' ');
    const petAge = calculateAge(pet.birthdate);
    const vaccineCount = [pet.rabies_vaccine, pet.dhppl_vaccine].filter((v) => v === 'yes').length
        + (hasOtherVaccine ? 1 : 0);

    // Diri limpyohan ang URL sa litrato.
    const normalizeMediaUrl = (url) => {
        if (!url) return '';
        const value = String(url).trim();
        if (!value || value === 'null' || value === 'undefined') return '';
        if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:image')) return value;
        return value.startsWith('/') ? value : `/${value}`;
    };

    // Diri ablihan ang preview sa litrato.
    const openPhotoPreview = (url, label) => {
        const normalized = normalizeMediaUrl(url);
        if (!normalized) return;
        setPhotoPreview({ open: true, url: normalized, label: label || 'Photo Preview' });
    };

    // Diri ablihan ang edit form sa hayop.
    const openEdit = () => {
        const nextSpeciesId = pet?.species_id ?? '';
        const breedsForSpecies = nextSpeciesId
            ? breeds.filter((b) => b.species_id === parseInt(nextSpeciesId))
            : [];

        setAvailableBreeds(breedsForSpecies);
        setEditForm(buildEditFormFromPet(pet));
        setFormErrors({});
        setShowEditModal(true);
    };

    // Diri i-set ang field sa edit form.
    const setEditField = (name, value) => {
        setEditForm((prev) => {
            const next = { ...prev, [name]: value };
            if (name === 'dewormed' && value !== 'yes') {
                next.last_deworming_date = '';
                next.dewormer_name = '';
            }
            if (name === 'rabies_vaccine' && value !== 'yes') {
                next.rabies_last_vaccination = '';
            }
            if (name === 'dhppl_vaccine' && value !== 'yes') {
                next.dhppl_last_vaccination = '';
            }
            if (name === 'reproductive_status' && value !== 'pregnant' && value !== 'nursing') {
                next.weeks_months = '';
            }
            if (name === 'other_vaccine_name' && !String(value || '').trim()) {
                next.other_vaccine_last_vaccination = '';
            }
            return next;
        });
        if (formErrors[name]) {
            setFormErrors((prev) => ({ ...prev, [name]: '' }));
        }
    };

    // Diri i-toggle ang reproductive status.
    const toggleReproductiveStatus = (status) => {
        setEditForm((prev) => ({
            ...prev,
            reproductive_status: prev.reproductive_status === status ? '' : status,
            weeks_months: prev.reproductive_status === status ? '' : prev.weeks_months,
        }));
    };

    // Diri i-toggle ang diet sa hayop.
    const toggleDiet = (diet) => {
        setEditForm((prev) => ({
            ...prev,
            diet: prev.diet === diet ? '' : diet,
            diet_other: diet === 'others' ? prev.diet_other : '',
        }));
    };

    // Diri i-update ang edit form kung mag-type.
    const handleEditInputChange = (e) => {
        const { name, value } = e.target;

        if (name === 'species_id') {
            const breedsForSpecies = value
                ? breeds.filter((b) => b.species_id === parseInt(value, 10))
                : [];
            setAvailableBreeds(breedsForSpecies);
            setEditForm((prev) => ({ ...prev, species_id: value, breed_id: '' }));
            return;
        }

        if (name === 'other_vaccine_name' && !value.trim()) {
            setEditForm((prev) => ({
                ...prev,
                other_vaccine_name: value,
                other_vaccine_last_vaccination: '',
            }));
            return;
        }

        setEditField(name, value);
    };

    // Diri i-save ang pag-edit sa hayop.
    const saveEdit = () => {
        setFormErrors({});

        const nextStatus = editForm.registration_status || 'unregistered';
        const statusChanged = nextStatus !== (pet?.registration_status ?? 'unregistered');
        const { registration_status, ...petPayload } = editForm;

        router.post(`/admin/clients/${client.id}/animals/${pet.id}`, normalizeEditPayload(petPayload), {
            preserveScroll: true,
            onSuccess: () => {
                if (!statusChanged) {
                    setShowEditModal(false);
                    showSuccessMessage('Animal updated successfully!');
                    router.reload({ only: ['pet', 'history'] });
                    return;
                }

                router.post(
                    `/admin/clients/${client.id}/animals/${pet.id}/status`,
                    { registration_status: nextStatus },
                    {
                        preserveScroll: true,
                        onSuccess: () => {
                            setShowEditModal(false);
                            showSuccessMessage('Animal updated successfully!');
                            router.reload({ only: ['pet', 'history'] });
                        },
                        onError: (errors) => {
                            setFormErrors(errors || {});
                        },
                    }
                );
            },
            onError: (errors) => {
                setFormErrors(errors || {});
            },
        });
    };

    const filteredHistory = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return history;

        return history.filter((row) => {
            const service = String(row.service_type || '').toLowerCase();
            const visitType = String(row.booking_type_label || '').toLowerCase();
            const notes = String(row.notes || '').toLowerCase();
            const medicines = (row.medicines || []).map((m) => String(m.medicine_name || '').toLowerCase()).join(' ');
            const outsideItems = (row.outside_items || []).map((item) => `${item.name || ''} ${item.status || ''}`).join(' ').toLowerCase();

            return service.includes(q) || visitType.includes(q) || notes.includes(q) || medicines.includes(q) || outsideItems.includes(q);
        });
    }, [history, search]);

    return (
        <div className="flex min-h-screen bg-canvas">
            <Sidebar />

            <div className="staff-main flex flex-1 flex-col">
                <header className="sticky top-0 z-30 border-b border-gray-200/80 bg-white/90 px-8 py-5 backdrop-blur-md">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-4">
                            <Link
                                href={backHref}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 shadow-sm transition-all hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
                                title={fromAnimals ? 'Back to Animals' : 'Back to Client'}
                            >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                                </svg>
                            </Link>
                            <div>
                                <h1 className="text-xl font-bold tracking-tight text-gray-900">Animal Profile</h1>
                                <p className="text-sm text-gray-500">View and manage animal information</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setShowQrModal(true)}
                                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
                            >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7h2v2H3V7zm0 4h2v2H3v-2zm4-4h2v2H7V7zm0 4h2v2H7v-2zm4-4h2v2h-2V7zm0 4h2v2h-2v-2zm4-4h2v2h-2V7zm0 4h2v2h-2v-2zM3 11h2v2H3v-2zm4 0h2v2H7v-2zm4 0h2v2h-2v-2zm4 0h2v2h-2v-2zM3 15h2v2H3v-2zm4 0h2v2H7v-2zm4 0h2v2h-2v-2zm4 0h2v2h-2v-2z"/>
                                </svg>
                                Generate QR
                            </button>
                            <button
                                type="button"
                                onClick={openEdit}
                                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-violet-200 transition-all hover:bg-violet-700 hover:shadow-md"
                            >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                </svg>
                                Edit Animal
                            </button>
                        </div>
                    </div>
                </header>

                <main
                    className="flex-1 overflow-y-auto p-8 [&::-webkit-scrollbar]:hidden"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    {flashMessage && (
                        <div className={`mb-6 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${
                            flashMessage.type === 'success'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : 'border-red-200 bg-red-50 text-red-800'
                        }`}>
                            <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {flashMessage.type === 'success' ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                ) : (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                )}
                            </svg>
                            {flashMessage.text}
                        </div>
                    )}

                    {/* Hero Card */}
                    <div className="mb-6 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                        <div className="border-b border-gray-100 bg-gradient-to-br from-violet-50/70 via-white to-white px-6 py-6 sm:px-8">
                            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                                    {normalizeMediaUrl(pet.pet_photo_url) ? (
                                        <button
                                            type="button"
                                            onClick={() => openPhotoPreview(pet.pet_photo_url, `${pet.pet_name || 'Animal'} photo`)}
                                            className="group relative shrink-0 focus:outline-none focus:ring-2 focus:ring-violet-300 rounded-2xl"
                                            title="Click to enlarge photo"
                                        >
                                            <img
                                                src={normalizeMediaUrl(pet.pet_photo_url)}
                                                alt={`${pet.pet_name || 'Animal'} photo`}
                                                className="h-28 w-28 rounded-2xl border border-gray-200 object-cover shadow-sm ring-2 ring-white transition-transform group-hover:scale-[1.02]"
                                            />
                                            <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/0 text-white opacity-0 transition-all group-hover:bg-black/20 group-hover:opacity-100">
                                                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                                </svg>
                                            </span>
                                        </button>
                                    ) : (
                                        <div
                                            className="flex h-28 w-28 shrink-0 items-center justify-center rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-500 to-violet-700 text-4xl font-bold text-white shadow-sm ring-2 ring-white"
                                        >
                                            {String(pet.pet_name || 'A').charAt(0).toUpperCase()}
                                        </div>
                                    )}

                                    <div>
                                        <div className="mb-2 flex flex-wrap items-center gap-2">
                                            <StatusBadge status={pet.registration_status} />
                                            {pet.species?.animalType?.type_name && (
                                                <span className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 ring-1 ring-violet-100">
                                                    {pet.species.animalType.type_name}
                                                </span>
                                            )}
                                            {pet.sex && (
                                                <span className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 ring-1 ring-violet-100">
                                                    {formatLabel(pet.sex)}
                                                </span>
                                            )}
                                        </div>
                                        <h2 className="text-2xl font-bold tracking-tight text-gray-900">{pet.pet_name || 'Unnamed Animal'}</h2>
                                        {pet.identification_number ? (
                                            <span className="mt-1 inline-flex rounded-md bg-violet-50 px-2.5 py-1 text-sm font-semibold text-violet-700 ring-1 ring-violet-100">
                                                {pet.identification_number}
                                            </span>
                                        ) : pet.registration_status === 'exempt' ? (
                                            <span className="mt-1 text-sm text-gray-400">No ID needed</span>
                                        ) : null}
                                        <p className="mt-1 text-sm text-gray-600">
                                            {pet.species?.species_name || 'Unknown species'}
                                            {pet.breed?.breed_name ? ` · ${pet.breed.breed_name}` : ''}
                                        </p>
                                        <Link
                                            href={clientPageHref}
                                            className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 transition-colors hover:text-violet-800"
                                        >
                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                            </svg>
                                            Owner: {ownerName}
                                        </Link>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[420px]">
                                    <MiniStat
                                        label="Age"
                                        value={petAge || '-'}
                                        icon={
                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                        }
                                    />
                                    <MiniStat
                                        label="Weight"
                                        value={pet.weight ? `${pet.weight} kg` : '-'}
                                        icon={
                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                                            </svg>
                                        }
                                    />
                                    <MiniStat
                                        label="Recent Records"
                                        value={vaccineCount}
                                        icon={
                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                            </svg>
                                        }
                                    />
                                    <MiniStat
                                        label="New Records"
                                        value={history.length}
                                        icon={
                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                            </svg>
                                        }
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
                        {/* Photos */}
                        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm xl:col-span-1">
                            <SectionHeader title="Photos" subtitle="Animal identification images" />
                            <div className="space-y-4">
                                <div>
                                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Animal Photo</p>
                                    {normalizeMediaUrl(pet.pet_photo_url) ? (
                                        <button
                                            type="button"
                                            onClick={() => openPhotoPreview(pet.pet_photo_url, `${pet.pet_name || 'Animal'} photo`)}
                                            className="group relative block w-full overflow-hidden rounded-xl border border-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-300"
                                        >
                                            <img
                                                src={normalizeMediaUrl(pet.pet_photo_url)}
                                                alt={`${pet.pet_name || 'Animal'} profile`}
                                                className="aspect-[4/3] w-full object-cover transition-transform group-hover:scale-[1.02]"
                                            />
                                            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-3 py-2 text-left text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                                                Click to enlarge
                                            </span>
                                        </button>
                                    ) : (
                                        <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-400">
                                            No photo uploaded
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Unique Markings</p>
                                    {normalizeMediaUrl(pet.markings_photo_url) ? (
                                        <button
                                            type="button"
                                            onClick={() => openPhotoPreview(pet.markings_photo_url, `${pet.pet_name || 'Animal'} unique markings`)}
                                            className="group relative block w-full overflow-hidden rounded-xl border border-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-300"
                                        >
                                            <img
                                                src={normalizeMediaUrl(pet.markings_photo_url)}
                                                alt={`${pet.pet_name || 'Animal'} unique markings`}
                                                className="aspect-[4/3] w-full object-cover transition-transform group-hover:scale-[1.02]"
                                            />
                                            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-3 py-2 text-left text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                                                Click to enlarge
                                            </span>
                                        </button>
                                    ) : (
                                        <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-400">
                                            No markings photo
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Basic Information */}
                        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm xl:col-span-2">
                            <SectionHeader title="Basic Information" subtitle="Identification and physical details" />
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {pet.identification_number ? (
                                    <InfoRow
                                        label="Identification Number"
                                        value={pet.identification_number}
                                        icon={
                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                                            </svg>
                                        }
                                    />
                                ) : pet.registration_status === 'exempt' ? (
                                    <InfoRow
                                        label="Identification Number"
                                        value="No ID needed"
                                        icon={
                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                                            </svg>
                                        }
                                    />
                                ) : null}
                                <InfoRow
                                    label="Species"
                                    value={pet.species?.species_name}
                                    icon={
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                        </svg>
                                    }
                                />
                                <InfoRow
                                    label="Breed"
                                    value={pet.breed?.breed_name}
                                    icon={
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
                                        </svg>
                                    }
                                />
                                <InfoRow
                                    label="Sex"
                                    value={formatLabel(pet.sex)}
                                    icon={
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                    }
                                />
                                <InfoRow
                                    label="Color"
                                    value={pet.color}
                                    icon={
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                                        </svg>
                                    }
                                />
                                <InfoRow
                                    label="Birthdate"
                                    value={formatDate(pet.birthdate)}
                                    icon={
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                    }
                                />
                                <InfoRow
                                    label="Weight"
                                    value={pet.weight ? `${pet.weight} kg` : null}
                                    icon={
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                                        </svg>
                                    }
                                />
                                {pet.markings && (
                                    <div className="sm:col-span-2">
                                        <InfoRow
                                            label="Markings Description"
                                            value={pet.markings}
                                            icon={
                                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                </svg>
                                            }
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Medical Profile */}
                    <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                        <SectionHeader title="Medical Profile" subtitle="Reproductive status, diet, deworming, and vaccinations" />
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            <HealthCard
                                title="Reproductive Status"
                                detail={formatLabel(pet.reproductive_status)}
                                date={pet.weeks_months ? `Duration: ${pet.weeks_months}` : null}
                            />
                            <HealthCard
                                title="Diet"
                                detail={formatLabel(pet.diet)}
                                date={pet.diet_other || null}
                            />
                            <HealthCard
                                title="Deworming"
                                status={pet.dewormed}
                                detail={pet.dewormed === 'yes' ? (pet.dewormer_name || 'Recorded') : pet.dewormed === 'no' ? 'Not dewormed' : '-'}
                                date={pet.dewormed === 'yes' ? formatDateOrNull(pet.last_deworming_date) : null}
                            />
                            <HealthCard
                                title="Rabies Vaccine"
                                status={pet.rabies_vaccine}
                                detail={pet.rabies_vaccine === 'yes' ? 'Vaccinated' : pet.rabies_vaccine === 'no' ? 'Not vaccinated' : '-'}
                                date={pet.rabies_vaccine === 'yes' ? vaccineCoverageLabel(pet.rabies_last_vaccination, pet.rabies_dose_type) : null}
                            />
                            <HealthCard
                                title="DHPPL Vaccine"
                                status={pet.dhppl_vaccine}
                                detail={pet.dhppl_vaccine === 'yes' ? 'Vaccinated' : pet.dhppl_vaccine === 'no' ? 'Not vaccinated' : '-'}
                                date={pet.dhppl_vaccine === 'yes' ? vaccineCoverageLabel(pet.dhppl_last_vaccination, pet.dhppl_dose_type) : null}
                            />
                            {hasOtherVaccine && (
                                <HealthCard
                                    title="Other Vaccine"
                                    detail={pet.other_vaccine_name.trim()}
                                    date={vaccineCoverageLabel(pet.other_vaccine_last_vaccination, pet.other_vaccine_dose_type)}
                                />
                            )}
                        </div>
                    </div>

                    {/* History Timeline */}
                    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                        <div className="flex flex-col gap-4 border-b border-gray-100 bg-gray-50/50 px-6 py-5 sm:flex-row sm:items-end sm:justify-between">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm shadow-violet-200">
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">History Timeline</h3>
                                    <p className="text-sm text-gray-500">Vaccines, treatments, vitamins, clinic medicines, and outside clinic items</p>
                                </div>
                            </div>

                            <div className="w-full sm:w-72">
                                <label className="mb-1.5 block text-xs font-medium text-gray-500">Search records</label>
                                <div className="relative">
                                    <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                    <input
                                        type="text"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="Service or medicine..."
                                        className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-700 transition-colors focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-100"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="p-6">
                            {filteredHistory.length === 0 ? (
                                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50 py-14 text-center">
                                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-violet-600">
                                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                        </svg>
                                    </div>
                                    <p className="text-sm font-medium text-gray-700">No history records found</p>
                                    <p className="mt-1 text-xs text-gray-500">
                                        {search ? 'Try a different search term' : 'Treatment records will appear here'}
                                    </p>
                                </div>
                            ) : (
                                <div className="relative space-y-0">
                                    <div className="absolute bottom-4 left-[15px] top-4 w-0.5 bg-violet-100" aria-hidden="true" />
                                    {filteredHistory.map((row, index) => (
                                        <div key={row.id} className="relative flex gap-5 pb-6 last:pb-0">
                                            <div className="relative z-10 mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-white bg-violet-600 text-xs font-bold text-white shadow-sm shadow-violet-200">
                                                {filteredHistory.length - index}
                                            </div>

                                            <div className="min-w-0 flex-1 rounded-xl border border-gray-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
                                                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                    <div className="min-w-0">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            {row.booking_type_label && (
                                                                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                                                    row.booking_type === 'home_service'
                                                                        ? 'bg-emerald-100 text-emerald-800'
                                                                        : row.booking_type === 'walk_in'
                                                                            ? 'bg-amber-100 text-amber-800'
                                                                            : 'bg-sky-100 text-sky-800'
                                                                }`}>
                                                                    {row.booking_type_label}
                                                                </span>
                                                            )}
                                                            <span className="inline-flex rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
                                                                {row.service_type}
                                                            </span>
                                                            {row.administered_by && (
                                                                <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                                                                    By {row.administered_by}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="mt-2 text-sm text-gray-500">
                                                            <span className="font-medium text-gray-700">Administered:</span>{' '}
                                                            {formatDateTime(row.created_at) !== '-' ? formatDateTime(row.created_at) : (row.treatment_date || '-')}
                                                        </p>
                                                    </div>
                                                </div>

                                                {row.medicines && row.medicines.length > 0 ? (
                                                    <div className="overflow-hidden rounded-lg border border-gray-100">
                                                        <table className="w-full text-sm">
                                                            <thead>
                                                                <tr className="bg-gray-50/80 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                                                                    <th className="px-4 py-2.5">Medicine</th>
                                                                    <th className="px-4 py-2.5">Qty</th>
                                                                    <th className="px-4 py-2.5">Unit</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {row.medicines.map((m) => {
                                                                    const isLiquid = m.unit?.toLowerCase().includes('ml') || m.unit?.toLowerCase() === 'vials';
                                                                    const qty = isLiquid
                                                                        ? `${parseFloat(m.quantity).toFixed(2)} ml`
                                                                        : `${parseInt(m.quantity)} ${m.unit || 'items'}`;
                                                                    return (
                                                                        <tr key={m.id} className="border-t border-gray-100">
                                                                            <td className="px-4 py-2.5 font-medium text-gray-900">{m.medicine_name}</td>
                                                                            <td className="px-4 py-2.5 text-gray-600">{m.quantity ? qty : '-'}</td>
                                                                            <td className="px-4 py-2.5 text-gray-600">{m.unit ?? '-'}</td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                ) : !(row.outside_items || []).length ? (
                                                    <p className="text-sm text-gray-500">No medicines recorded for this visit.</p>
                                                ) : null}

                                                {(row.outside_items || []).length > 0 ? (
                                                    <div className={`overflow-hidden rounded-lg border border-violet-100 ${row.medicines?.length ? 'mt-4' : ''}`}>
                                                        <div className="flex items-center justify-between gap-3 bg-violet-50 px-4 py-2">
                                                            <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">Outside clinic</p>
                                                            <button
                                                                type="button"
                                                                onClick={() => printSavedOutsideClinicReceipt({
                                                                    pet,
                                                                    ownerName,
                                                                    entry: row,
                                                                })}
                                                                className="inline-flex items-center rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-violet-800 ring-1 ring-violet-200 hover:bg-violet-100"
                                                            >
                                                                Print receipt
                                                            </button>
                                                        </div>
                                                        <table className="w-full text-sm">
                                                            <thead>
                                                                <tr className="bg-violet-50/40 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                                                                    <th className="px-4 py-2.5">Item</th>
                                                                    <th className="px-4 py-2.5">Qty</th>
                                                                    <th className="px-4 py-2.5">Status</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {row.outside_items.map((item) => (
                                                                    <tr key={item.id} className="border-t border-violet-100">
                                                                        <td className="px-4 py-2.5 font-medium text-gray-900">{item.name}</td>
                                                                        <td className="px-4 py-2.5 text-gray-600">{item.quantity ?? '-'}</td>
                                                                        <td className="px-4 py-2.5 text-gray-600">{item.status || 'Approved by the clinic'}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                ) : null}

                                                {row.notes && (
                                                    <div className="mt-4 rounded-lg border border-violet-100 bg-violet-50/60 px-4 py-3 text-sm text-violet-800">
                                                        <span className="font-semibold">Notes:</span> {row.notes}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Edit Animal Modal */}
                    {showEditModal && (
                        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={() => setShowEditModal(false)}>
                            <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity" />

                            <div
                                className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/95 backdrop-blur-sm">
                                    <div className="flex items-center justify-between px-6 py-5">
                                        <div className="flex items-start gap-3">
                                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm shadow-violet-200">
                                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-bold text-gray-900">Edit Animal Info</h3>
                                                <p className="text-sm text-gray-500">Update identification and medical details</p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setShowEditModal(false)}
                                            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                                        >
                                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>

                                <div className={`flex-1 space-y-5 overflow-y-auto px-6 py-5 ${hiddenScrollbarClass}`} style={hiddenScrollbarStyle}>
                                    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                                        <SectionHeader compact title="Animal Profile" subtitle="Basic identification details" />
                                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                            <div className="md:col-span-2">
                                                <EditFormField label="Animal Name" required error={formErrors.pet_name}>
                                                    <input
                                                        type="text"
                                                        name="pet_name"
                                                        value={editForm.pet_name}
                                                        onChange={handleEditInputChange}
                                                        className={editFieldClass(!!formErrors.pet_name)}
                                                        placeholder="Enter animal name"
                                                    />
                                                </EditFormField>
                                            </div>
                                            <EditFormField label="Species" required error={formErrors.species_id}>
                                                <select
                                                    name="species_id"
                                                    value={editForm.species_id}
                                                    onChange={handleEditInputChange}
                                                    className={editFieldClass(!!formErrors.species_id)}
                                                >
                                                    <option value="">Select Species</option>
                                                    {species.map((s) => (
                                                        <option key={s.id} value={s.id}>{s.species_name}</option>
                                                    ))}
                                                </select>
                                            </EditFormField>
                                            <EditFormField label="Breed" required error={formErrors.breed_id}>
                                                <select
                                                    name="breed_id"
                                                    value={editForm.breed_id}
                                                    onChange={handleEditInputChange}
                                                    className={editFieldClass(!!formErrors.breed_id)}
                                                    disabled={!editForm.species_id}
                                                >
                                                    <option value="">Select Breed</option>
                                                    {(availableBreeds.length ? availableBreeds : breeds).map((b) => (
                                                        <option key={b.id} value={b.id}>{b.breed_name}</option>
                                                    ))}
                                                </select>
                                            </EditFormField>
                                            <EditFormField label="Sex" required error={formErrors.sex}>
                                                <select
                                                    name="sex"
                                                    value={editForm.sex}
                                                    onChange={handleEditInputChange}
                                                    className={editFieldClass(!!formErrors.sex)}
                                                >
                                                    <option value="">Select</option>
                                                    <option value="male">Male</option>
                                                    <option value="female">Female</option>
                                                </select>
                                            </EditFormField>
                                            <EditFormField label="Birthdate" error={formErrors.birthdate}>
                                                <input
                                                    type="date"
                                                    name="birthdate"
                                                    value={editForm.birthdate}
                                                    onChange={handleEditInputChange}
                                                    className={editFieldClass(!!formErrors.birthdate)}
                                                />
                                            </EditFormField>
                                            <EditFormField label="Color" error={formErrors.color}>
                                                <input
                                                    type="text"
                                                    name="color"
                                                    value={editForm.color}
                                                    onChange={handleEditInputChange}
                                                    className={editFieldClass(!!formErrors.color)}
                                                    placeholder="e.g. Brown, Black"
                                                />
                                            </EditFormField>
                                            <EditFormField label="Weight (kg)" error={formErrors.weight}>
                                                <input
                                                    type="number"
                                                    name="weight"
                                                    value={editForm.weight}
                                                    onChange={handleEditInputChange}
                                                    step="0.01"
                                                    min="0"
                                                    className={editFieldClass(!!formErrors.weight)}
                                                    placeholder="0.00"
                                                />
                                            </EditFormField>
                                            <div className="md:col-span-2">
                                                <EditFormField label="Markings Description" error={formErrors.markings} hint="Describe unique markings">
                                                    <textarea
                                                        name="markings"
                                                        value={editForm.markings}
                                                        onChange={handleEditInputChange}
                                                        rows={3}
                                                        className={editFieldClass(!!formErrors.markings)}
                                                        placeholder="Describe unique markings"
                                                    />
                                                </EditFormField>
                                            </div>
                                            <EditFormField label="Registration Status" error={formErrors.registration_status}>
                                                {pet.registration_status === 'exempt' ? (
                                                    <div className="rounded-xl border border-gray-200 bg-gray-100 px-4 py-2.5 text-sm text-gray-600">
                                                        Exempt (No registration required)
                                                    </div>
                                                ) : (
                                                    <select
                                                        name="registration_status"
                                                        value={editForm.registration_status}
                                                        onChange={handleEditInputChange}
                                                        className={editFieldClass(!!formErrors.registration_status)}
                                                    >
                                                        <option value="unregistered">Pending</option>
                                                        <option value="registered">Registered</option>
                                                        <option value="declined">Declined</option>
                                                    </select>
                                                )}
                                            </EditFormField>
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                                        <SectionHeader compact title="Reproductive Status" subtitle="Optional breeding information" />
                                        <div className="flex flex-wrap gap-2">
                                            <OptionPill active={editForm.reproductive_status === 'pregnant'} onClick={() => toggleReproductiveStatus('pregnant')}>Pregnant</OptionPill>
                                            <OptionPill active={editForm.reproductive_status === 'nursing'} onClick={() => toggleReproductiveStatus('nursing')}>Nursing</OptionPill>
                                            <OptionPill active={editForm.reproductive_status === 'not_pregnant'} onClick={() => toggleReproductiveStatus('not_pregnant')}>Not Pregnant</OptionPill>
                                        </div>
                                        {(editForm.reproductive_status === 'pregnant' || editForm.reproductive_status === 'nursing') && (
                                            <div className="mt-4">
                                                <EditFormField label="Duration" error={formErrors.weeks_months} hint="e.g. 4 weeks">
                                                    <input
                                                        type="text"
                                                        name="weeks_months"
                                                        value={editForm.weeks_months}
                                                        onChange={handleEditInputChange}
                                                        className={editFieldClass(!!formErrors.weeks_months)}
                                                        placeholder="Weeks or months"
                                                    />
                                                </EditFormField>
                                            </div>
                                        )}
                                    </div>

                                    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                                        <SectionHeader compact title="Diet" subtitle="Feeding preferences" />
                                        <div className="flex flex-wrap gap-2">
                                            <OptionPill active={editForm.diet === 'commercial_food'} onClick={() => toggleDiet('commercial_food')}>Commercial Food</OptionPill>
                                            <OptionPill active={editForm.diet === 'table_food'} onClick={() => toggleDiet('table_food')}>Table Food</OptionPill>
                                            <OptionPill active={editForm.diet === 'both'} onClick={() => toggleDiet('both')}>Both</OptionPill>
                                            <OptionPill active={editForm.diet === 'others'} onClick={() => toggleDiet('others')}>Others</OptionPill>
                                        </div>
                                        {editForm.diet === 'others' && (
                                            <div className="mt-4">
                                                <EditFormField label="Specify Diet" error={formErrors.diet_other}>
                                                    <input
                                                        type="text"
                                                        name="diet_other"
                                                        value={editForm.diet_other}
                                                        onChange={handleEditInputChange}
                                                        className={editFieldClass(!!formErrors.diet_other)}
                                                        placeholder="Describe the diet"
                                                    />
                                                </EditFormField>
                                            </div>
                                        )}
                                    </div>

                                    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                                        <SectionHeader compact title="Deworming History" subtitle="Past deworming records" />
                                        <div className="space-y-4">
                                            <YesNoRow label="Has been dewormed?" value={editForm.dewormed} onChange={(val) => setEditField('dewormed', val)} />
                                            {editForm.dewormed === 'yes' && (
                                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                                    <EditFormField label="Last Deworming Date" error={formErrors.last_deworming_date}>
                                                        <input
                                                            type="date"
                                                            name="last_deworming_date"
                                                            value={editForm.last_deworming_date}
                                                            onChange={handleEditInputChange}
                                                            className={editFieldClass(!!formErrors.last_deworming_date)}
                                                        />
                                                    </EditFormField>
                                                    <EditFormField label="Dewormer Name" error={formErrors.dewormer_name}>
                                                        <input
                                                            type="text"
                                                            name="dewormer_name"
                                                            value={editForm.dewormer_name}
                                                            onChange={handleEditInputChange}
                                                            className={editFieldClass(!!formErrors.dewormer_name)}
                                                            placeholder="Name of dewormer"
                                                        />
                                                    </EditFormField>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                                        <SectionHeader compact title="Vaccination History" subtitle="Vaccination records" />
                                        <div className="space-y-4">
                                            <YesNoRow label="Rabies vaccine" value={editForm.rabies_vaccine} onChange={(val) => setEditField('rabies_vaccine', val)} />
                                            {editForm.rabies_vaccine === 'yes' && (
                                                <EditFormField label="Last Rabies Vaccination" error={formErrors.rabies_last_vaccination}>
                                                    <input
                                                        type="date"
                                                        name="rabies_last_vaccination"
                                                        value={editForm.rabies_last_vaccination}
                                                        onChange={handleEditInputChange}
                                                        className={editFieldClass(!!formErrors.rabies_last_vaccination)}
                                                    />
                                                </EditFormField>
                                            )}

                                            <YesNoRow label="DHPPL vaccine" value={editForm.dhppl_vaccine} onChange={(val) => setEditField('dhppl_vaccine', val)} />
                                            {editForm.dhppl_vaccine === 'yes' && (
                                                <EditFormField label="Last DHPPL Vaccination" error={formErrors.dhppl_last_vaccination}>
                                                    <input
                                                        type="date"
                                                        name="dhppl_last_vaccination"
                                                        value={editForm.dhppl_last_vaccination}
                                                        onChange={handleEditInputChange}
                                                        className={editFieldClass(!!formErrors.dhppl_last_vaccination)}
                                                    />
                                                </EditFormField>
                                            )}

                                            <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3.5">
                                                <p className="mb-3 text-sm font-medium text-gray-700">Other vaccine</p>
                                                <EditFormField label="Vaccine Name" error={formErrors.other_vaccine_name} hint="Leave empty if none">
                                                    <input
                                                        type="text"
                                                        name="other_vaccine_name"
                                                        value={editForm.other_vaccine_name}
                                                        onChange={handleEditInputChange}
                                                        className={editFieldClass(!!formErrors.other_vaccine_name)}
                                                        placeholder="Name of vaccine"
                                                    />
                                                </EditFormField>
                                                {editForm.other_vaccine_name.trim() ? (
                                                    <div className="mt-4">
                                                        <EditFormField label="Last Vaccination Date" error={formErrors.other_vaccine_last_vaccination}>
                                                            <input
                                                                type="date"
                                                                name="other_vaccine_last_vaccination"
                                                                value={editForm.other_vaccine_last_vaccination}
                                                                onChange={handleEditInputChange}
                                                                className={editFieldClass(!!formErrors.other_vaccine_last_vaccination)}
                                                            />
                                                        </EditFormField>
                                                    </div>
                                                ) : (
                                                    <p className="mt-2 text-xs text-gray-500">None</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50/80 px-6 py-4">
                                    <button
                                        type="button"
                                        onClick={() => setShowEditModal(false)}
                                        className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-white"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={saveEdit}
                                        className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-violet-200 transition-colors hover:bg-violet-700"
                                    >
                                        Save Changes
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {photoPreview.open && (
                        <div
                            className="fixed inset-0 z-[90] flex items-center justify-center p-4"
                            onClick={() => setPhotoPreview({ open: false, url: '', label: '' })}
                        >
                            <div className="fixed inset-0 bg-black/75 backdrop-blur-sm" />
                            <div className="relative max-w-4xl w-full flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
                                <img
                                    src={photoPreview.url}
                                    alt={photoPreview.label}
                                    className="max-h-[80vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl"
                                />
                                <p className="mt-3 text-white text-sm">{photoPreview.label}</p>
                                <button
                                    type="button"
                                    onClick={() => setPhotoPreview({ open: false, url: '', label: '' })}
                                    className="mt-3 px-4 py-2 bg-white/90 text-gray-900 rounded-lg text-sm font-medium hover:bg-white"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    )}

                    <AnimalQrModal
                        open={showQrModal}
                        animal={pet}
                        ownerId={client?.id}
                        onClose={() => setShowQrModal(false)}
                    />
                </main>
            </div>
        </div>
    );
}

