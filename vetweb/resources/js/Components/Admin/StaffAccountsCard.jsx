import { useForm } from '@inertiajs/react';
import { useMemo, useState } from 'react';
import { formatZoneLabel } from '@/utils/formatZone';

// Diri himuon ang CSS class sa input, pula kung naay error.
function inputClass(hasError) {
    return `w-full rounded-lg border px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 ${
        hasError
            ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
            : 'border-slate-200 focus:border-violet-400 focus:ring-violet-100'
    }`;
}

// Diri ang form field nga naay label, hint, ug error.
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

// Diri ang usa ka row sa staff info nga label ug value.
function InfoRow({ label, value }) {
    return (
        <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
            <p className="mt-1 break-words text-sm font-medium text-slate-900">{value || '—'}</p>
        </div>
    );
}

// Diri kuhaon ang initials sa staff gikan sa ngalan o email.
function initialsFor(name, email) {
    const source = (name || email || 'S').trim();
    const parts = source.split(/[\s@._-]+/).filter(Boolean);
    return parts
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('') || 'S';
}

// Diri i-format ang petsa para ipakita.
function formatDate(value) {
    if (!value) return '—';
    const dt = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(dt.getTime())) return String(value);
    return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// Diri i-convert ang role ngadto sa readable label.
function roleLabel(role) {
    return role === 'budget_officer' ? 'Budget Officer' : 'Fieldman';
}

const emptyFieldmanForm = {
    firstname: '',
    lastname: '',
    middlename: '',
    age: '',
    phone_number: '',
    barangay_id: '',
    zone: '',
    facebook: '',
    email: '',
    password: '',
    password_confirmation: '',
};

// Diri i-convert ang staff data ngadto sa form values.
function staffToForm(staff) {
    return {
        firstname: staff?.firstname || '',
        lastname: staff?.lastname || '',
        middlename: staff?.middlename || '',
        age: staff?.age ?? '',
        phone_number: staff?.phone_number || '',
        barangay_id: staff?.barangay_id || '',
        zone: staff?.zone || '',
        facebook: staff?.facebook || '',
        email: staff?.email || '',
        password: '',
        password_confirmation: '',
    };
}

