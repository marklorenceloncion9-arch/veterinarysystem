import { useEffect, useState } from 'react';
import { getInventoryCategoriesForServices } from '@/utils/serviceInventoryCategories';

export const OUTSIDE_PURCHASE_STATUS = 'Approved by the clinic';

const RECEIPT_CSS = `
    * { box-sizing: border-box; }
    @page {
        size: 8.5in 11in;
        margin: 0;
    }
    html, body {
        width: 8.5in;
        margin: 0;
        background: #fff;
        color: #0f172a;
        font-family: "Segoe UI", Arial, sans-serif;
    }
    .receipt {
        width: 100%;
        min-height: 11in;
        margin: 0;
        padding: 0.55in 0.6in;
    }
    .receipt-brand {
        text-align: center;
    }
    .receipt-logo {
        width: 1.15in;
        height: 1.15in;
        object-fit: contain;
        margin: 0 auto 12px;
        display: block;
    }
    .receipt-clinic {
        margin: 0;
        font-size: 22pt;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }
    .receipt-office {
        margin: 6px 0 0;
        font-size: 11pt;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #475569;
    }
    .receipt-rule {
        border: 0;
        border-top: 1.5px solid #0f172a;
        margin: 18px 0;
    }
    .receipt-row {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        margin: 0 0 12px;
        font-size: 13pt;
        line-height: 1.4;
    }
    .receipt-label {
        color: #64748b;
        font-size: 10pt;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
    }
    .receipt-value {
        text-align: right;
        font-weight: 650;
    }
    .receipt-item {
        margin: 0 0 16px;
    }
    .receipt-box {
        border: 1.5px solid #0f172a;
        border-radius: 8px;
        padding: 14px 16px;
    }
    .receipt-pair {
        display: flex;
        gap: 16px;
    }
    .receipt-pair .receipt-field {
        flex: 1;
        min-width: 0;
    }
    .receipt-pair .receipt-field + .receipt-field {
        margin: 0;
        padding: 0 0 0 16px;
        border-top: 0;
        border-left: 1px solid #cbd5e1;
    }
    .receipt-field span {
        display: block;
        font-size: 10pt;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #64748b;
    }
    .receipt-field strong {
        display: block;
        margin-top: 4px;
        font-size: 16pt;
    }
    .receipt-status {
        margin: 8px 2px 0;
        font-size: 12pt;
    }
    .receipt-status span {
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: #64748b;
        font-size: 10pt;
    }
`;

