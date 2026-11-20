import { useForm, usePage } from '@inertiajs/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import BudgetSidebar from '@/Components/Budget/BudgetSidebar';
import BudgetNotificationBell from '@/Components/Budget/BudgetNotificationBell';
import BudgetHeaderUser from '@/Components/Budget/BudgetHeaderUser';
import PhotoCropModal from '@/Components/Admin/PhotoCropModal';
import { compressImageFile, uploadImageToCloudinary } from '@/utils/cloudinary';
import { formatZoneLabel } from '@/utils/formatZone';

// Diri i-format ang role nga readable.
function formatRole(role) {
    if (!role) return 'Budget Officer';
    return role
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

// Diri i-format ang petsa.
function formatDate(value) {
    if (!value) return '—';
    const dt = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(dt.getTime())) return String(value);
    return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// Diri ang field sa form nga naay label.
function Field({ label, error, children, hint }) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
            {children}
            {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
            {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
        </label>
    );
}

// Diri ang row sa info nga naay label ug value.
function InfoRow({ label, value }) {
    return (
        <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
            <p className="mt-1 text-sm font-medium text-slate-900">{value || '—'}</p>
        </div>
    );
}

// Diri ang class sa input depende sa error.
function inputClass(hasError) {
    return `w-full rounded-lg border px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 ${
        hasError
            ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
            : 'border-slate-200 focus:border-violet-400 focus:ring-violet-100'
    }`;
}

// Diri ang page sa profile sa budget officer.
export default function Profile({ profile, barangays = [], zones = [] }) {
    const { flash, cloudinary, auth } = usePage().props;
    const [flashMessage, setFlashMessage] = useState(null);
    const [editing, setEditing] = useState(false);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [photoPreview, setPhotoPreview] = useState('');
    const photoPreviewRef = useRef('');
    const [cropSrc, setCropSrc] = useState('');
    const cropSrcRef = useRef('');
    const [zoneOptions, setZoneOptions] = useState(() => (Array.isArray(zones) ? zones : []));
    const headerName = auth?.user?.name || profile?.name || 'Budget Officer';
    const pendingPhotoUrlRef = useRef('');

    const { data, setData, post, processing, errors, reset } = useForm({
        firstname: profile?.firstname || '',
        middlename: profile?.middlename || '',
        lastname: profile?.lastname || '',
        age: profile?.age ?? '',
        email: profile?.email || '',
        phone_number: profile?.phone_number || '',
        facebook: profile?.facebook || '',
        barangay_id: profile?.barangay_id || '',
        zone: profile?.zone || '',
        profile_photo_url: profile?.profile_photo_url || '',
        password: '',
        password_confirmation: '',
    });

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

    useEffect(() => {
        setData({
            firstname: profile?.firstname || '',
            middlename: profile?.middlename || '',
            lastname: profile?.lastname || '',
            age: profile?.age ?? '',
            email: profile?.email || '',
            phone_number: profile?.phone_number || '',
            facebook: profile?.facebook || '',
            barangay_id: profile?.barangay_id || '',
            zone: profile?.zone || '',
            profile_photo_url: pendingPhotoUrlRef.current || profile?.profile_photo_url || '',
            password: '',
            password_confirmation: '',
        });
    }, [profile]);

    useEffect(() => {
        if (Array.isArray(zones) && zones.length) {
            setZoneOptions(zones);
        }
    }, [zones]);

    useEffect(() => {
        let cancelled = false;

        fetch('/admin/zones', {
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
        })
            .then((response) => (response.ok ? response.json() : []))
            .then((payload) => {
                if (cancelled) return;
                const list = Array.isArray(payload) ? payload : [];
                if (list.length) setZoneOptions(list);
            })
            .catch(() => {});

        return () => {
            cancelled = true;
        };
    }, []);

    const displayName = useMemo(() => {
        const name = [profile?.firstname, profile?.middlename, profile?.lastname].filter(Boolean).join(' ').trim();
        return name || profile?.name || 'Budget Officer';
    }, [profile]);

    const photoUrl = photoPreview || data.profile_photo_url || profile?.profile_photo_url || '';

    // Diri tangtangon ang preview sa litrato.
    const clearPhotoPreview = () => {
        if (photoPreviewRef.current) {
            URL.revokeObjectURL(photoPreviewRef.current);
            photoPreviewRef.current = '';
        }
        setPhotoPreview('');
    };

    // Diri sirado ang crop modal.
    const closeCropModal = () => {
        if (cropSrcRef.current) {
            URL.revokeObjectURL(cropSrcRef.current);
            cropSrcRef.current = '';
        }
        setCropSrc('');
    };

    useEffect(
        () => () => {
            clearPhotoPreview();
            closeCropModal();
        },
        []
    );

    const initials = displayName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('');

    const zonesForBarangay = useMemo(
        () => zoneOptions.filter((zone) => String(zone.barangay_id) === String(data.barangay_id)),
        [zoneOptions, data.barangay_id]
    );

    const zoneIsKnown = zonesForBarangay.some((zone) => zone.name === data.zone);

    // Diri ilisan ang barangay ug i-reset ang zone.
    const handleBarangayChange = (event) => {
        const nextBarangayId = event.target.value;
        setData('barangay_id', nextBarangayId);
        setData('zone', '');
    };

    // Diri sugdan ang pag-edit sa profile.
    const startEdit = () => setEditing(true);

    // Diri i-cancel ang pag-edit ug ibalik ang data.
    const cancelEdit = () => {
        pendingPhotoUrlRef.current = '';
        reset();
        setData({
            firstname: profile?.firstname || '',
            middlename: profile?.middlename || '',
            lastname: profile?.lastname || '',
            age: profile?.age ?? '',
            email: profile?.email || '',
            phone_number: profile?.phone_number || '',
            facebook: profile?.facebook || '',
            barangay_id: profile?.barangay_id || '',
            zone: profile?.zone || '',
            profile_photo_url: profile?.profile_photo_url || '',
            password: '',
            password_confirmation: '',
        });
        clearPhotoPreview();
        closeCropModal();
        setEditing(false);
    };

    // Diri i-save ang profile.
    const saveProfile = (event) => {
        event.preventDefault();
        post('/budget/profile', {
            preserveScroll: true,
            onSuccess: () => {
                pendingPhotoUrlRef.current = '';
                clearPhotoPreview();
                setEditing(false);
                setData('password', '');
                setData('password_confirmation', '');
            },
        });
    };

    // Diri pilion ang litrato para i-crop.
    const handlePhotoPick = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        closeCropModal();
        const preview = URL.createObjectURL(file);
        cropSrcRef.current = preview;
        setCropSrc(preview);
        event.target.value = '';
    };

    // Diri gamiton ang na-crop nga litrato.
    const handleCropConfirm = async (file) => {
        closeCropModal();
        clearPhotoPreview();
        const preview = URL.createObjectURL(file);
        photoPreviewRef.current = preview;
        setPhotoPreview(preview);
        setUploadingPhoto(true);

        try {
            const prepared = await compressImageFile(file);
            const url = await uploadImageToCloudinary(prepared, {
                cloudName: cloudinary?.cloudName,
                uploadPreset: cloudinary?.uploadPreset,
            });
            pendingPhotoUrlRef.current = url;
            setData('profile_photo_url', url);
        } catch (err) {
            clearPhotoPreview();
            setFlashMessage({ type: 'error', text: err.message || 'Could not upload photo.' });
        } finally {
            setUploadingPhoto(false);
        }
    };

    const photoPicker = editing ? (
        <label className={`absolute -bottom-1 -right-1 inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-navy text-white shadow ${uploadingPhoto ? 'pointer-events-none opacity-60' : 'cursor-pointer hover:bg-slate-800'}`}>
            <input type="file" accept="image/*" className="hidden" onChange={handlePhotoPick} disabled={uploadingPhoto} />
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
        </label>
    ) : null;

    const avatar = (
        <div className="relative shrink-0">
            {photoUrl ? (
                <img src={photoUrl} alt={displayName} className="h-24 w-24 rounded-full object-cover ring-4 ring-white shadow-sm" />
            ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-navy text-2xl font-bold text-white ring-4 ring-white shadow-sm">
                    {initials || 'B'}
                </div>
            )}
            {uploadingPhoto ? (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-slate-900/55">
                    <svg className="h-6 w-6 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                </div>
            ) : null}
            {photoPicker}
        </div>
    );

    const zoneSelect = (
        <select
            className={`${inputClass(errors.zone)} disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60`}
            value={data.zone || ''}
            onChange={(e) => setData('zone', e.target.value)}
            disabled={!data.barangay_id}
        >
            <option value="">{data.barangay_id ? 'Select zone' : 'Select a barangay first'}</option>
            {zonesForBarangay.map((zone) => (
                <option key={zone.id} value={zone.name}>
                    {zone.name}
                </option>
            ))}
            {data.barangay_id && zonesForBarangay.length === 0 ? (
                <option value="" disabled>
                    No zones for this barangay
                </option>
            ) : null}
            {data.zone && !zoneIsKnown ? <option value={data.zone}>{data.zone}</option> : null}
        </select>
    );

    return (
        <div className="flex min-h-screen bg-canvas">
            <BudgetSidebar />

            <div className="staff-main flex flex-1 flex-col">
                <header className="sticky top-0 z-30 border-b border-line bg-white px-6 py-4">
                    <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                            <p className="app-kicker">Account</p>
                            <h1 className="text-xl font-bold tracking-tight text-navy">Profile</h1>
                            <p className="text-sm text-muted">Your account details.</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <BudgetNotificationBell />
                            <BudgetHeaderUser name={headerName} photoUrl={photoUrl} />
                        </div>
                    </div>
                </header>

                <main className="flex-1 p-8">
                    <div className="space-y-8">
                        {flashMessage && (
                            <div
                                className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${
                                    flashMessage.type === 'success'
                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                        : 'border-red-200 bg-red-50 text-red-800'
                                }`}
                            >
                                {flashMessage.text}
                            </div>
                        )}

                        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                            <div className="bg-navy px-6 py-8 sm:px-8">
                                <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex items-center gap-5">
                                        {avatar}
                                        <div className="min-w-0 text-white">
                                            <h2 className="text-2xl font-bold tracking-tight !text-white">{displayName}</h2>
                                            <p className="mt-1 truncate text-sm text-white/70">{profile?.email}</p>
                                            <p className="mt-3 inline-flex rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-teal">
                                                {uploadingPhoto ? 'Uploading photo…' : formatRole(profile?.role)}
                                            </p>
                                            {errors.profile_photo_url ? (
                                                <p className="mt-2 text-xs font-medium text-red-200">{errors.profile_photo_url}</p>
                                            ) : null}
                                        </div>
                                    </div>
                                    {!editing ? (
                                        <button
                                            type="button"
                                            onClick={startEdit}
                                            className="shrink-0 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-navy hover:bg-slate-100"
                                        >
                                            Edit profile
                                        </button>
                                    ) : null}
                                </div>
                            </div>

                            {!editing ? (
                                <div className="grid gap-px bg-slate-100 sm:grid-cols-3">
                                    <div className="space-y-5 bg-white p-6">
                                        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Personal</h3>
                                        <InfoRow label="First name" value={profile?.firstname} />
                                        <InfoRow label="Middle name" value={profile?.middlename} />
                                        <InfoRow label="Last name" value={profile?.lastname} />
                                        <InfoRow label="Age" value={profile?.age} />
                                    </div>
                                    <div className="space-y-5 bg-white p-6">
                                        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Contact</h3>
                                        <InfoRow label="Email address" value={profile?.email} />
                                        <InfoRow label="Phone" value={profile?.phone_number} />
                                        <InfoRow label="Facebook" value={profile?.facebook} />
                                    </div>
                                    <div className="space-y-5 bg-white p-6">
                                        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Location</h3>
                                        <InfoRow label="Barangay" value={profile?.barangay} />
                                        <InfoRow label="Zone" value={formatZoneLabel(profile?.zone)} />
                                        <InfoRow label="Member since" value={formatDate(profile?.created_at)} />
                                    </div>
                                </div>
                            ) : (
                                <form onSubmit={saveProfile} className="space-y-6 p-6 sm:p-8">
                                    <div className="grid gap-6 lg:grid-cols-2">
                                        <div className="space-y-4 rounded-2xl border border-slate-200 p-5">
                                            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Personal</h3>
                                            <Field label="First name" error={errors.firstname}>
                                                <input className={inputClass(errors.firstname)} value={data.firstname} onChange={(e) => setData('firstname', e.target.value)} required />
                                            </Field>
                                            <Field label="Last name" error={errors.lastname}>
                                                <input className={inputClass(errors.lastname)} value={data.lastname} onChange={(e) => setData('lastname', e.target.value)} required />
                                            </Field>
                                            <Field label="Middle name" error={errors.middlename}>
                                                <input className={inputClass(errors.middlename)} value={data.middlename} onChange={(e) => setData('middlename', e.target.value)} />
                                            </Field>
                                            <Field label="Age" error={errors.age}>
                                                <input type="number" min="1" max="120" className={inputClass(errors.age)} value={data.age} onChange={(e) => setData('age', e.target.value)} />
                                            </Field>
                                        </div>
                                        <div className="space-y-4 rounded-2xl border border-slate-200 p-5">
                                            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Contact</h3>
                                            <Field label="Email address" error={errors.email}>
                                                <input type="email" className={inputClass(errors.email)} value={data.email} onChange={(e) => setData('email', e.target.value)} required />
                                            </Field>
                                            <Field label="Phone" error={errors.phone_number} hint="Must start with 09 and be 11 digits">
                                                <input type="tel" maxLength={11} className={inputClass(errors.phone_number)} value={data.phone_number} onChange={(e) => setData('phone_number', e.target.value)} placeholder="09XXXXXXXXX" />
                                            </Field>
                                            <Field label="Facebook" error={errors.facebook}>
                                                <input className={inputClass(errors.facebook)} value={data.facebook} onChange={(e) => setData('facebook', e.target.value)} placeholder="Name or profile link" />
                                            </Field>
                                        </div>
                                        <div className="space-y-4 rounded-2xl border border-slate-200 p-5">
                                            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Location</h3>
                                            <Field label="Barangay" error={errors.barangay_id}>
                                                <select className={inputClass(errors.barangay_id)} value={data.barangay_id || ''} onChange={handleBarangayChange}>
                                                    <option value="">Select barangay</option>
                                                    {barangays.map((barangay) => (
                                                        <option key={barangay.id} value={barangay.id}>
                                                            {barangay.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </Field>
                                            <Field label="Zone" error={errors.zone}>
                                                {zoneSelect}
                                            </Field>
                                        </div>
                                        <div className="space-y-4 rounded-2xl border border-slate-200 p-5">
                                            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Password</h3>
                                            <Field label="New password" error={errors.password} hint="Leave blank to keep your current password">
                                                <input type="password" className={inputClass(errors.password)} value={data.password} onChange={(e) => setData('password', e.target.value)} placeholder="Minimum 8 characters" />
                                            </Field>
                                            <Field label="Confirm password" error={errors.password_confirmation}>
                                                <input type="password" className={inputClass(errors.password_confirmation)} value={data.password_confirmation} onChange={(e) => setData('password_confirmation', e.target.value)} />
                                            </Field>
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-3">
                                        <button type="button" onClick={cancelEdit} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                                            Cancel
                                        </button>
                                        <button type="submit" disabled={processing || uploadingPhoto} className="rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                                            {processing ? 'Saving…' : 'Save changes'}
                                        </button>
                                    </div>
                                </form>
                            )}
                        </section>
                    </div>
                </main>
            </div>
            <PhotoCropModal imageSrc={cropSrc} onCancel={closeCropModal} onConfirm={handleCropConfirm} />
        </div>
    );
}
