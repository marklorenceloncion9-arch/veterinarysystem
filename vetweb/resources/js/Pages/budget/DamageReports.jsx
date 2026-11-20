import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePage } from '@inertiajs/react';
import Sidebar from '@/Components/Budget/BudgetSidebar';
import { uploadImageToCloudinary } from '@/utils/cloudinary';
import Tabs from '@/Components/Ui/Tabs';

const STATUS_LABELS = {
    under_review: 'Under Review',
    approved: 'Approved',
    rejected: 'Rejected',
    deducted: 'Approved',
};

const STATUS_STYLES = {
    under_review: 'bg-amber-50 text-amber-800 ring-amber-200/80',
    approved: 'bg-emerald-50 text-emerald-800 ring-emerald-200/80',
    rejected: 'bg-red-50 text-red-800 ring-red-200/80',
    deducted: 'bg-emerald-50 text-emerald-800 ring-emerald-200/80',
};

const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'under_review', label: 'Under Review' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
];

const MAX_EVIDENCE_PHOTOS = 3;

// Diri kuhaon ang mga URL sa ebidensya.
function evidenceUrls(row) {
    const urls = Array.isArray(row?.evidence_image_urls) ? row.evidence_image_urls.filter(Boolean) : [];
    if (row?.evidence_image_url && !urls.includes(row.evidence_image_url)) {
        urls.unshift(row.evidence_image_url);
    }
    return urls.slice(0, MAX_EVIDENCE_PHOTOS);
}

// Diri himuon ang headers nga naay CSRF.
function csrfHeaders() {
    return {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
    };
}

// Diri i-format ang petsa ug oras.
function formatDateTime(value) {
    if (!value) return '—';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return '—';
    return dt.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

// Diri i-format ang quantity.
function formatQty(value) {
    return Number(value || 0).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
    });
}

// Diri himuon ang timeline sa activity sa report.
function activityEvents(report) {
    const events = [
        {
            key: 'submitted',
            label: 'Submitted',
            at: report.created_at,
            by: report.reported_by?.name,
        },
    ];

    if (report.reviewed_at) {
        events.push({
            key: 'reviewed',
            label: 'Reviewed',
            at: report.reviewed_at,
            by: report.reviewed_by?.name,
        });
    }

    if (report.status === 'approved' && report.deducted_at) {
        events.push({
            key: 'deducted',
            label: 'Deducted',
            at: report.deducted_at,
            by: report.deducted_by?.name,
        });
    }

    return events;
}