// Diri himuon ang bag-ong linya sa tambal nga paliton sa gawas.
export function createOutsidePurchaseLine() {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `outside-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    return {
        id,
        name: '',
        quantity: '',
        status: OUTSIDE_PURCHASE_STATUS,
    };
}

// Diri limpyohon ang text sa resibo.
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Diri i-format ang quantity nga walay sobra nga zero.
export function formatOutsideQuantity(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return String(value ?? '').trim();
    if (Number.isInteger(num)) return String(num);
    return String(parseFloat(num.toFixed(2)));
}

// Diri i-normalize ang status sa resibo.
export function normalizeOutsidePurchaseStatus(status) {
    const value = String(status || '').trim();
    if (!value || value.toLowerCase() === 'not available') {
        return OUTSIDE_PURCHASE_STATUS;
    }
    return value;
}

// Diri kuhaon ang mga linya nga kompleto na.
export function completedOutsidePurchaseItems(lines = []) {
    return lines
        .map((line) => ({
            name: String(line.name || '').trim(),
            quantity: line.quantity,
            status: normalizeOutsidePurchaseStatus(line.status),
        }))
        .filter((line) => line.name && Number(line.quantity) > 0)
        .map((line) => ({
            name: line.name,
            quantity: Number(line.quantity),
            status: line.status,
        }));
}

// Diri i-validate ang mga linya nga gisugdan na.
export function outsidePurchaseFieldErrors(lines = []) {
    const errors = {};

    lines.forEach((line) => {
        const name = String(line.name || '').trim();
        const quantityRaw = String(line.quantity ?? '').trim();
        if (!name && !quantityRaw) return;

        if (!name) {
            errors[`outside_${line.id}_name`] = 'Enter the medicine name.';
        }

        const quantity = Number(line.quantity);
        if (!quantityRaw || Number.isNaN(quantity) || quantity <= 0) {
            errors[`outside_${line.id}_quantity`] = 'Quantity must be at least 1.';
        }
    });

    return errors;
}

// Diri himuon ang service type ug treatment nga ipakita sa resibo.
export function buildVisitReceiptDetails(serviceNames = [], symptoms = []) {
    const names = [...new Set(serviceNames.filter(Boolean))];
    const serviceType = names.join(', ');
    const isTreatment = names.some((name) => String(name).toLowerCase().includes('treatment'));

    if (!isTreatment) {
        return { serviceType, treatment: '' };
    }

    const treatment = symptoms
        .filter((symptom) => symptom?.name && symptom.name !== 'Bite Incident')
        .map((symptom) => {
            const days = Number(symptom.days_count);
            if (days > 0) {
                return `${symptom.name} (${days} day${days === 1 ? '' : 's'})`;
            }
            return symptom.name;
        })
        .join(', ');

    return { serviceType, treatment };
}

// Diri i-format ang petsa ug oras nga gihatag ang resibo.
function formatIssuedAt(value) {
    const date = value instanceof Date ? value : new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

// Diri i-print ang resibo nga paliton sa gawas.
export function printOutsidePurchaseReceipt({
    animals = [],
    ownerName = '',
    serviceType = '',
    treatment = '',
    category = '',
    items = [],
    issuedAt = new Date(),
}) {
    const logo = `${window.location.origin}/images/el_salvador_city_vet_logo.png`;
    const animalNames = animals.map((animal) => animal.name).filter(Boolean).join(', ') || '—';
    const patientIds = animals.map((animal) => animal.patientId).filter(Boolean).join(', ') || '—';
    const issuedLabel = formatIssuedAt(issuedAt);
    const rows = [
        ['Animal name', animalNames],
        ['Owner name', ownerName || '—'],
        ['Patient ID', patientIds],
        ['Clinic', 'El Salvador City Vet'],
        ['Service type', serviceType || '—'],
    ];

    if (treatment) {
        rows.push(['Treatment', treatment]);
    }

    const categoryLabel = (Array.isArray(category) ? category : [category])
        .map((name) => String(name || '').trim())
        .filter(Boolean)
        .join(', ');

    if (categoryLabel) {
        rows.push(['Category', categoryLabel]);
    }

    rows.push(['Date and time', issuedLabel || '—']);

    const details = rows.map(([label, value]) => `
        <div class="receipt-row">
            <span class="receipt-label">${escapeHtml(label)}</span>
            <span class="receipt-value">${escapeHtml(value)}</span>
        </div>
    `).join('');

    const itemHtml = items.map((item) => `
        <div class="receipt-item">
            <div class="receipt-box">
                <div class="receipt-pair">
                    <div class="receipt-field">
                        <span>Name</span>
                        <strong>${escapeHtml(item.name)}</strong>
                    </div>
                    <div class="receipt-field">
                        <span>Quantity</span>
                        <strong>${escapeHtml(formatOutsideQuantity(item.quantity))}</strong>
                    </div>
                </div>
            </div>
            <p class="receipt-status"><span>Status</span> ${escapeHtml(item.status || OUTSIDE_PURCHASE_STATUS)}</p>
        </div>
    `).join('');

    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc || !win) {
        iframe.remove();
        return;
    }

    doc.open();
    doc.write(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title> </title>
    <style>${RECEIPT_CSS}</style>
</head>
<body>
    <article class="receipt">
        <header class="receipt-brand">
            <img class="receipt-logo" src="${escapeHtml(logo)}" alt="El Salvador City Vet logo" />
            <p class="receipt-clinic">El Salvador City Vet</p>
            <p class="receipt-office">Office of the City Veterinarian</p>
        </header>
        <hr class="receipt-rule" />
        ${details}
        <hr class="receipt-rule" />
        ${itemHtml}
    </article>
</body>
</html>`);
    doc.close();

    const cleanup = () => {
        window.setTimeout(() => iframe.remove(), 500);
    };
    win.onafterprint = cleanup;
    window.setTimeout(() => {
        win.focus();
        win.print();
    }, 150);
}

// Diri i-print ang na-save nga outside clinic nga resibo gikan sa history.
export function printSavedOutsideClinicReceipt({ pet, ownerName, entry }) {
    const items = entry?.outside_items || [];
    if (!items.length) return;

    printOutsidePurchaseReceipt({
        animals: [{
            name: pet?.pet_name || pet?.name || '',
            patientId: pet?.identification_number
                || (pet?.registration_status === 'exempt' ? 'No ID needed' : '—'),
        }],
        ownerName: ownerName || '',
        serviceType: entry?.service_type || '',
        treatment: '',
        category: '',
        items: items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            status: item.status,
        })),
        issuedAt: items.find((item) => item.issued_at)?.issued_at || entry?.created_at || entry?.treatment_date,
    });
}

function ReceiptDetail({ label, value }) {
    return (
        <div className="flex items-start justify-between gap-4 text-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
            <span className="text-right font-semibold text-slate-900">{value || '—'}</span>
        </div>
    );
}

