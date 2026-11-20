import { useForm, usePage } from '@inertiajs/react';
import { useMemo, useRef, useState } from 'react';
import PhotoCropModal from '@/Components/Admin/PhotoCropModal';
import { compressImageFile, uploadImageToCloudinary } from '@/utils/cloudinary';
import { formatZoneLabel } from '@/utils/formatZone';

// Diri himuon ang CSS class sa input, pula kung naay error.
function inputClass(hasError) {
    return `w-full rounded-lg border px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 ${
        hasError
            ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
            : 'border-slate-200 focus:border-violet-400 focus:ring-violet-100'
    }`;
}

// Diri ang form field nga naay label ug error.
function Field({ label, error, children }) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
            {children}
            {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
        </label>
    );
}

// Diri kuhaon ang initials sa veterinarian.
function initialsFor(name) {
    const parts = String(name || 'V')
        .split(/[\s._-]+/)
        .filter(Boolean);
    return parts
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('') || 'V';
}

// Diri ang card sa usa ka veterinarian profile.
function VeterinarianCard({ vet }) {
    const name = vet.name || '—';

    return (
        <article className="w-full rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center gap-5">
                {vet.profile_photo_url ? (
                    <img src={vet.profile_photo_url} alt={name} className="h-20 w-20 shrink-0 rounded-full object-cover ring-2 ring-slate-100" />
                ) : (
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-navy text-lg font-bold text-white">
                        {initialsFor(name)}
                    </div>
                )}
                <div className="min-w-0 flex-1">
                    <h4 className="text-lg font-bold leading-tight text-navy">{name}</h4>
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        {vet.title || 'Veterinarian'}
                    </p>
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        {[vet.barangay, formatZoneLabel(vet.zone)].filter(Boolean).join(' · ') || 'No location'}
                    </p>
                    <p className="mt-1 break-all text-sm text-slate-500">{vet.email || '—'}</p>
                </div>
            </div>
        </article>
    );
}

const emptyForm = {
    firstname: '',
    lastname: '',
    email: '',
    barangay_id: '',
    zone: '',
    profile_photo_url: '',
    title: 'Veterinarian',
};

