import { useState, useEffect } from 'react';
import { Link, router } from '@inertiajs/react';
import Sidebar from '@/Components/Budget/BudgetSidebar';
import BudgetNotificationBell from '@/Components/Budget/BudgetNotificationBell';
import { withRunningQuantities, formatStockBreakdown } from '@/utils/inventoryStock';
import { fetchBudgetInventoryAlerts, markSidebarAlertsSeen } from '@/utils/budgetInventoryAlerts';

// Diri ipakita ang breakdown sa quantity.
function QuantityBreakdown({ qty, inventory, className = '' }) {
    const { primary, secondary } = formatStockBreakdown(qty, inventory);

    return (
        <div className={className}>
            <p className="tabular-nums">{primary}</p>
            {secondary ? <p className="mt-0.5 text-xs tabular-nums text-slate-500">({secondary})</p> : null}
        </div>
    );
}

// Diri ang item sa detalye nga naay label.
function DetailItem({ label, value, mono = false }) {
    return (
        <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
            <p className={`mt-1 text-sm font-medium text-gray-900 ${mono ? 'font-mono' : ''}`}>{value}</p>
        </div>
    );
}

// Diri kuhaon ang badge base sa expiration.
function getStatusBadge(expirationDate) {
    const today = new Date();
    const expiry = new Date(expirationDate);
    const daysUntilExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
        return { label: 'Expired', className: 'bg-red-50 text-red-700 ring-1 ring-red-200' };
    }
    if (daysUntilExpiry < 30) {
        return { label: 'Expiring Soon', className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' };
    }
    if (daysUntilExpiry < 90) {
        return { label: 'Expiring', className: 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200' };
    }
    return { label: 'Good', className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' };
}

// Diri i-check kung expired na ang item.
function isExpired(expirationDate) {
    if (!expirationDate) return false;

    const expiry = new Date(expirationDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expiry.setHours(0, 0, 0, 0);

    return expiry < today;
}

const REASON_LABELS = {
    stock_in: 'New item',
    new_item: 'New item',
    receiving: 'Receiving',
    used: 'Used',
    damaged: 'Damaged',
    expired: 'Expired',
};

const REASON_BADGES = {
    used: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
    damaged: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
    expired: 'bg-red-50 text-red-700 ring-1 ring-red-200',
    stock_in: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
    new_item: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
    receiving: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
};

// Diri kuhaon ang label sa inbound entry.
function inboundReasonKey(log) {
    return log.entry_source === 'new' ? 'new_item' : 'receiving';
}

// Diri ang page sa detalye sa inventory.
export default function InventoryDetail({ id }) {
    const [inventory, setInventory] = useState(null);
    const [batches, setBatches] = useState([]);
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [showStockOut, setShowStockOut] = useState(false);
    const [stockOutForm, setStockOutForm] = useState({ quantity: '', reason: 'used' });
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchInventory();
    }, [id]);

    useEffect(() => {
        if (!inventory?.id) return;
        fetchBudgetInventoryAlerts().then((alerts) => {
            const id = Number(inventory.id);
            markSidebarAlertsSeen(
                alerts.filter((alert) => Number(alert.data?.inventory_id) === id)
            );
        });
    }, [inventory?.id]);

    // Diri kuhaon ang detalye sa inventory ug logs.
    const fetchInventory = async () => {
        setLoading(true);
        try {
            const response = await fetch(`/api/budget/inventory/${id}`);
            const data = await response.json();

            if (data.success) {
                setInventory(data.inventory);
                setBatches(data.batches || []);
                setLogs(data.logs || []);
            } else {
                setInventory(null);
                setBatches([]);
                setMessage({ type: 'error', text: data.message || 'Failed to fetch inventory item' });
            }
        } catch {
            setMessage({ type: 'error', text: 'Failed to fetch inventory item. Please try again.' });
        } finally {
            setLoading(false);
        }
    };

    // Diri i-submit ang stock out.
    const handleStockOut = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setMessage({ type: '', text: '' });

        const payload =
            stockOutForm.reason === 'expired'
                ? { reason: 'expired' }
                : stockOutForm;

        try {
            const response = await fetch(`/api/budget/inventory/${id}/stock-out`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                },
                body: JSON.stringify(payload),
            });
            const data = await response.json();

            if (data.success) {
                setMessage({ type: 'success', text: data.message || 'Stock out recorded successfully' });
                setShowStockOut(false);
                setStockOutForm({ quantity: '', reason: 'used' });

                if (stockOutForm.reason === 'expired' && Number(data.inventory?.quantity || 0) <= 0) {
                    window.location.href = '/budget/inventory';
                    return;
                }

                await fetchInventory();
            } else {
                setMessage({ type: 'error', text: data.message || 'Failed to record stock out' });
            }
        } catch {
            setMessage({ type: 'error', text: 'Failed to record stock out. Please try again.' });
        } finally {
            setSubmitting(false);
        }
    };

    // Diri i-format ang quantity.
    const formatQuantity = (value) =>
        Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 });

    // Diri ablihan ang stock out form.
    const openStockOut = () => {
        if (inventory && isExpired(inventory.expiration_date)) {
            setStockOutForm({
                reason: 'expired',
                quantity: String(inventory.quantity),
            });
        } else {
            setStockOutForm({ quantity: '', reason: 'used' });
        }
        setShowStockOut(true);
    };

    // Diri kwentahon ang display sa vial.
    const formatVialDisplay = (item) => {
        const quantity = Number(item?.quantity || 0);
        const volumePerVial = Number(item?.volume_ml || 0);
        return {
            displayVials: Math.ceil(quantity),
            totalMlRemaining: quantity * volumePerVial,
        };
    };

    // Diri i-check kung vial ang item.
    const isVialItem = (item) =>
        Boolean(item?.is_vial) || String(item?.unit?.name || '').toLowerCase().includes('vial');

    // Diri ang layout nga naay sidebar.
    const shell = (content) => (
        <div className="flex h-screen overflow-hidden bg-canvas">
            <Sidebar />
            <main className="staff-main flex min-h-0 flex-1 flex-col">{content}</main>
        </div>
    );

    if (loading) {
        return shell(
            <div className="flex flex-1 items-center justify-center">
                <div className="text-center">
                    <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-[3px] border-violet-600 border-t-transparent" />
                    <p className="text-sm text-gray-500">Loading item...</p>
                </div>
            </div>
        );
    }

    if (!inventory) {
        return shell(
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                <p className="text-sm font-medium text-gray-900">Inventory item not found</p>
                <Link
                    href="/budget/inventory"
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                >
                    Back to Inventory
                </Link>
            </div>
        );
    }

    const status = getStatusBadge(inventory.expiration_date);
    const vialInfo = isVialItem(inventory) ? formatVialDisplay(inventory) : null;
    const movementLogs = withRunningQuantities(logs, inventory);

    return shell(
        <div className="flex min-h-0 flex-1 flex-col px-6 py-5">
            <div className="shrink-0 pb-5">
                <Link
                    href="/budget/inventory"
                    className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to Inventory
                </Link>

                {batches.length > 1 && (
                    <div className="mb-4 flex gap-2 overflow-x-auto">
                        {batches.map((batch) => {
                            const selected = Number(batch.id) === Number(id);

                            return (
                                <button
                                    key={batch.id}
                                    type="button"
                                    onClick={() => {
                                        if (!selected) router.visit(`/budget/inventory/${batch.id}`);
                                    }}
                                    aria-current={selected ? 'page' : undefined}
                                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${
                                        selected
                                            ? 'border-violet-200 bg-violet-50 text-violet-800'
                                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                    }`}
                                >
                                    <svg
                                        className={`h-3 w-3 ${selected ? 'rotate-180 text-violet-600' : 'text-slate-400'}`}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                        aria-hidden="true"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                                    </svg>
                                    {batch.label}
                                    {batch.used_first ? ' · Used first' : ''}
                                </button>
                            );
                        })}
                    </div>
                )}

                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold text-gray-900">{inventory.medicine.name}</h1>
                        <p className="mt-1 text-sm text-gray-500">{inventory.medicine.category.name}</p>
                    </div>
                    <div className="flex items-center gap-3 self-start">
                        <BudgetNotificationBell />
                        <Link
                            href={`/budget/inventory/history?q=${encodeURIComponent(inventory.medicine?.name || '')}&inventory_id=${inventory.id}`}
                            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                        >
                            History
                        </Link>
                        <span className={`inline-flex rounded-lg px-3 py-1 text-sm font-medium ${status.className}`}>
                            {status.label}
                        </span>
                        <button
                            type="button"
                            onClick={openStockOut}
                            disabled={Number(inventory.quantity) <= 0}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4m8 8l-8-8 8-8" />
                            </svg>
                            Stock Out
                        </button>
                    </div>
                </div>

                {message.text && (
                    <div
                        className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
                            message.type === 'success'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : 'border-red-200 bg-red-50 text-red-800'
                        }`}
                    >
                        {message.text}
                    </div>
                )}

                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Stock</p>
                        <p className="mt-1 text-2xl font-bold text-gray-900">
                            {isVialItem(inventory)
                                ? `${vialInfo.displayVials} ${inventory.unit.name}`
                                : `${formatQuantity(Math.ceil(Number(inventory.quantity)))} ${inventory.unit.name}`}
                        </p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Expires</p>
                        <p className="mt-1 text-2xl font-bold text-gray-900">
                            {new Date(inventory.expiration_date).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                            })}
                        </p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Unit</p>
                        <p className="mt-1 text-2xl font-bold text-gray-900">{inventory.unit.name}</p>
                    </div>
                </div>
            </div>

            <div
                className="min-h-0 flex-1 overflow-auto rounded-xl border border-gray-200 bg-white [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
                <div className="grid gap-6 p-5 lg:grid-cols-2">
                    <section className="rounded-xl border border-gray-100 bg-gray-50/50 p-5">
                        <h2 className="mb-4 text-sm font-semibold text-gray-900">Basic Information</h2>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <DetailItem label="Medicine" value={inventory.medicine.name} />
                            <DetailItem label="Category" value={inventory.medicine.category.name} />
                            <DetailItem label="Unit" value={inventory.unit.name} />
                            {inventory.batch_number && (
                                <DetailItem label="Batch Number" value={inventory.batch_number} mono />
                            )}
                        </div>
                    </section>

                    <section className="rounded-xl border border-gray-100 bg-gray-50/50 p-5">
                        <h2 className="mb-4 text-sm font-semibold text-gray-900">Stock Details</h2>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <DetailItem
                                label="Quantity"
                                value={
                                    isVialItem(inventory)
                                        ? `${vialInfo.displayVials} ${inventory.unit.name}`
                                        : `${formatQuantity(Math.ceil(Number(inventory.quantity)))} ${inventory.unit.name}`
                                }
                            />
                            {isVialItem(inventory) && inventory.volume_ml > 0 && (
                                <>
                                    <DetailItem label="Volume per Vial" value={`${inventory.volume_ml} ml`} />
                                    <DetailItem
                                        label="Total Remaining"
                                        value={`${vialInfo.totalMlRemaining.toLocaleString(undefined, {
                                            minimumFractionDigits: 0,
                                            maximumFractionDigits: 2,
                                        })} ml`}
                                    />
                                </>
                            )}
                            {inventory.volume_ml > 0 && !isVialItem(inventory) && (
                                <DetailItem label="Volume per Unit" value={`${inventory.volume_ml} ml`} />
                            )}
                            {inventory.items_per_box > 0 && (
                                <>
                                    <DetailItem label="Items per Box" value={`${inventory.items_per_box} items`} />
                                    <DetailItem
                                        label="Total Items"
                                        value={`${formatQuantity(Number(inventory.quantity) * Number(inventory.items_per_box))} items`}
                                    />
                                </>
                            )}
                        </div>
                    </section>

                    <section className="rounded-xl border border-gray-100 bg-gray-50/50 p-5 lg:col-span-2">
                        <h2 className="mb-4 text-sm font-semibold text-gray-900">Expiry</h2>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <DetailItem
                                label="Expiration Date"
                                value={new Date(inventory.expiration_date).toLocaleDateString('en-US', {
                                    weekday: 'long',
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                })}
                            />
                            <DetailItem label="Status" value={status.label} />
                        </div>
                    </section>

                    <section className="rounded-xl border border-gray-100 bg-gray-50/50 p-5 lg:col-span-2">
                        <h2 className="mb-4 text-sm font-semibold text-gray-900">Stock Movements (In / Out)</h2>
                        {logs.length === 0 ? (
                            <p className="text-sm text-gray-500">No stock movements recorded for this batch yet.</p>
                        ) : (
                            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                                <table className="w-full text-sm">
                                    <thead className="border-b border-gray-200 bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Type</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Reason</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Recent quantity</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Quantity</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Quantity left</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Used For</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Date &amp; Time</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {movementLogs.map((log) => (
                                            <tr key={log.id}>
                                                <td className="px-4 py-3">
                                                    <span
                                                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                                            log.type === 'IN'
                                                                ? 'bg-emerald-100 text-emerald-700'
                                                                : 'bg-red-100 text-red-700'
                                                        }`}
                                                    >
                                                        {log.type}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {(() => {
                                                        const reasonKey = log.type === 'IN' ? inboundReasonKey(log) : log.reason;
                                                        return (
                                                            <span
                                                                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                                                    REASON_BADGES[reasonKey] || 'bg-gray-100 text-gray-700'
                                                                }`}
                                                            >
                                                                {REASON_LABELS[reasonKey] || reasonKey}
                                                            </span>
                                                        );
                                                    })()}
                                                </td>
                                                <td className="px-4 py-3 text-slate-700">
                                                    <QuantityBreakdown qty={log.qty_before ?? 0} inventory={inventory} />
                                                </td>
                                                <td className={`px-4 py-3 font-semibold ${log.type === 'IN' ? 'text-emerald-600' : 'text-red-600'}`}>
                                                    {log.type === 'IN' ? '+' : '\u2212'}
                                                    {log.qty_ml != null
                                                        ? `${formatQuantity(log.qty_ml)} ml`
                                                        : `${formatQuantity(log.qty)} ${log.unit}`}
                                                    {log.qty_ml != null && (
                                                        <span className="ml-1 font-normal text-gray-500">
                                                            ({formatQuantity(log.qty)} {Number(log.qty) === 1 ? 'vial' : 'vials'})
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 font-semibold text-slate-900">
                                                    <QuantityBreakdown qty={log.qty_after ?? 0} inventory={inventory} />
                                                </td>
                                                <td className="px-4 py-3 text-gray-700">
                                                    {log.used_for ? (
                                                        <div>
                                                            <p className="font-medium text-gray-900">
                                                                {log.used_for.pet_name}
                                                                <span className="ml-1.5 text-xs font-normal text-gray-500">
                                                                    ({log.used_for.booking_type})
                                                                </span>
                                                            </p>
                                                            <p className="mt-0.5 text-xs text-gray-500">
                                                                {log.used_for.service} &middot; {log.used_for.owner_name}
                                                            </p>
                                                        </div>
                                                    ) : log.type === 'IN' || log.reason === 'stock_in' || log.reason === 'receiving' ? (
                                                        <span className="font-medium text-slate-800">
                                                            {log.entry_source === 'new' ? 'New item' : 'Receiving'}
                                                        </span>
                                                    ) : log.type === 'OUT' &&
                                                      (log.reason === 'used' ||
                                                          log.reason === 'damaged' ||
                                                          log.reason === 'expired') ? (
                                                        <span className="text-gray-400">Manual stock out</span>
                                                    ) : (
                                                        <span className="text-gray-400">&mdash;</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-gray-700">
                                                    {log.date} {log.time}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </div>
            </div>

            {showStockOut && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
                        <h2 className="text-lg font-semibold text-gray-900">Stock Out</h2>
                        <p className="mt-1 text-sm text-gray-500">
                            Remove stock from this batch and record the reason.
                        </p>

                        <form onSubmit={handleStockOut} className="mt-5 space-y-4">
                            {stockOutForm.reason === 'expired' ? (
                                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                                    <p className="font-medium">Entire batch will be written off</p>
                                    <p className="mt-1">
                                        {formatQuantity(inventory.quantity)} {inventory.unit?.name || 'units'} will be removed
                                        because this batch is expired.
                                    </p>
                                </div>
                            ) : (
                                <div>
                                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                                        Quantity ({inventory.unit?.name || 'units'})
                                    </label>
                                    <input
                                        type="number"
                                        min="0.001"
                                        step="any"
                                        max={inventory.quantity}
                                        required
                                        value={stockOutForm.quantity}
                                        onChange={(e) => setStockOutForm((prev) => ({ ...prev, quantity: e.target.value }))}
                                        className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                                        placeholder={`Available: ${formatQuantity(inventory.quantity)}`}
                                    />
                                </div>
                            )}

                            <div>
                                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    Reason
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['used', 'damaged', 'expired'].map((reason) => {
                                        const expiredDisabled =
                                            reason === 'expired' && !isExpired(inventory.expiration_date);

                                        return (
                                            <button
                                                key={reason}
                                                type="button"
                                                disabled={expiredDisabled}
                                                title={
                                                    expiredDisabled
                                                        ? 'Only available when this batch is past its expiry date'
                                                        : undefined
                                                }
                                                onClick={() =>
                                                    setStockOutForm((prev) => ({
                                                        ...prev,
                                                        reason,
                                                        quantity:
                                                            reason === 'expired'
                                                                ? String(inventory.quantity)
                                                                : prev.quantity,
                                                    }))
                                                }
                                                className={`rounded-xl border px-3 py-2.5 text-sm font-medium capitalize transition-colors ${
                                                    stockOutForm.reason === reason
                                                        ? 'border-violet-500 bg-violet-50 text-violet-700'
                                                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                                } ${expiredDisabled ? 'cursor-not-allowed opacity-40 hover:bg-white' : ''}`}
                                            >
                                                {reason}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowStockOut(false)}
                                    className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-700 disabled:opacity-50"
                                >
                                    {submitting ? 'Saving...' : 'Confirm Stock Out'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