// Diri ang avatar sa staff, photo o initials.
function Avatar({ staff, size = 'h-20 w-20', text = 'text-lg' }) {
    const name = staff.name || '—';

    if (staff.profile_photo_url) {
        return (
            <img
                src={staff.profile_photo_url}
                alt={name}
                className={`${size} shrink-0 rounded-full object-cover ring-2 ring-slate-100`}
            />
        );
    }

    return (
        <div className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-navy ${text} font-bold text-white`}>
            {initialsFor(staff.name, staff.email)}
        </div>
    );
}

// Diri ang card sa pag-manage sa staff accounts.
export default function StaffAccountsCard({ staffAccounts = [], barangays = [], zones = [] }) {
    const [mode, setMode] = useState(null);
    const [selected, setSelected] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
    const { data, setData, post, processing, errors, reset, clearErrors } = useForm(emptyFieldmanForm);

    const fieldmen = staffAccounts.filter((staff) => staff.role === 'fieldman');
    const budgetOfficers = staffAccounts.filter((staff) => staff.role === 'budget_officer');

    const zonesForBarangay = useMemo(
        () => zones.filter((zone) => String(zone.barangay_id) === String(data.barangay_id)),
        [zones, data.barangay_id]
    );

    // Diri isira ang panel ug i-reset ang form.
    const closePanel = () => {
        reset();
        clearErrors();
        setMode(null);
        setSelected(null);
        setShowPassword(false);
        setShowPasswordConfirm(false);
    };

    // Diri ablihan ang form para mag-add ug fieldman.
    const openCreate = () => {
        clearErrors();
        setData({ ...emptyFieldmanForm });
        setSelected(null);
        setShowPassword(false);
        setShowPasswordConfirm(false);
        setMode('create');
    };

    // Diri ipakita ang details sa gipili nga staff.
    const openView = (staff) => {
        setSelected(staff);
        setMode('view');
    };

    // Diri ablihan ang edit form sa staff.
    const openEdit = (staff) => {
        clearErrors();
        setData(staffToForm(staff));
        setSelected(staff);
        setShowPassword(false);
        setShowPasswordConfirm(false);
        setMode('edit');
    };

    // Diri i-save ang bag-o o gi-edit nga staff.
    const submitStaff = (event) => {
        event.preventDefault();
        const url = mode === 'edit' && selected
            ? `/admin/settings/staff/${selected.id}`
            : '/admin/settings/staff';

        post(url, {
            preserveScroll: true,
            onSuccess: () => closePanel(),
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
                <h2 className="text-lg font-semibold text-slate-900">Staff accounts</h2>
                <button
                    type="button"
                    onClick={openCreate}
                    className="rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                    Add fieldman
                </button>
            </div>

            <div className="grid items-start gap-6 lg:grid-cols-2">
                <RoleColumn title="Fieldman" people={fieldmen} onView={openView} />
                <RoleColumn title="Budget Officer" people={budgetOfficers} onView={openView} onEdit={openEdit} />
            </div>

            {mode === 'create' || mode === 'edit' ? (
                <div
                    className={mode === 'create' ? 'fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4' : undefined}
                    onClick={mode === 'create' ? (event) => {
                        if (event.target === event.currentTarget) closePanel();
                    } : undefined}
                >
                <section className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${mode === 'create' ? 'max-h-[90vh] w-full max-w-4xl overflow-y-auto' : 'w-full'}`}>
                    <h3 className="mb-5 text-base font-semibold text-slate-900">
                        {mode === 'edit' ? 'Edit budget officer' : 'Add fieldman'}
                    </h3>

                    <form onSubmit={submitStaff} className="space-y-5">
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            <Field label="First name" error={errors.firstname}>
                                <input className={inputClass(errors.firstname)} value={data.firstname} onChange={(e) => setData('firstname', e.target.value)} required />
                            </Field>
                            <Field label="Middle name" error={errors.middlename}>
                                <input className={inputClass(errors.middlename)} value={data.middlename} onChange={(e) => setData('middlename', e.target.value)} />
                            </Field>
                            <Field label="Last name" error={errors.lastname}>
                                <input className={inputClass(errors.lastname)} value={data.lastname} onChange={(e) => setData('lastname', e.target.value)} required />
                            </Field>
                            <Field label="Age" error={errors.age}>
                                <input type="number" min="1" max="120" className={inputClass(errors.age)} value={data.age} onChange={(e) => setData('age', e.target.value)} required />
                            </Field>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            <Field label="Email address" error={errors.email}>
                                <input type="email" className={inputClass(errors.email)} value={data.email} onChange={(e) => setData('email', e.target.value)} required />
                            </Field>
                            <Field label="Phone" error={errors.phone_number} hint="09 and 11 digits">
                                <input type="tel" maxLength={11} className={inputClass(errors.phone_number)} value={data.phone_number} onChange={(e) => setData('phone_number', e.target.value)} placeholder="09XXXXXXXXX" />
                            </Field>
                            <Field label="Facebook" error={errors.facebook}>
                                <input className={inputClass(errors.facebook)} value={data.facebook} onChange={(e) => setData('facebook', e.target.value)} placeholder="Name or profile link" />
                            </Field>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            <Field label="Barangay" error={errors.barangay_id}>
                                <select
                                    className={inputClass(errors.barangay_id)}
                                    value={data.barangay_id || ''}
                                    onChange={(e) => {
                                        setData('barangay_id', e.target.value);
                                        setData('zone', '');
                                    }}
                                    required
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
                                    required={zonesForBarangay.length > 0}
                                >
                                    <option value="">{data.barangay_id ? 'Select zone' : 'Select a barangay first'}</option>
                                    {zonesForBarangay.map((zone) => (
                                        <option key={zone.id} value={zone.name}>
                                            {zone.name}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            <Field
                                label={mode === 'edit' ? 'New password' : 'Password'}
                                error={errors.password}
                                hint={mode === 'edit' ? 'Leave blank to keep the current password' : 'Minimum 8 characters'}
                            >
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        className={`${inputClass(errors.password)} pr-16`}
                                        value={data.password}
                                        onChange={(e) => setData('password', e.target.value)}
                                        required={mode !== 'edit'}
                                        minLength={mode === 'edit' && !data.password ? undefined : 8}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword((value) => !value)}
                                        className="absolute inset-y-0 right-0 px-3 text-xs font-semibold text-slate-500 hover:text-navy"
                                    >
                                        {showPassword ? 'Hide' : 'Show'}
                                    </button>
                                </div>
                            </Field>
                            <Field label="Confirm password" error={errors.password_confirmation}>
                                <div className="relative">
                                    <input
                                        type={showPasswordConfirm ? 'text' : 'password'}
                                        className={`${inputClass(errors.password_confirmation)} pr-16`}
                                        value={data.password_confirmation}
                                        onChange={(e) => setData('password_confirmation', e.target.value)}
                                        required={mode !== 'edit' ? true : Boolean(data.password)}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPasswordConfirm((value) => !value)}
                                        className="absolute inset-y-0 right-0 px-3 text-xs font-semibold text-slate-500 hover:text-navy"
                                    >
                                        {showPasswordConfirm ? 'Hide' : 'Show'}
                                    </button>
                                </div>
                            </Field>
                        </div>

                        <div className="flex justify-end gap-3">
                            <button type="button" onClick={closePanel} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                                Cancel
                            </button>
                            <button type="submit" disabled={processing} className="rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                                {processing ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create fieldman'}
                            </button>
                        </div>
                    </form>
                </section>
                </div>
            ) : null}

            {mode === 'view' && selected ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
                    <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-xl">
                        <div className="flex items-center gap-4 border-b border-slate-100 px-6 py-5">
                            <Avatar staff={selected} size="h-16 w-16" text="text-base" />
                            <div>
                                <h3 className="text-lg font-bold text-navy">{selected.name || '—'}</h3>
                                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                                    {roleLabel(selected.role)}
                                </p>
                            </div>
                        </div>
                        <div className="grid gap-5 p-6 sm:grid-cols-2">
                            <InfoRow label="Age" value={selected.age} />
                            <InfoRow label="Member since" value={formatDate(selected.created_at)} />
                            <InfoRow label="Email address" value={selected.email} />
                            <InfoRow label="Phone" value={selected.phone_number} />
                            <InfoRow label="Barangay" value={selected.barangay} />
                            <InfoRow label="Zone" value={formatZoneLabel(selected.zone)} />
                            <div className="sm:col-span-2">
                                <InfoRow label="Facebook" value={selected.facebook} />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
                            {selected.role === 'budget_officer' ? (
                                <button
                                    type="button"
                                    onClick={() => openEdit(selected)}
                                    className="rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                                >
                                    Edit
                                </button>
                            ) : null}
                            <button type="button" onClick={closePanel} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

// Diri ang column sa staff matag role.
function RoleColumn({ title, people, onView, onEdit }) {
    return (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <h3 className="text-base font-semibold text-slate-900">{title}</h3>
                <p className="text-xs text-slate-400">
                    {people.length} account{people.length === 1 ? '' : 's'}
                </p>
            </div>
            {people.length === 0 ? (
                <div className="px-5 py-12 text-center text-sm text-slate-400">No accounts yet</div>
            ) : (
                <ul className="divide-y divide-slate-100">
                    {people.map((staff) => (
                        <li key={staff.id} className="flex items-center gap-4 px-5 py-4">
                            <Avatar staff={staff} size="h-12 w-12" text="text-sm" />
                            <div className="min-w-0 flex-1">
                                <p className="truncate font-semibold text-navy">{staff.name || '—'}</p>
                                <p className="truncate text-sm text-slate-500">
                                    {[staff.barangay, formatZoneLabel(staff.zone)].filter(Boolean).join(' · ') || 'No location'}
                                </p>
                                <p className="truncate text-sm text-slate-400">{staff.email || '—'}</p>
                            </div>
                            <div className="flex shrink-0 gap-2">
                                <button
                                    type="button"
                                    onClick={() => onView(staff)}
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                    View
                                </button>
                                {onEdit ? (
                                    <button
                                        type="button"
                                        onClick={() => onEdit(staff)}
                                        className="rounded-lg bg-navy px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
                                    >
                                        Edit
                                    </button>
                                ) : null}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
