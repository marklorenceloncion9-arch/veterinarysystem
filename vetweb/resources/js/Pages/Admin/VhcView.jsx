import { Link, usePage, router } from '@inertiajs/react';
import { useState, useEffect } from 'react';
import Sidebar from '@/Components/Admin/Sidebar';
import VhcModal from '@/Components/Admin/VhcModal';
import VhcPrintSheet from '@/Components/Admin/VhcPrintSheet';
import { printVhcCertificate } from '@/Components/Admin/printVhcCertificate';
import {
    Badge,
    DetailField,
    EditButton,
    FlashBanner,
    FormField,
    ModalShell,
    SectionTitle,
    SpeciesSelector,
    StatCard,
    buildVhcPayload,
    formatCurrency,
    formatDate,
    formatVhcError,
    getInitial,
    getTotalAnimals,
    getValidityStatus,
    inputClass,
    livestockFromRecord,
    normalizeVhcContactNumber,
    purposeTone,
} from '@/Components/Admin/vhcUi';

// Diri ang page sa detalye sa VHC record.
export default function VhcView({ record, species = [], vhcFees = {} }) {
    const client = record.client || {
        id: record.vhc_client_id,
        name: record.name,
        contact_number: record.contact_number,
    };
    const { flash } = usePage().props;
    const [flashMessage, setFlashMessage] = useState(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditCertificate, setShowEditCertificate] = useState(false);
    const [showEditPayment, setShowEditPayment] = useState(false);
    const [showEditLivestock, setShowEditLivestock] = useState(false);
    const [errors, setErrors] = useState({});
    const [editLivestockList, setEditLivestockList] = useState([]);
    const [certificateForm, setCertificateForm] = useState(() => buildVhcPayload(record));
    const [paymentForm, setPaymentForm] = useState({
        or_number: record.or_number ?? '',
        amount_paid: record.amount_paid ?? '',
    });
    const [savingCertificate, setSavingCertificate] = useState(false);
    const [savingPayment, setSavingPayment] = useState(false);
    const [savingLivestock, setSavingLivestock] = useState(false);

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

    const totalAnimals = getTotalAnimals(record);
    const validity = getValidityStatus(record);
    const maleTotal = (record.livestock || []).reduce((sum, l) => sum + (Number(l.male_count) || 0), 0);
    const femaleTotal = (record.livestock || []).reduce((sum, l) => sum + (Number(l.female_count) || 0), 0);

    // Diri i-update ang livestock sa edit.
    const handleEditLivestockChange = (speciesId, field, value) => {
        setEditLivestockList(
            editLivestockList.map((l) => (l.species_id === speciesId ? { ...l, [field]: value } : l))
        );
    };

    // Diri i-toggle ang species sa listahan.
    const handleEditSpeciesToggle = (speciesId, list, setList) => {
        const exists = list.some((l) => l.species_id === speciesId);
        if (exists) {
            setList(list.filter((l) => l.species_id !== speciesId));
        } else {
            setList([...list, { species_id: speciesId, male_count: '', female_count: '' }]);
        }
    };

    // Diri ablihan ang edit sa certificate.
    const openEditCertificate = () => {
        setCertificateForm(buildVhcPayload(record));
        setErrors({});
        setShowEditCertificate(true);
    };

    // Diri ablihan ang edit sa payment.
    const openEditPayment = () => {
        setPaymentForm({
            or_number: record.or_number ?? '',
            amount_paid: record.amount_paid ?? '',
        });
        setErrors({});
        setShowEditPayment(true);
    };

    // Diri ablihan ang edit sa livestock.
    const openEditLivestock = () => {
        setEditLivestockList(livestockFromRecord(record));
        setErrors({});
        setShowEditLivestock(true);
    };

    // Diri i-update ang field sa certificate.
    const handleCertificateField = (e) => {
        const { name, value } = e.target;
        if (name === 'contact_number') {
            setCertificateForm((prev) => ({ ...prev, contact_number: normalizeVhcContactNumber(value) }));
            return;
        }
        setCertificateForm((prev) => ({ ...prev, [name]: value }));
    };

    // Diri i-update ang field sa payment.
    const handlePaymentField = (e) => {
        const { name, value } = e.target;
        setPaymentForm((prev) => ({ ...prev, [name]: value }));
    };

    // Diri i-save ang pag-edit sa certificate.
    const handleUpdateCertificate = (e) => {
        e.preventDefault();
        setSavingCertificate(true);
        setErrors({});

        router.put(
            `/admin/vhc/${record.id}`,
            buildVhcPayload(record, certificateForm),
            {
                onError: (err) => setErrors(err),
                onSuccess: () => {
                    setShowEditCertificate(false);
                    setErrors({});
                },
                onFinish: () => setSavingCertificate(false),
            }
        );
    };

    // Diri i-save ang pag-edit sa payment.
    const handleUpdatePayment = (e) => {
        e.preventDefault();
        setSavingPayment(true);
        setErrors({});

        router.put(
            `/admin/vhc/${record.id}`,
            buildVhcPayload(record, {
                ...paymentForm,
                amount_paid: paymentForm.amount_paid === '' ? null : paymentForm.amount_paid,
            }),
            {
                onError: (err) => setErrors(err),
                onSuccess: () => {
                    setShowEditPayment(false);
                    setErrors({});
                },
                onFinish: () => setSavingPayment(false),
            }
        );
    };

    // Diri i-save ang pag-edit sa livestock.
    const handleUpdateLivestock = (e) => {
        e.preventDefault();
        setSavingLivestock(true);
        setErrors({});

        router.put(
            `/admin/vhc/${record.id}/livestock`,
            { livestock: editLivestockList },
            {
                onError: (err) => setErrors(err),
                onSuccess: () => {
                    setShowEditLivestock(false);
                    setErrors({});
                },
                onFinish: () => setSavingLivestock(false),
            }
        );
    };

    return (
        <>
            <div className="vhc-screen-only flex h-screen overflow-hidden bg-canvas">
            <Sidebar />
            <div className="staff-main flex min-h-0 flex-1 flex-col overflow-hidden">
            <main className="min-h-0 flex-1 overflow-y-auto px-6 py-5 lg:px-8 scrollbar-hide">
                <div className="space-y-6">
                    <FlashBanner message={flashMessage} />

                    {/* Breadcrumb */}
                    <nav className="flex items-center gap-2 text-sm text-slate-500">
                        <Link href="/admin/vhc" className="transition hover:text-violet-600">
                            VHC Folders
                        </Link>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                        </svg>
                        {client?.id && (
                            <>
                                <Link href={`/admin/vhc/clients/${client.id}`} className="transition hover:text-violet-600">
                                    {client.name}
                                </Link>
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                </svg>
                            </>
                        )}
                        <span className="font-medium text-slate-900">Certificate #{String(record.id).padStart(4, '0')}</span>
                    </nav>

                    {/* Hero */}
                    <div className="overflow-hidden rounded-xl border border-line bg-navy shadow-sm">
                        <div className="relative px-6 py-7 sm:px-8">
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_55%)]" />
                            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                                <div className="flex items-start gap-4">
                                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-xl font-bold text-white ring-1 ring-white/20">
                                        {getInitial(record.name)}
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">
                                            Veterinary Health Certificate
                                        </p>
                                        <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">{record.name}</h1>
                                        <div className="mt-3 flex flex-wrap items-center gap-2">
                                            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/20">
                                                #{String(record.id).padStart(4, '0')}
                                            </span>
                                            <Badge tone={purposeTone(record.purpose)}>{record.purpose}</Badge>
                                            <Badge tone={validity.tone}>{validity.label}</Badge>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-3">
                                    <Link
                                        href="/admin/vhc"
                                        className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium text-white ring-1 ring-white/20 transition hover:bg-white/20"
                                    >
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                        </svg>
                                        Back to List
                                    </Link>
                                    <button
                                        onClick={printVhcCertificate}
                                        className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-violet-700 shadow-sm transition hover:bg-violet-50"
                                    >
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                        </svg>
                                        Print
                                    </button>
                                    <button
                                        onClick={() => setShowAddModal(true)}
                                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600"
                                    >
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                                        </svg>
                                        New Certificate
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <StatCard
                            label="Total Animals"
                            value={totalAnimals}
                            hint={`${maleTotal} male · ${femaleTotal} female`}
                            icon={
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                </svg>
                            }
                        />
                        <StatCard
                            label="Species Listed"
                            value={(record.livestock || []).length}
                            hint="Livestock & poultry types"
                            icon={
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                </svg>
                            }
                        />
                        <StatCard
                            label="Valid Until"
                            value={formatDate(record.valid_till) || 'Not set'}
                            hint={validity.label}
                            icon={
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                            }
                        />
                        <StatCard
                            label="Amount Paid"
                            value={formatCurrency(record.amount_paid) || '—'}
                            hint={record.or_number || 'No O.R number recorded'}
                            icon={
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            }
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                        {/* Main content */}
                        <div className="space-y-6 xl:col-span-2">
                            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                                <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <h2 className="text-sm font-semibold text-slate-900">Certificate Information</h2>
                                            <p className="mt-0.5 text-xs text-slate-500">Owner, movement, and issuance details</p>
                                        </div>
                                        <EditButton onClick={openEditCertificate} label="Edit Certificate" />
                                    </div>
                                </div>
                                <div className="p-6 space-y-8">
                                    <section>
                                        <SectionTitle>Owner & Animal Details</SectionTitle>
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            <DetailField label="Name" value={record.name} />
                                            <DetailField label="Contact Number" value={record.contact_number} />
                                            <DetailField label="Age" value={record.age} />
                                            <DetailField label="Color" value={record.color} />
                                        </div>
                                    </section>

                                    <section>
                                        <SectionTitle accent="emerald">Movement & Purpose</SectionTitle>
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            <DetailField label="Purpose" value={record.purpose} />
                                            <DetailField label="Destination" value={record.destination} />
                                            <DetailField label="Origin (Address)" value={record.origin} className="sm:col-span-2" />
                                            <DetailField label="Animals Origin" value={record.animals_origin} />
                                            <DetailField label="SLH" value={record.slh} />
                                        </div>
                                    </section>

                                    <section>
                                        <div className="mb-4 flex items-center justify-between gap-3">
                                            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                                                <span className="h-4 w-1 rounded-full bg-blue-500" />
                                                Issuance & Payment
                                            </h3>
                                            <EditButton onClick={openEditPayment} label="Edit Payment" />
                                        </div>
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            <DetailField label="Issued On" value={formatDate(record.issued_on, 'long')} />
                                            <DetailField label="Valid Till" value={formatDate(record.valid_till, 'long')} />
                                            <DetailField label="Issued At" value={record.issued_at} />
                                            <DetailField label="Inspected By" value={record.inspected_by} />
                                            <DetailField label="O.R Number" value={record.or_number} />
                                            <DetailField label="Amount Paid" value={formatCurrency(record.amount_paid)} />
                                        </div>
                                    </section>
                                </div>
                            </div>

                            {/* Livestock table */}
                            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                                <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <h2 className="text-sm font-semibold text-slate-900">Livestock & Poultry Details</h2>
                                            <p className="mt-0.5 text-xs text-slate-500">Species breakdown with head counts</p>
                                        </div>
                                        <EditButton onClick={openEditLivestock} label="Edit Animals" />
                                    </div>
                                </div>
                                {record.livestock?.length === 0 ? (
                                    <div className="px-6 py-12 text-center">
                                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 ring-1 ring-slate-100">
                                            <svg className="h-6 w-6 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                            </svg>
                                        </div>
                                        <p className="text-sm font-medium text-slate-600">No animals recorded</p>
                                        <p className="mt-1 text-xs text-slate-400">This certificate has no livestock or poultry entries.</p>
                                        <button
                                            type="button"
                                            onClick={openEditLivestock}
                                            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700"
                                        >
                                            Add Animals
                                        </button>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full min-w-[480px]">
                                            <thead>
                                                <tr className="border-b border-slate-100">
                                                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Species</th>
                                                    <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">Male</th>
                                                    <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">Female</th>
                                                    <th className="px-6 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {record.livestock.map((entry) => (
                                                    <tr key={entry.id} className="transition hover:bg-slate-50/60">
                                                        <td className="px-6 py-4">
                                                            <span className="inline-flex rounded-lg bg-violet-50 px-2.5 py-1 text-sm font-semibold text-violet-700 ring-1 ring-violet-100">
                                                                {entry.species?.species_name}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-4 text-center text-sm tabular-nums text-slate-600">{entry.male_count}</td>
                                                        <td className="px-4 py-4 text-center text-sm tabular-nums text-slate-600">{entry.female_count}</td>
                                                        <td className="px-6 py-4 text-center text-sm font-bold tabular-nums text-slate-900">
                                                            {Number(entry.male_count) + Number(entry.female_count)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                <tr className="border-t border-slate-200 bg-violet-50/50">
                                                    <td className="px-6 py-4 text-sm font-semibold text-violet-800">Grand Total</td>
                                                    <td className="px-4 py-4 text-center text-sm font-bold tabular-nums text-violet-800">{maleTotal}</td>
                                                    <td className="px-4 py-4 text-center text-sm font-bold tabular-nums text-violet-800">{femaleTotal}</td>
                                                    <td className="px-6 py-4 text-center text-lg font-bold tabular-nums text-violet-900">{totalAnimals}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Sidebar */}
                        <div className="space-y-6">
                            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                                <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4">
                                    <h2 className="text-sm font-semibold text-slate-900">Quick Summary</h2>
                                </div>
                                <div className="space-y-4 p-5">
                                    <div className="rounded-xl bg-gradient-to-br from-violet-50 to-indigo-50 p-4 ring-1 ring-violet-100">
                                        <p className="text-xs font-semibold uppercase tracking-wider text-violet-600">Certificate Status</p>
                                        <p className="mt-2 text-lg font-bold text-violet-900">{validity.label}</p>
                                        <p className="mt-1 text-xs text-violet-600/80">
                                            {record.valid_till
                                                ? `Valid until ${formatDate(record.valid_till, 'long')}`
                                                : 'No expiry date on file'}
                                        </p>
                                    </div>
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-slate-500">Created</span>
                                            <span className="font-medium text-slate-900">{formatDate(record.created_at, 'long')}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-slate-500">Issued</span>
                                            <span className="font-medium text-slate-900">{formatDate(record.issued_on, 'long') || '—'}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-slate-500">Destination</span>
                                            <span className="font-medium text-slate-900">{record.destination || '—'}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-slate-500">Inspector</span>
                                            <span className="font-medium text-slate-900">{record.inspected_by || '—'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {(record.livestock || []).length > 0 && (
                                <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                                    <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4">
                                        <h2 className="text-sm font-semibold text-slate-900">Species Breakdown</h2>
                                    </div>
                                    <div className="space-y-2 p-5">
                                        {record.livestock.map((entry) => {
                                            const entryTotal = Number(entry.male_count) + Number(entry.female_count);
                                            const pct = totalAnimals > 0 ? Math.round((entryTotal / totalAnimals) * 100) : 0;
                                            return (
                                                <div key={entry.id}>
                                                    <div className="mb-1 flex items-center justify-between text-sm">
                                                        <span className="font-medium text-slate-700">{entry.species?.species_name}</span>
                                                        <span className="tabular-nums text-slate-500">{entryTotal} ({pct}%)</span>
                                                    </div>
                                                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                                                        <div
                                                            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
                                                            style={{ width: `${pct}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
            </div>

            <VhcModal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                species={species}
                vhcFees={vhcFees}
                client={client}
            />

            {showEditCertificate && (
                <ModalShell
                    title="Edit Certificate"
                    subtitle={`Certificate #${String(record.id).padStart(4, '0')}`}
                    onClose={() => setShowEditCertificate(false)}
                    maxWidth="max-w-3xl"
                    footer={
                        <div className="flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setShowEditCertificate(false)}
                                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={savingCertificate}
                                onClick={handleUpdateCertificate}
                                className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50"
                            >
                                {savingCertificate ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    }
                >
                    <form onSubmit={handleUpdateCertificate} className="space-y-6 p-6">
                        <section>
                            <SectionTitle>Owner & Animal Details</SectionTitle>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <FormField label="Name" required error={errors.name}>
                                    <input type="text" name="name" value={certificateForm.name} onChange={handleCertificateField} className={inputClass} />
                                </FormField>
                                <FormField label="Contact Number" error={errors.contact_number}>
                                    <input type="tel" name="contact_number" value={certificateForm.contact_number} onChange={handleCertificateField} placeholder="09XXXXXXXXX" maxLength={11} inputMode="numeric" className={inputClass} />
                                    <p className="text-xs text-slate-500">Must start with 09 and be 11 digits</p>
                                </FormField>
                                <FormField label="Age" error={errors.age}>
                                    <input type="text" name="age" value={certificateForm.age} onChange={handleCertificateField} className={inputClass} />
                                </FormField>
                                <FormField label="Color" error={errors.color}>
                                    <input type="text" name="color" value={certificateForm.color} onChange={handleCertificateField} className={inputClass} />
                                </FormField>
                            </div>
                        </section>
                        <section>
                            <SectionTitle accent="emerald">Movement & Purpose</SectionTitle>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <FormField label="Purpose" required error={errors.purpose}>
                                    <input type="text" name="purpose" value={certificateForm.purpose} onChange={handleCertificateField} className={inputClass} />
                                </FormField>
                                <FormField label="Destination" required error={errors.destination}>
                                    <input type="text" name="destination" value={certificateForm.destination} onChange={handleCertificateField} className={inputClass} />
                                </FormField>
                                <FormField label="Origin (Address)" required error={errors.origin}>
                                    <input type="text" name="origin" value={certificateForm.origin} onChange={handleCertificateField} className={inputClass} />
                                </FormField>
                                <FormField label="Animals Origin" error={errors.animals_origin}>
                                    <input type="text" name="animals_origin" value={certificateForm.animals_origin} onChange={handleCertificateField} className={inputClass} />
                                </FormField>
                                <FormField label="SLH" error={errors.slh}>
                                    <input type="text" name="slh" value={certificateForm.slh} onChange={handleCertificateField} className={inputClass} />
                                </FormField>
                            </div>
                        </section>
                        <section>
                            <SectionTitle accent="blue">Issuance Details</SectionTitle>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <FormField label="Issued On" error={errors.issued_on}>
                                    <input type="date" name="issued_on" value={certificateForm.issued_on} onChange={handleCertificateField} className={inputClass} />
                                </FormField>
                                <FormField label="Valid Till" error={errors.valid_till}>
                                    <input type="date" name="valid_till" value={certificateForm.valid_till} onChange={handleCertificateField} className={inputClass} />
                                </FormField>
                                <FormField label="Issued At" error={errors.issued_at}>
                                    <input type="text" name="issued_at" value={certificateForm.issued_at} onChange={handleCertificateField} className={inputClass} />
                                </FormField>
                                <FormField label="Inspected By" error={errors.inspected_by}>
                                    <input type="text" name="inspected_by" value={certificateForm.inspected_by} onChange={handleCertificateField} className={inputClass} />
                                </FormField>
                            </div>
                        </section>
                    </form>
                </ModalShell>
            )}

            {showEditPayment && (
                <ModalShell
                    title="Edit Payment"
                    subtitle="Update O.R number and amount paid"
                    onClose={() => setShowEditPayment(false)}
                    maxWidth="max-w-lg"
                    footer={
                        <div className="flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setShowEditPayment(false)}
                                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={savingPayment}
                                onClick={handleUpdatePayment}
                                className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50"
                            >
                                {savingPayment ? 'Saving...' : 'Save Payment'}
                            </button>
                        </div>
                    }
                >
                    <form onSubmit={handleUpdatePayment} className="space-y-4 p-6">
                        <FormField label="O.R Number" error={errors.or_number}>
                            <input type="text" name="or_number" value={paymentForm.or_number} onChange={handlePaymentField} placeholder="Enter O.R number" className={inputClass} />
                        </FormField>
                        <FormField label="Amount Paid" error={errors.amount_paid}>
                            <input type="number" name="amount_paid" value={paymentForm.amount_paid} onChange={handlePaymentField} placeholder="0.00" min="0" step="0.01" className={inputClass} />
                        </FormField>
                    </form>
                </ModalShell>
            )}

            {showEditLivestock && (
                <ModalShell
                    title="Edit Livestock & Poultry"
                    subtitle="Update species and head counts"
                    onClose={() => setShowEditLivestock(false)}
                    maxWidth="max-w-2xl"
                    footer={
                        <div className="flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setShowEditLivestock(false)}
                                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={savingLivestock}
                                onClick={handleUpdateLivestock}
                                className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50"
                            >
                                {savingLivestock ? 'Saving...' : 'Save Animals'}
                            </button>
                        </div>
                    }
                >
                    <form onSubmit={handleUpdateLivestock} className="space-y-4 p-6">
                        <p className="text-sm text-slate-500">
                            Select species and enter male and female counts for this certificate.
                        </p>
                        <SpeciesSelector
                            species={species}
                            selected={editLivestockList}
                            onToggle={(id) => handleEditSpeciesToggle(id, editLivestockList, setEditLivestockList)}
                            onChange={handleEditLivestockChange}
                            vhcFees={vhcFees}
                        />
                        {errors.livestock && <p className="text-xs text-rose-500">{formatVhcError(errors.livestock)}</p>}
                    </form>
                </ModalShell>
            )}
            </div>

            <VhcPrintSheet record={record} />
        </>
    );
}