// Diri ang card sa pag-manage sa veterinarian profiles.
export default function VeterinarianProfilesCard({ profiles = [], barangays = [], zones = [] }) {
    const { cloudinary } = usePage().props;
    const [adding, setAdding] = useState(false);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [cropSrc, setCropSrc] = useState('');
    const cropSrcRef = useRef('');
    const { data, setData, post, processing, errors, reset, clearErrors } = useForm(emptyForm);

    const zonesForBarangay = useMemo(
        () => zones.filter((zone) => String(zone.barangay_id) === String(data.barangay_id)),
        [zones, data.barangay_id]
    );

    // Diri isira ang crop modal ug limpyohan ang preview URL.
    const closeCrop = () => {
        if (cropSrcRef.current) {
            URL.revokeObjectURL(cropSrcRef.current);
            cropSrcRef.current = '';
        }
        setCropSrc('');
    };

    // Diri ablihan ang form para mag-add ug veterinarian.
    const openForm = () => {
        clearErrors();
        setData({ ...emptyForm });
        setAdding(true);
    };

    // Diri isira ug i-reset ang veterinarian form.
    const closeForm = () => {
        reset();
        clearErrors();
        closeCrop();
        setAdding(false);
    };

    // Diri ang pagpili sa photo una i-crop.
    const handlePhotoPick = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        closeCrop();
        const preview = URL.createObjectURL(file);
        cropSrcRef.current = preview;
        setCropSrc(preview);
        event.target.value = '';
    };

    // Diri i-upload ang na-crop nga photo sa Cloudinary.
    const handleCropConfirm = async (file) => {
        closeCrop();
        setUploadingPhoto(true);
        try {
            const prepared = await compressImageFile(file);
            const url = await uploadImageToCloudinary(prepared, {
                cloudName: cloudinary?.cloudName,
                uploadPreset: cloudinary?.uploadPreset,
            });
            setData('profile_photo_url', url);
        } catch (err) {
            setData('profile_photo_url', '');
        } finally {
            setUploadingPhoto(false);
        }
    };

    // Diri i-save ang bag-ong veterinarian profile.
    const submitProfile = (event) => {
        event.preventDefault();
        post('/admin/settings/veterinarians', {
            preserveScroll: true,
            onSuccess: () => closeForm(),
        });
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold text-slate-900">Veterinarian profiles</h2>
                <p className="mt-1 text-sm text-slate-500">Office veterinarian profiles. These are not login accounts.</p>
            </div>

            {profiles.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-16 text-center text-sm text-slate-400">
                    No veterinarian profiles yet
                </div>
            ) : (
                <div className="grid max-w-xl gap-4 md:max-w-none md:grid-cols-2">
                    {profiles.map((vet) => (
                        <VeterinarianCard key={vet.id} vet={vet} />
                    ))}
                </div>
            )}

            {adding ? (
                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h3 className="text-base font-semibold text-slate-900">Add veterinarian profile</h3>
                    <p className="mt-1 text-sm text-slate-500">Saved as a profile only. No email login is created.</p>

                    <form onSubmit={submitProfile} className="mt-5 space-y-5">
                        <div className="flex items-center gap-4">
                            {data.profile_photo_url ? (
                                <img src={data.profile_photo_url} alt="Preview" className="h-16 w-16 rounded-full object-cover ring-2 ring-white shadow" />
                            ) : (
                                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">
                                    {initialsFor(`${data.firstname} ${data.lastname}`)}
                                </div>
                            )}
                            <label className="cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoPick} disabled={uploadingPhoto} />
                                {uploadingPhoto ? 'Uploading…' : 'Add photo'}
                            </label>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            <Field label="First name" error={errors.firstname}>
                                <input className={inputClass(errors.firstname)} value={data.firstname} onChange={(e) => setData('firstname', e.target.value)} required />
                            </Field>
                            <Field label="Last name" error={errors.lastname}>
                                <input className={inputClass(errors.lastname)} value={data.lastname} onChange={(e) => setData('lastname', e.target.value)} required />
                            </Field>
                            <Field label="Title" error={errors.title}>
                                <input className={inputClass(errors.title)} value={data.title} onChange={(e) => setData('title', e.target.value)} placeholder="Veterinarian" />
                            </Field>
                            <Field label="Email address" error={errors.email}>
                                <input type="email" className={inputClass(errors.email)} value={data.email} onChange={(e) => setData('email', e.target.value)} />
                            </Field>
                            <Field label="Barangay" error={errors.barangay_id}>
                                <select
                                    className={inputClass(errors.barangay_id)}
                                    value={data.barangay_id || ''}
                                    onChange={(e) => {
                                        setData('barangay_id', e.target.value);
                                        setData('zone', '');
                                    }}
                                >
                                    <option value="">Select barangay</option>
                                    {barangays.map((barangay) => (
                                        <option key={barangay.id} value={barangay.id}>
                                            {barangay.name}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Zone" error={errors.zone}>
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
                                </select>
                            </Field>
                        </div>

                        <div className="flex gap-3">
                            <button type="button" onClick={closeForm} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                                Cancel
                            </button>
                            <button type="submit" disabled={processing || uploadingPhoto} className="rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                                {processing ? 'Saving…' : 'Save profile'}
                            </button>
                        </div>
                    </form>
                </section>
            ) : (
                <div className="flex justify-end">
                    <button type="button" onClick={openForm} className="rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
                        Add profile
                    </button>
                </div>
            )}

            <PhotoCropModal imageSrc={cropSrc} onCancel={closeCrop} onConfirm={handleCropConfirm} />
        </div>
    );
}
