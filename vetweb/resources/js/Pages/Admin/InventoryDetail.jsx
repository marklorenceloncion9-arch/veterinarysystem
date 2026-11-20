import { useState, useEffect } from 'react';
import { Link } from '@inertiajs/react';
import Sidebar from '@/Components/Budget/BudgetSidebar';
import { withRunningQuantities, formatStockBreakdown } from '@/utils/inventoryStock';

const REASON_LABELS = {
    stock_in: 'Stock In',
    used: 'Used',
    damaged: 'Damaged',
    expired: 'Expired',
};

const REASON_BADGES = {
    used: 'bg-blue-100 text-blue-700',
    damaged: 'bg-orange-100 text-orange-700',
    expired: 'bg-red-100 text-red-700',
    stock_in: 'bg-emerald-100 text-emerald-700',
};

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

// Diri i-check kung expired na ang item.
function isExpired(expirationDate) {
    if (!expirationDate) return false;

    const expiry = new Date(expirationDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expiry.setHours(0, 0, 0, 0);

    return expiry < today;
}

// Diri ang page sa detalye sa inventory.
export default function InventoryDetail({ id }) {
    const [inventory, setInventory] = useState(null);
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [showStockOut, setShowStockOut] = useState(false);
    const [stockOutForm, setStockOutForm] = useState({ quantity: '', reason: 'used' });
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchInventory();
    }, [id]);

    // Diri kuhaon ang detalye sa inventory ug logs.
    const fetchInventory = async () => {
        try {
            const response = await fetch(`/api/budget/inventory/${id}`);
            const data = await response.json();
            
            if (data.success) {
                setInventory(data.inventory);
                setLogs(data.logs || []);
            } else {
                setMessage({ type: 'error', text: data.message || 'Failed to fetch inventory item' });
            }
        } catch (error) {
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
                await fetchInventory();
            } else {
                setMessage({ type: 'error', text: data.message || 'Failed to record stock out' });
            }
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to record stock out. Please try again.' });
        } finally {
            setSubmitting(false);
        }
    };

    // Diri kuhaon ang kolor base sa expiration.
    const getStatusColor = (expirationDate) => {
        const today = new Date();
        const expiry = new Date(expirationDate);
        const daysUntilExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
        
        if (daysUntilExpiry < 30) return 'bg-red-100 text-red-800';
        if (daysUntilExpiry < 90) return 'bg-yellow-100 text-yellow-800';
        return 'bg-green-100 text-green-800';
    };

    // Diri kuhaon ang text sa status base sa expiration.
    const getStatusText = (expirationDate) => {
        const today = new Date();
        const expiry = new Date(expirationDate);
        const daysUntilExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
        
        if (daysUntilExpiry < 0) return 'Expired';
        if (daysUntilExpiry < 30) return 'Expiring Soon';
        if (daysUntilExpiry < 90) return 'Expiring';
        return 'Good';
    };

    // Diri i-format ang quantity.
    const formatQuantity = (value) =>
        Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 });

    // Diri kwentahon ang display sa vial.
    const formatVialDisplay = (item) => {
        const quantity = Number(item?.quantity || 0);
        const volumePerVial = Number(item?.volume_ml || 0);
        const displayVials = Math.ceil(quantity);
        const totalMlRemaining = quantity * volumePerVial;

        return {
            displayVials,
            totalMlRemaining,
        };
    };
    // Diri i-check kung vial ang item.
    const isVialItem = (item) => Boolean(item?.is_vial) || String(item?.unit?.name || '').toLowerCase().includes('vial');

    if (loading) {
        return (
            <div className="flex min-h-screen bg-canvas">
                <Sidebar />
                <main className="flex-1 staff-main p-8">
                    <div className="max-w-4xl mx-auto">
                        <div className="flex items-center justify-center h-64">
                            <div className="text-gray-500">Loading...</div>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    if (!inventory) {
        return (
            <div className="flex min-h-screen bg-canvas">
                <Sidebar />
                <main className="flex-1 staff-main p-8">
                    <div className="max-w-4xl mx-auto">
                        <div className="text-center">
                            <div className="text-red-600 mb-4">Inventory item not found</div>
                            <Link
                                href="/budget/inventory"
                                className="text-violet-600 hover:text-violet-800"
                            >
                                Back to Inventory
                            </Link>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    const movementLogs = withRunningQuantities(logs, inventory);

    return (
        <div className="flex min-h-screen bg-canvas">
            <Sidebar />
            
            <main className="flex-1 staff-main p-8">
                <div className="max-w-4xl mx-auto">
                    {/* Header */}
                    <div className="mb-8">
                        <h1 className="text-2xl font-bold text-gray-900">Inventory Details</h1>
                        <p className="text-gray-500 mt-1">View detailed information about this inventory item</p>
                    </div>

                    {/* Message */}
                    {message.text && (
                        <div className={`mb-6 px-4 py-3 rounded-xl ${
                            message.type === 'success' 
                                ? 'bg-green-100 text-green-800 border border-green-200' 
                                : 'bg-red-100 text-red-800 border border-red-200'
                        }`}>
                            {message.text}
                        </div>
                    )}

                    {/* Inventory Details Card */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                        {/* Card Header */}
                        <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center">
                                    <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/>
                                    </svg>
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-gray-900">{inventory.medicine.name}</h2>
                                    <p className="text-sm text-gray-500">{inventory.medicine.category.name}</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Basic Information */}
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4 flex items-center gap-2">
                                        <span className="w-1 h-4 bg-violet-500 rounded-full"></span>
                                        Basic Information
                                    </h3>
                                    <div className="space-y-3">
                                        <div>
                                            <p className="text-sm text-gray-500">Medicine Name</p>
                                            <p className="font-medium text-gray-900">{inventory.medicine.name}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-500">Category</p>
                                            <p className="font-medium text-gray-900">{inventory.medicine.category.name}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-500">Unit</p>
                                            <p className="font-medium text-gray-900">{inventory.unit.name}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Stock Information */}
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4 flex items-center gap-2">
                                        <span className="w-1 h-4 bg-green-500 rounded-full"></span>
                                        Stock Information
                                    </h3>
                                    <div className="space-y-3">
                                        <div>
                                            <p className="text-sm text-gray-500">Quantity</p>
                                            <p className="font-medium text-gray-900">
                                                {isVialItem(inventory)
                                                    ? `${formatVialDisplay(inventory).displayVials} ${inventory.unit.name}`
                                                    : `${formatQuantity(Math.ceil(Number(inventory.quantity)))} ${inventory.unit.name}`}
                                            </p>
                                            {isVialItem(inventory) && inventory.volume_ml && (
                                                <p className="text-xs text-blue-600 mt-1">
                                                    {formatVialDisplay(inventory).totalMlRemaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ml remaining
                                                </p>
                                            )}
                                        </div>
                                        {inventory.volume_ml && (
                                            <div>
                                                <p className="text-sm text-gray-500">Volume per Unit</p>
                                                <p className="font-medium text-gray-900">{inventory.volume_ml} ml</p>
                                            </div>
                                        )}
                                        {inventory.items_per_box && (
                                            <div>
                                                <p className="text-sm text-gray-500">Items per Box</p>
                                                <p className="font-medium text-gray-900">{inventory.items_per_box} items</p>
                                            </div>
                                        )}
                                        {inventory.items_per_box && inventory.quantity && (
                                            <div>
                                                <p className="text-sm text-gray-500">Total Items</p>
                                                <p className="font-medium text-gray-900 text-lg text-violet-600">
                                                    {formatQuantity(Number(inventory.quantity) * Number(inventory.items_per_box))} items
                                                </p>
                                            </div>
                                        )}
                                        <div>
                                            <p className="text-sm text-gray-500">Status</p>
                                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(inventory.expiration_date)}`}>
                                                {getStatusText(inventory.expiration_date)}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Batch & Expiry Information */}
                                <div className="md:col-span-2">
                                    <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4 flex items-center gap-2">
                                        <span className="w-1 h-4 bg-amber-500 rounded-full"></span>
                                        Batch & Expiry Information
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {inventory.batch_number && (
                                            <div>
                                                <p className="text-sm text-gray-500">Batch Number</p>
                                                <p className="font-medium text-gray-900 font-mono text-sm">{inventory.batch_number}</p>
                                            </div>
                                        )}
                                        <div>
                                            <p className="text-sm text-gray-500">Expiration Date</p>
                                            <p className="font-medium text-gray-900">
                                                {new Date(inventory.expiration_date).toLocaleDateString('en-US', {
                                                    year: 'numeric',
                                                    month: 'long',
                                                    day: 'numeric'
                                                })}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Card Footer */}
                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
                            <Link
                                href="/budget/inventory"
                                className="px-5 py-2.5 text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all font-medium"
                            >
                                Back to Inventory
                            </Link>
                            <button
                                type="button"
                                onClick={() => setShowStockOut(true)}
                                disabled={Number(inventory.quantity) <= 0}
                                className="px-5 py-2.5 bg-violet-600 text-white rounded-xl hover:bg-violet-700 transition-all font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Stock Out
                            </button>
                        </div>
                    </div>

                    {/* Stock Movements (In / Out) */}
                    <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50">
                            <h2 className="text-lg font-semibold text-gray-900">Stock Movements (In / Out)</h2>
                        </div>
                        {logs.length === 0 ? (
                            <p className="p-6 text-sm text-gray-500">No stock movements recorded for this batch yet.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="border-b border-gray-200 bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Type</th>
                                            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Reason</th>
                                            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Recent quantity</th>
                                            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Quantity</th>
                                            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Quantity left</th>
                                            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Used For</th>
                                            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Date &amp; Time</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {movementLogs.map((log) => (
                                            <tr key={log.id}>
                                                <td className="px-6 py-3">
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
                                                <td className="px-6 py-3">
                                                    <span
                                                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                                            REASON_BADGES[log.reason] || 'bg-gray-100 text-gray-700'
                                                        }`}
                                                    >
                                                        {REASON_LABELS[log.reason] || log.reason}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-3 text-slate-700">
                                                    <QuantityBreakdown qty={log.qty_before ?? 0} inventory={inventory} />
                                                </td>
                                                <td className={`px-6 py-3 font-semibold ${log.type === 'IN' ? 'text-emerald-600' : 'text-red-600'}`}>
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
                                                <td className="px-6 py-3 font-semibold text-slate-900">
                                                    <QuantityBreakdown qty={log.qty_after ?? 0} inventory={inventory} />
                                                </td>
                                                <td className="px-6 py-3 text-gray-700">
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
                                                    ) : log.type === 'IN' || log.reason === 'stock_in' ? (
                                                        <span className="font-medium text-slate-800">Restocked</span>
                                                    ) : log.type === 'OUT' &&
                                                      (log.reason === 'used' ||
                                                          log.reason === 'damaged' ||
                                                          log.reason === 'expired') ? (
                                                        <span className="text-gray-400">Manual stock out</span>
                                                    ) : (
                                                        <span className="text-gray-400">&mdash;</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-3 text-gray-700">
                                                    {log.date} {log.time}
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
                                        {formatQuantity(inventory.quantity)} {inventory.unit?.name || 'units'} will be
                                        removed because this batch is expired.
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