// Diri ang button nga moabli sa resibo.
export function OutsidePurchaseEditor({
    items,
    onChange,
    errors = {},
    clinicHasNoStock = false,
    receipt,
}) {
    const lines = items?.length ? items : [createOutsidePurchaseLine()];
    const readyItems = completedOutsidePurchaseItems(lines);
    const fieldErrors = outsidePurchaseFieldErrors(lines);
    const canPrint = readyItems.length > 0 && Object.keys(fieldErrors).length === 0;
    const [open, setOpen] = useState(false);
    const [issuedAt, setIssuedAt] = useState(null);
    const [printError, setPrintError] = useState('');
    const [selectedCategories, setSelectedCategories] = useState([]);
    const [fetchedCategories, setFetchedCategories] = useState([]);
    const serviceNames = receipt?.serviceNames || [];
    const allowedCategories = getInventoryCategoriesForServices(serviceNames) || [];
    const stockCategories = Array.isArray(receipt?.categories) ? receipt.categories : [];
    const categoryOptions = fetchedCategories.length
        ? fetchedCategories
        : [...new Set([...allowedCategories, ...stockCategories])];
    const serviceKey = serviceNames.join('|');
    const optionKey = categoryOptions.join('|');
    const details = buildVisitReceiptDetails(receipt?.serviceNames || [], receipt?.symptoms || []);
    const animalNames = (receipt?.animals || []).map((animal) => animal.name).filter(Boolean).join(', ');
    const patientIds = (receipt?.animals || []).map((animal) => animal.patientId).filter(Boolean).join(', ');
    const issuedLabel = (issuedAt || new Date()).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });

    useEffect(() => {
        if (!open) return undefined;

        let cancelled = false;
        fetch('/api/budget/categories', { headers: { Accept: 'application/json' } })
            .then((response) => response.json())
            .then((data) => {
                if (cancelled) return;
                const names = (data.categories || []).map((entry) => entry.name).filter(Boolean);
                setFetchedCategories(names);
            })
            .catch(() => {
                if (cancelled) return;
            });

        return () => {
            cancelled = true;
        };
    }, [open]);

    useEffect(() => {
        if (!open || categoryOptions.length === 0) return;
        const preferred = [
            ...allowedCategories,
            String(receipt?.category || '').trim(),
        ].filter((name) => name && categoryOptions.includes(name));

        setSelectedCategories((current) => {
            const stillSelected = current.filter((name) => categoryOptions.includes(name));
            if (stillSelected.length > 0) return stillSelected;
            return [...new Set(preferred)];
        });
    }, [open, serviceKey, optionKey]);

    const updateLine = (id, patch) => {
        onChange(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)));
        setPrintError('');
    };

    const addLine = () => {
        onChange([...lines, createOutsidePurchaseLine()]);
    };

    const removeLine = (id) => {
        const next = lines.filter((line) => line.id !== id);
        onChange(next.length > 0 ? next : [createOutsidePurchaseLine()]);
    };

    const toggleCategory = (categoryName) => {
        setSelectedCategories((current) => (
            current.includes(categoryName)
                ? current.filter((name) => name !== categoryName)
                : [...current, categoryName]
        ));
    };

    const openReceipt = () => {
        setIssuedAt(new Date());
        setPrintError('');
        setOpen(true);
    };

    const handlePrint = () => {
        if (!canPrint) {
            setPrintError('Enter a medicine name and quantity before printing.');
            return;
        }

        printOutsidePurchaseReceipt({
            animals: receipt?.animals || [],
            ownerName: receipt?.ownerName || '',
            serviceType: details.serviceType,
            treatment: details.treatment,
            category: selectedCategories,
            items: readyItems,
            issuedAt: issuedAt || new Date(),
        });
        setOpen(false);
    };

    return (
        <>
            <button
                type="button"
                onClick={openReceipt}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                    clinicHasNoStock
                        ? 'bg-violet-600 text-white hover:bg-violet-700'
                        : 'border border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100'
                }`}
            >
                Outside clinic receipt
            </button>

            {open && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
                    <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                            <div className="text-center">
                                <img
                                    src="/images/el_salvador_city_vet_logo.png"
                                    alt="El Salvador City Vet logo"
                                    className="mx-auto h-16 w-16 object-contain"
                                />
                                <p className="mt-2 text-lg font-extrabold uppercase tracking-wide text-slate-900">El Salvador City Vet</p>
                                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Office of the City Veterinarian</p>
                            </div>

                            <div className="mt-4 space-y-2 border-t border-slate-200 pt-4">
                                <ReceiptDetail label="Animal name" value={animalNames} />
                                <ReceiptDetail label="Owner name" value={receipt?.ownerName} />
                                <ReceiptDetail label="Patient ID" value={patientIds} />
                                <ReceiptDetail label="Clinic" value="El Salvador City Vet" />
                                <ReceiptDetail label="Service type" value={details.serviceType} />
                                {details.treatment ? <ReceiptDetail label="Treatment" value={details.treatment} /> : null}
                                <div>
                                    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                        Category
                                    </p>
                                    {categoryOptions.length === 0 ? (
                                        <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-sm text-slate-500">
                                            Loading categories...
                                        </p>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-2">
                                            {categoryOptions.map((categoryName) => {
                                                const checked = selectedCategories.includes(categoryName);
                                                return (
                                                    <label
                                                        key={categoryName}
                                                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
                                                            checked
                                                                ? 'border-violet-300 bg-violet-50 text-violet-900'
                                                                : 'border-slate-200 bg-white text-slate-800'
                                                        }`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => toggleCategory(categoryName)}
                                                            className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                                                        />
                                                        <span className="min-w-0">{categoryName}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                                <ReceiptDetail label="Date and time" value={issuedLabel} />
                            </div>

                            <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
                                {lines.map((line) => (
                                    <div key={line.id}>
                                        <div className="rounded-lg border-2 border-slate-900 px-3 py-3">
                                            {lines.length > 1 && (
                                                <div className="mb-2 flex justify-end">
                                                    <button
                                                        type="button"
                                                        onClick={() => removeLine(line.id)}
                                                        className="text-xs font-semibold text-slate-500 hover:text-red-600"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            )}
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="min-w-0">
                                                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Name</label>
                                                    <input
                                                        type="text"
                                                        value={line.name}
                                                        onChange={(event) => updateLine(line.id, { name: event.target.value })}
                                                        placeholder="Medicine or item name"
                                                        className={`mt-1 w-full border-0 border-b bg-transparent px-0 py-1 text-base font-semibold text-slate-900 focus:outline-none focus:ring-0 ${
                                                            errors[`outside_${line.id}_name`] ? 'border-red-400' : 'border-slate-200'
                                                        }`}
                                                    />
                                                    {errors[`outside_${line.id}_name`] && (
                                                        <p className="mt-1 text-xs text-red-600">{errors[`outside_${line.id}_name`]}</p>
                                                    )}
                                                </div>
                                                <div className="min-w-0 border-l border-slate-200 pl-3">
                                                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Quantity</label>
                                                    <input
                                                        type="number"
                                                        min="0.01"
                                                        step="any"
                                                        value={line.quantity}
                                                        onChange={(event) => updateLine(line.id, { quantity: event.target.value })}
                                                        placeholder="0"
                                                        className={`mt-1 w-full border-0 border-b bg-transparent px-0 py-1 text-base font-semibold text-slate-900 focus:outline-none focus:ring-0 ${
                                                            errors[`outside_${line.id}_quantity`] ? 'border-red-400' : 'border-slate-200'
                                                        }`}
                                                    />
                                                    {errors[`outside_${line.id}_quantity`] && (
                                                        <p className="mt-1 text-xs text-red-600">{errors[`outside_${line.id}_quantity`]}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <label className="mt-2 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                            Status
                                        </label>
                                        <input
                                            type="text"
                                            value={normalizeOutsidePurchaseStatus(line.status)}
                                            onChange={(event) => updateLine(line.id, { status: event.target.value })}
                                            placeholder={OUTSIDE_PURCHASE_STATUS}
                                            className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-900 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-100"
                                        />
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    onClick={addLine}
                                    className="w-full rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-800 hover:bg-violet-100"
                                >
                                    Add
                                </button>
                            </div>
                            {printError && <p className="mt-3 text-xs text-red-600">{printError}</p>}
                        </div>
                        <div className="flex gap-2 border-t border-slate-200 px-6 py-4">
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                onClick={handlePrint}
                                className="flex-1 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
                            >
                                Print receipt
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

// Diri ipakita ang na-save nga tambal nga paliton sa gawas.
export function OutsidePurchaseSummary({ items = [], onPrint }) {
    if (!items.length) return null;

    return (
        <div className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">Outside clinic</p>
                {onPrint && (
                    <button
                        type="button"
                        onClick={onPrint}
                        className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
                    >
                        Print receipt
                    </button>
                )}
            </div>
            <div className="space-y-3">
                {items.map((item, index) => (
                    <div key={`${item.name}-${index}`}>
                        <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-300 bg-white p-3">
                            <div className="min-w-0">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Name</p>
                                <p className="mt-0.5 text-sm font-semibold text-slate-900">{item.name}</p>
                            </div>
                            <div className="min-w-0 border-l border-slate-200 pl-3">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Quantity</p>
                                <p className="mt-0.5 text-sm font-semibold text-slate-900">{formatOutsideQuantity(item.quantity)}</p>
                            </div>
                        </div>
                        <p className="mt-1.5 text-xs text-slate-600">
                            <span className="font-semibold uppercase tracking-wider text-slate-500">Status</span>
                            {' '}
                            {normalizeOutsidePurchaseStatus(item.status)}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}