// Diri ang badge sa status.
function StatusBadge({ status }) {
    return (
        <span
            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                STATUS_STYLES[status] || 'bg-slate-100 text-slate-700 ring-slate-200/80'
            }`}
        >
            {STATUS_LABELS[status] || status}
        </span>
    );
}

// Diri ang modal sa tunga sa screen.
function CenterModal({ open, title, message, tone = 'info', confirmLabel, cancelLabel = 'Cancel', onConfirm, onClose, busy = false }) {
    if (!open) return null;

    const tones = {
        info: 'bg-slate-100 text-slate-700',
        success: 'bg-emerald-100 text-emerald-700',
        error: 'bg-red-100 text-red-700',
        warn: 'bg-amber-100 text-amber-700',
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="px-6 pt-6 pb-4 text-center">
                    <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${tones[tone] || tones.info}`}>
                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d={
                                    tone === 'error'
                                        ? 'M12 9v2m0 4h.01M12 5a7 7 0 100 14 7 7 0 000-14z'
                                        : tone === 'success'
                                          ? 'M5 13l4 4L19 7'
                                          : 'M13 16h-1v-4h-1m1-4h.01M12 5a7 7 0 100 14 7 7 0 000-14z'
                                }
                            />
                        </svg>
                    </div>
                    <h2 className="text-lg font-bold text-slate-900">{title}</h2>
                    {message ? <p className="mt-2 text-sm text-slate-500">{message}</p> : null}
                </div>
                <div className="flex gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
                    {onConfirm ? (
                        <>
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={busy}
                                className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                            >
                                {cancelLabel}
                            </button>
                            <button
                                type="button"
                                onClick={onConfirm}
                                disabled={busy}
                                className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50 ${
                                    tone === 'error' || tone === 'warn' ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 hover:bg-slate-800'
                                }`}
                            >
                                {busy ? 'Please wait…' : confirmLabel || 'Confirm'}
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                        >
                            OK
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// Diri ang page sa damage reports.
export default function DamageReports() {
    const { cloudinary } = usePage().props;
    const [reports, setReports] = useState([]);
    const [summary, setSummary] = useState({});
    const [medicines, setMedicines] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [selected, setSelected] = useState(null);
    const [photoIndex, setPhotoIndex] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [actionBusy, setActionBusy] = useState(false);
    const [modal, setModal] = useState({ open: false });
    const [confirmAction, setConfirmAction] = useState(null);

    const [form, setForm] = useState({
        medicine_id: '',
        quantity: '',
        reason: '',
        evidence_urls: [],
        evidence_previews: [],
    });

    const fetchReports = useCallback(async (status = statusFilter) => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (status && status !== 'all') params.set('status', status);
            const response = await fetch(`/api/budget/damage-reports?${params.toString()}`, {
                headers: { Accept: 'application/json' },
                credentials: 'same-origin',
            });
            const data = await response.json();
            if (data.success) {
                setReports(data.reports || []);
                setSummary(data.summary || {});
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    // Diri kuhaon ang listahan sa mga tambal.
    const fetchMedicines = async () => {
        try {
            const response = await fetch('/api/budget/medicines');
            const data = await response.json();
            if (data.success) setMedicines(data.medicines || []);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        fetchReports();
        fetchMedicines();
    }, [fetchReports]);

    const filteredReports = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return reports;
        return reports.filter(
            (row) =>
                row.medicine_name?.toLowerCase().includes(q) ||
                row.batch_number?.toLowerCase().includes(q) ||
                row.reason?.toLowerCase().includes(q)
        );
    }, [reports, search]);

    // Diri ablihan ang alert modal.
    const openAlert = (title, message, tone = 'info') => {
        setModal({ open: true, title, message, tone });
    };

    const selectedMedicine = useMemo(
        () => medicines.find((item) => String(item.id) === String(form.medicine_id)) || null,
        [medicines, form.medicine_id]
    );

    // Diri i-reset ang form sa report.
    const resetForm = () => {
        setForm({
            medicine_id: '',
            quantity: '',
            reason: '',
            evidence_urls: [],
            evidence_previews: [],
        });
    };

    // Diri ilisan ang napiling tambal.
    const handleMedicineChange = (medicineId) => {
        setForm((prev) => ({ ...prev, medicine_id: medicineId }));
    };

    // Diri i-upload ang napiling litrato sa ebidensya.
    const handleImagePick = async (event) => {
        const files = Array.from(event.target.files || []);
        if (!files.length) return;

        const remaining = MAX_EVIDENCE_PHOTOS - form.evidence_urls.length;
        const toUpload = files.slice(0, remaining);
        if (!toUpload.length) {
            openAlert('Photo limit', `You can attach up to ${MAX_EVIDENCE_PHOTOS} photos.`, 'warn');
            event.target.value = '';
            return;
        }

        setUploading(true);
        try {
            const uploaded = [];
            for (const file of toUpload) {
                const preview = URL.createObjectURL(file);
                const url = await uploadImageToCloudinary(file, {
                    cloudName: cloudinary?.cloudName,
                    uploadPreset: cloudinary?.uploadPreset,
                });
                uploaded.push({ url, preview });
            }
            setForm((prev) => ({
                ...prev,
                evidence_urls: [...prev.evidence_urls, ...uploaded.map((item) => item.url)],
                evidence_previews: [...prev.evidence_previews, ...uploaded.map((item) => item.preview)],
            }));
        } catch (err) {
            openAlert('Upload failed', err.message || 'Could not upload the evidence image.', 'error');
        } finally {
            setUploading(false);
            event.target.value = '';
        }
    };

    // Diri tangtangon ang litrato sa ebidensya.
    const removeEvidence = (index) => {
        setForm((prev) => ({
            ...prev,
            evidence_urls: prev.evidence_urls.filter((_, i) => i !== index),
            evidence_previews: prev.evidence_previews.filter((_, i) => i !== index),
        }));
    };

    // Diri i-submit ang damage report.
    const submitReport = async (event) => {
        event.preventDefault();
        if (!form.medicine_id || !form.quantity || !form.reason.trim()) {
            openAlert('Missing details', 'Please select a medicine, enter quantity, and describe the damage.', 'warn');
            return;
        }

        setSubmitting(true);
        try {
            const response = await fetch('/api/budget/damage-reports', {
                method: 'POST',
                headers: csrfHeaders(),
                credentials: 'same-origin',
                body: JSON.stringify({
                    medicine_id: Number(form.medicine_id),
                    quantity: Number(form.quantity),
                    reason: form.reason.trim(),
                    evidence_image_url: form.evidence_urls[0] || null,
                    evidence_image_urls: form.evidence_urls,
                }),
            });
            const data = await response.json();
            if (!data.success) {
                openAlert('Could not submit', data.message || 'Failed to submit damage report.', 'error');
                return;
            }

            setShowForm(false);
            resetForm();
            openAlert('Submitted', 'Damage report is now Under Review. Inventory was not deducted.', 'success');
            await fetchReports('all');
            setStatusFilter('all');
        } catch {
            openAlert('Could not submit', 'Failed to submit damage report. Please try again.', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // Diri ablihan ang detalye sa report.
    const openReport = async (id) => {
        try {
            const response = await fetch(`/api/budget/damage-reports/${id}`, { credentials: 'same-origin' });
            const data = await response.json();
            if (data.success) {
                setSelected(data.report);
            } else {
                openAlert('Not found', data.message || 'Damage report not found.', 'error');
            }
        } catch {
            openAlert('Error', 'Failed to open damage report.', 'error');
        }
    };

    // Diri i-approve o i-reject ang report.
    const runReview = async (action) => {
        if (!selected) return;
        setActionBusy(true);
        try {
            const response = await fetch(`/api/budget/damage-reports/${selected.id}/${action}`, {
                method: 'POST',
                headers: csrfHeaders(),
                credentials: 'same-origin',
                body: JSON.stringify({}),
            });
            const data = await response.json();
            if (!data.success) {
                openAlert(
                    data.code === 'insufficient_stock' ? 'Insufficient stock' : 'Action failed',
                    data.message || 'Could not update the report.',
                    'error'
                );
                if (data.report) setSelected(data.report);
                return;
            }
            setSelected(data.report);
            openAlert(
                action === 'approve' ? 'Approved' : 'Rejected',
                action === 'approve'
                    ? 'Report approved and damaged quantity deducted from inventory.'
                    : 'Report rejected. No inventory was deducted.',
                action === 'approve' ? 'success' : 'warn'
            );
            await fetchReports();
        } catch {
            openAlert('Action failed', 'Could not update the report.', 'error');
        } finally {
            setActionBusy(false);
            setConfirmAction(null);
        }
    };

    return (
        <div className="flex h-screen overflow-hidden bg-canvas">
            <Sidebar />

            <main className="relative staff-main flex min-h-0 flex-1 flex-col">
                <div className="relative flex min-h-0 flex-1 flex-col px-6 py-6 lg:px-8">
                    <div className="mb-6">
                        <p className="app-kicker">
                            Stock control
                        </p>
                        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-navy">Damage history</h1>
                        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-500">
                            Review damaged stock reports. Approving a report deducts the damaged quantity from inventory.
                        </p>
                    </div>

                    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {[
                            { key: 'under_review', label: 'Under Review', value: summary.under_review ?? 0, accent: 'border-l-amber-500' },
                            { key: 'approved', label: 'Approved', value: summary.approved ?? 0, accent: 'border-l-emerald-500' },
                            { key: 'rejected', label: 'Rejected', value: summary.rejected ?? 0, accent: 'border-l-red-500' },
                        ].map((card) => (
                            <button
                                key={card.key}
                                type="button"
                                onClick={() => setStatusFilter(card.key)}
                                className={`rounded-md border border-l-[3px] bg-white px-3 py-2 text-left shadow-sm ${card.accent} ${
                                    statusFilter === card.key ? 'ring-2 ring-slate-900/10' : ''
                                }`}
                            >
                                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">{card.label}</p>
                                <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{card.value}</p>
                            </button>
                        ))}
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm">
                        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-3.5">
                            <div className="flex flex-wrap items-center gap-3">
                            <input
                                type="search"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search medicine or reason…"
                                className="min-w-[220px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                            />
                            <p className="ml-auto text-sm text-muted">
                                <span className="font-semibold text-navy">{filteredReports.length}</span> reports
                            </p>
                            </div>
                            <Tabs
                                value={statusFilter}
                                onChange={setStatusFilter}
                                items={FILTERS.map((option) => ({
                                    id: option.key,
                                    label: option.label,
                                    count: option.key === 'all' ? null : (summary[option.key] ?? 0),
                                }))}
                            />
                        </div>

                        {loading ? (
                            <div className="flex flex-1 flex-col items-center justify-center py-20">
                                <div className="mb-3 h-9 w-9 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
                                <p className="text-sm text-slate-500">Loading damage reports…</p>
                            </div>
                        ) : filteredReports.length === 0 ? (
                            <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
                                <p className="text-sm font-semibold text-slate-900">No damage reports found</p>
                                <p className="mt-1 max-w-sm text-sm text-slate-500">
                                    Submit a new report to start the under-review workflow.
                                </p>
                            </div>
                        ) : (
                            <div className="min-h-0 flex-1 overflow-auto">
                                <table className="w-full min-w-[960px] text-left text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                                            <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3">Evidence</th>
                                            <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Medicine</th>
                                            <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Qty</th>
                                            <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Reason</th>
                                            <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Submitted</th>
                                            <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredReports.map((row) => (
                                            <tr
                                                key={row.id}
                                                onClick={() => openReport(row.id)}
                                                className="cursor-pointer transition-colors hover:bg-slate-50/90"
                                            >
                                                <td className="px-5 py-3.5">
                                                    {evidenceUrls(row)[0] ? (
                                                        <img
                                                            src={evidenceUrls(row)[0]}
                                                            alt="Damage evidence"
                                                            className="h-12 w-12 rounded-lg object-cover ring-1 ring-slate-200"
                                                        />
                                                    ) : (
                                                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-medium text-slate-400">
                                                            No image
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3.5">
                                                    <p className="font-medium text-slate-900">{row.medicine_name}</p>
                                                    <p className="mt-0.5 text-xs text-slate-400">
                                                        {row.category}
                                                        {row.status === 'approved' && row.batch_number
                                                            ? ` · deducted from ${row.batch_number}`
                                                            : ''}
                                                    </p>
                                                </td>
                                                <td className="px-4 py-3.5 font-semibold tabular-nums text-amber-700">
                                                    {row.quantity_display || `${formatQty(row.quantity)} ${row.unit}`}
                                                </td>
                                                <td className="max-w-xs px-4 py-3.5 text-slate-600">
                                                    <p className="line-clamp-2">{row.reason}</p>
                                                </td>
                                                <td className="whitespace-nowrap px-4 py-3.5 text-slate-600">
                                                    {formatDateTime(row.created_at)}
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <StatusBadge status={row.status} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {showForm && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
                        <div className="border-b border-slate-100 px-6 py-4">
                            <h2 className="text-lg font-semibold text-slate-900">New damage report</h2>
                            <p className="mt-1 text-sm text-slate-500">
                                Submitting keeps inventory unchanged until the report is approved.
                                Approval deducts from the oldest batch first.
                            </p>
                        </div>
                        <form onSubmit={submitReport} className="space-y-4 px-6 py-5">
                            <div>
                                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                                    Medicine / item
                                </label>
                                <select
                                    required
                                    value={form.medicine_id}
                                    onChange={(e) => handleMedicineChange(e.target.value)}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                                >
                                    <option value="">Select medicine</option>
                                    {medicines.map((medicine) => (
                                        <option key={medicine.id} value={medicine.id}>
                                            {medicine.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                                    Damaged quantity
                                </label>
                                <input
                                    type="number"
                                    min="0.001"
                                    step="any"
                                    required
                                    value={form.quantity}
                                    onChange={(e) => setForm((prev) => ({ ...prev, quantity: e.target.value }))}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                                    placeholder={
                                        selectedMedicine
                                            ? `Available: ${selectedMedicine.on_hand_display ?? selectedMedicine.on_hand ?? 0} ${
                                                  selectedMedicine.unit_name || 'units'
                                              }`
                                            : 'Enter quantity'
                                    }
                                />
                                <p className="mt-1.5 text-xs text-slate-500">
                                    Approval deducts from the oldest batch first, same as budget officer stock use.
                                </p>
                            </div>

                            <div>
                                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                                    Reason / description
                                </label>
                                <textarea
                                    required
                                    rows={3}
                                    value={form.reason}
                                    onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                                    placeholder="Describe what happened to the stock"
                                />
                            </div>

                            <div>
                                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                                    Evidence photos ({form.evidence_urls.length}/{MAX_EVIDENCE_PHOTOS})
                                </label>
                                <div className="flex flex-wrap items-center gap-3">
                                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                                        <input
                                            type="file"
                                            accept="image/*"
                                            capture="environment"
                                            multiple
                                            className="hidden"
                                            onChange={handleImagePick}
                                            disabled={uploading || form.evidence_urls.length >= MAX_EVIDENCE_PHOTOS}
                                        />
                                        {uploading
                                            ? 'Uploading…'
                                            : form.evidence_urls.length >= MAX_EVIDENCE_PHOTOS
                                              ? 'Photo limit reached'
                                              : 'Upload / take photo'}
                                    </label>
                                    {form.evidence_previews.map((preview, index) => (
                                        <div key={`${preview}-${index}`} className="relative">
                                            <img
                                                src={preview}
                                                alt={`Evidence ${index + 1}`}
                                                className="h-16 w-16 rounded-lg object-cover ring-1 ring-slate-200"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeEvidence(index)}
                                                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-xs text-white"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <p className="mt-1.5 text-xs text-slate-500">You can attach up to 3 photos.</p>
                            </div>

                            <div className="flex gap-3 border-t border-slate-100 pt-4">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowForm(false);
                                        resetForm();
                                    }}
                                    className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting || uploading}
                                    className="flex-1 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
                                >
                                    {submitting ? 'Submitting…' : 'Submit report'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {selected && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm">
                    <div className="flex max-h-[min(90vh,760px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="text-lg font-semibold text-slate-900">{selected.medicine_name}</h2>
                                    <StatusBadge status={selected.status} />
                                </div>
                                <p className="mt-1 text-sm text-slate-500">
                                    {selected.status === 'approved' && selected.batch_number
                                        ? `Deducted from oldest batch ${selected.batch_number}`
                                        : selected.category}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setPhotoIndex(null);
                                    setSelected(null);
                                }}
                                className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                                aria-label="Close"
                            >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
                            <div className="grid gap-3 sm:grid-cols-[9.5rem_1fr]">
                                <div className="rounded-xl bg-navy px-4 py-4 text-white">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55">Quantity</p>
                                    <p className="mt-2 text-3xl font-bold leading-none tabular-nums">{formatQty(selected.quantity)}</p>
                                    <p className="mt-1.5 text-sm text-white/75">{selected.unit || 'units'}</p>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Reason</p>
                                    <p className="mt-2 text-base font-medium leading-snug text-slate-900">{selected.reason}</p>
                                </div>
                            </div>

                            {selected.status === 'under_review' && selected.available_quantity != null && (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                    Current stock is {formatQty(selected.available_quantity)} {selected.unit}. Approval deducts from the oldest batch first.
                                </div>
                            )}

                            <div className={`grid gap-3 ${activityEvents(selected).length > 1 ? 'sm:grid-cols-3' : ''}`}>
                                {activityEvents(selected).map((event) => (
                                    <div key={event.key} className="rounded-xl border border-slate-200 px-3.5 py-3">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{event.label}</p>
                                        <p className="mt-1.5 text-sm font-medium text-slate-900">{formatDateTime(event.at)}</p>
                                        {event.by ? <p className="mt-0.5 truncate text-xs text-slate-500">{event.by}</p> : null}
                                    </div>
                                ))}
                            </div>

                            <div>
                                <div className="mb-2.5 flex items-center justify-between">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Evidence</p>
                                    <p className="text-xs text-slate-400">
                                        {evidenceUrls(selected).length
                                            ? `${evidenceUrls(selected).length} photo${evidenceUrls(selected).length === 1 ? '' : 's'}`
                                            : 'None'}
                                    </p>
                                </div>
                                {evidenceUrls(selected).length ? (
                                    <div
                                        className={`grid gap-3 ${
                                            evidenceUrls(selected).length === 1
                                                ? 'grid-cols-1'
                                                : evidenceUrls(selected).length === 2
                                                  ? 'grid-cols-2'
                                                  : 'grid-cols-3'
                                        }`}
                                    >
                                        {evidenceUrls(selected).map((url, index) => (
                                            <button
                                                key={url}
                                                type="button"
                                                onClick={() => setPhotoIndex(index)}
                                                className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200"
                                            >
                                                <img
                                                    src={url}
                                                    alt={`Damage evidence ${index + 1}`}
                                                    className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]"
                                                />
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex h-28 items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-400 ring-1 ring-slate-200">
                                        No evidence image
                                    </div>
                                )}
                            </div>

                            {(selected.status_history || []).length > 0 && (
                                <div>
                                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Status history</p>
                                    <ol className="space-y-3 border-l border-slate-200 pl-4">
                                        {(selected.status_history || []).map((entry) => (
                                            <li key={entry.id} className="relative text-sm">
                                                <span className="absolute -left-[1.3rem] top-1.5 h-2 w-2 rounded-full bg-violet-500 ring-4 ring-white" />
                                                <p className="font-medium text-slate-800">
                                                    {STATUS_LABELS[entry.to_status] || entry.to_status}
                                                </p>
                                                <p className="text-xs text-slate-500">
                                                    {formatDateTime(entry.created_at)}
                                                    {entry.changed_by?.name ? ` · ${entry.changed_by.name}` : ''}
                                                    {entry.note ? ` · ${entry.note}` : ''}
                                                </p>
                                            </li>
                                        ))}
                                    </ol>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
                            {selected.status === 'under_review' && (
                                <>
                                    <button
                                        type="button"
                                        disabled={actionBusy}
                                        onClick={() => setConfirmAction('reject')}
                                        className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                                    >
                                        Reject Report
                                    </button>
                                    <button
                                        type="button"
                                        disabled={actionBusy}
                                        onClick={() => setConfirmAction('approve')}
                                        className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                                    >
                                        Approve Damage
                                    </button>
                                </>
                            )}
                            {selected.status === 'rejected' && (
                                <p className="text-sm text-slate-500">This report was rejected. Inventory was not changed.</p>
                            )}
                            {selected.status === 'approved' && (
                                <p className="text-sm text-emerald-700">
                                    Approved and deducted from inventory.
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {selected && photoIndex != null && evidenceUrls(selected)[photoIndex] && (
                <div
                    className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/80 p-4"
                    onClick={() => setPhotoIndex(null)}
                >
                    <div className="relative w-full max-w-4xl" onClick={(event) => event.stopPropagation()}>
                        <div className="mb-3 flex items-center justify-between text-sm text-white">
                            <p>
                                {photoIndex + 1} of {evidenceUrls(selected).length}
                            </p>
                            <button
                                type="button"
                                onClick={() => setPhotoIndex(null)}
                                className="rounded-lg bg-white/10 px-3 py-1.5 font-medium hover:bg-white/20"
                            >
                                Close
                            </button>
                        </div>
                        <img
                            src={evidenceUrls(selected)[photoIndex]}
                            alt={`Damage evidence ${photoIndex + 1}`}
                            className="max-h-[75vh] w-full rounded-xl object-contain"
                        />
                        {evidenceUrls(selected).length > 1 && (
                            <div className="mt-3 flex justify-between">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setPhotoIndex((current) =>
                                            current <= 0 ? evidenceUrls(selected).length - 1 : current - 1
                                        )
                                    }
                                    className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
                                >
                                    Previous
                                </button>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setPhotoIndex((current) =>
                                            current >= evidenceUrls(selected).length - 1 ? 0 : current + 1
                                        )
                                    }
                                    className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
                                >
                                    Next
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <CenterModal
                open={Boolean(confirmAction)}
                title={
                    confirmAction === 'approve'
                        ? 'Approve and deduct this damage?'
                        : 'Reject this damage report?'
                }
                message={
                    confirmAction === 'approve'
                        ? `Approving will deduct ${
                              selected?.quantity_display ||
                              `${formatQty(selected?.quantity)} ${selected?.unit || ''}`
                          } from inventory using the oldest batch first.`
                        : 'Rejected reports do not deduct any inventory.'
                }
                tone={confirmAction === 'reject' ? 'warn' : 'warn'}
                confirmLabel={confirmAction === 'approve' ? 'Approve & Deduct' : 'Reject Report'}
                busy={actionBusy}
                onClose={() => setConfirmAction(null)}
                onConfirm={() => {
                    if (confirmAction === 'approve') runReview('approve');
                    else if (confirmAction === 'reject') runReview('reject');
                }}
            />

            <CenterModal
                open={modal.open}
                title={modal.title}
                message={modal.message}
                tone={modal.tone}
                onClose={() => setModal({ open: false })}
            />
        </div>
    );
}
