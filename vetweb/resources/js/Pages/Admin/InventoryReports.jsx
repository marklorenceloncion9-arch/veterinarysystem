import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/Components/Budget/BudgetSidebar';
import Tabs from '@/Components/Ui/Tabs';

const REASON_LABELS = {
    used: 'Used',
    damaged: 'Damaged',
    expired: 'Expired',
};

const REASON_BADGES = {
    used: 'bg-blue-100 text-blue-700',
    damaged: 'bg-orange-100 text-orange-700',
    expired: 'bg-red-100 text-red-700',
};

// Diri ang page sa inventory reports.
export default function InventoryReports() {
    const [tab, setTab] = useState('out');
    const [rows, setRows] = useState([]);
    const [summary, setSummary] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');

    // Diri kuhaon ang report base sa tab ug petsa.
    const fetchReport = async (activeTab = tab, from = fromDate, to = toDate) => {
        setLoading(true);
        setError('');

        try {
            const params = new URLSearchParams();
            if (from) params.append('from', from);
            if (to) params.append('to', to);

            const endpoint = activeTab === 'in' ? '/api/budget/reports/stock-in' : '/api/budget/reports/usage';
            const response = await fetch(`${endpoint}?${params.toString()}`);
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.message || 'Failed to fetch report');
            }

            setRows(data.report || []);
            setSummary(data.summary || {});
        } catch (err) {
            setError(err.message || 'Failed to fetch report');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReport();
    }, []);

    // Diri ilisan ang tab sa report.
    const switchTab = (nextTab) => {
        if (nextTab === tab) return;
        setTab(nextTab);
        setRows([]);
        setSummary({});
        fetchReport(nextTab);
    };

    const canApplyFilter = useMemo(() => fromDate || toDate, [fromDate, toDate]);

    // Diri i-format ang numero nga walay sobra nga zero.
    const formatNumber = (num) => Number(num).toFixed(3).replace(/\.?0+$/, '');

    // Diri i-format ang petsa ug oras sa row.
    const formatDateTime = (row) => {
        if (row.created_at) {
            const dt = new Date(row.created_at);
            if (!Number.isNaN(dt.getTime())) {
                return dt.toLocaleString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                });
            }
        }

        if (row.date || row.time) {
            return `${row.date || ''} ${row.time || ''}`.trim();
        }

        return '-';
    };

    const unitBreakdown = useMemo(() => {
        if (tab !== 'out') return null;
        return rows.reduce(
            (acc, row) => {
                const unit = String(row.unit || '').toLowerCase();
                const isBoxItem = row.is_box_item ?? false;

                if (unit.includes('vial')) {
                    acc.vials += Number(row.used_qty ?? 0);
                } else if (isBoxItem || unit.includes('box') || unit === 'items') {
                    acc.boxes += Number(row.used_qty ?? 0);
                } else if (unit.includes('tablet')) {
                    acc.tablets += Number(row.used_qty ?? 0);
                } else if (unit.includes('capsule')) {
                    acc.capsules += Number(row.used_qty ?? 0);
                } else {
                    acc.otherUnits += Number(row.used_qty ?? 0);
                }

                return acc;
            },
            { vials: 0, boxes: 0, tablets: 0, capsules: 0, otherUnits: 0 }
        );
    }, [rows, tab]);

    return (
        <div className="flex min-h-screen bg-canvas">
            <Sidebar />

            <main className="flex-1 staff-main p-8">
                <div className="max-w-7xl mx-auto">
                    <div className="mb-6">
                        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Inventory In &amp; Out Report</h1>
                        <p className="text-gray-500 mt-2">Track stock received (In) and stock used, damaged or expired (Out)</p>
                    </div>

                    <div className="mb-6">
                        <Tabs
                            value={tab}
                            onChange={switchTab}
                            variant="segmented"
                            items={[
                                { id: 'out', label: 'Stock Out' },
                                { id: 'in', label: 'Stock In' },
                            ]}
                        />
                    </div>

                    {error && (
                        <div className="mb-6 px-4 py-3 rounded-xl bg-red-100 text-red-800 border border-red-200 shadow-sm">
                            {error}
                        </div>
                    )}

                    {tab === 'out' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                            <div className="bg-white/90 backdrop-blur rounded-2xl border border-gray-200 p-5 shadow-sm">
                                <p className="text-xs uppercase tracking-wide text-gray-500">Total Transactions</p>
                                <p className="text-3xl font-bold text-gray-900 mt-2">{summary.total_transactions ?? 0}</p>
                            </div>
                            <div className="bg-white/90 backdrop-blur rounded-2xl border border-gray-200 p-5 shadow-sm">
                                <p className="text-xs uppercase tracking-wide text-gray-500">Used</p>
                                <p className="text-3xl font-bold text-blue-600 mt-2">{summary.used_count ?? 0}</p>
                            </div>
                            <div className="bg-white/90 backdrop-blur rounded-2xl border border-gray-200 p-5 shadow-sm">
                                <p className="text-xs uppercase tracking-wide text-gray-500">Damaged</p>
                                <p className="text-3xl font-bold text-orange-600 mt-2">{summary.damaged_count ?? 0}</p>
                            </div>
                            <div className="bg-white/90 backdrop-blur rounded-2xl border border-gray-200 p-5 shadow-sm">
                                <p className="text-xs uppercase tracking-wide text-gray-500">Expired</p>
                                <p className="text-3xl font-bold text-red-600 mt-2">{summary.expired_count ?? 0}</p>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            <div className="bg-white/90 backdrop-blur rounded-2xl border border-gray-200 p-5 shadow-sm">
                                <p className="text-xs uppercase tracking-wide text-gray-500">Total Stock-Ins</p>
                                <p className="text-3xl font-bold text-gray-900 mt-2">{summary.total_transactions ?? 0}</p>
                            </div>
                            <div className="bg-white/90 backdrop-blur rounded-2xl border border-gray-200 p-5 shadow-sm">
                                <p className="text-xs uppercase tracking-wide text-gray-500">Quantity Received</p>
                                <p className="text-3xl font-bold text-emerald-600 mt-2">{formatNumber(summary.total_items_in ?? 0)}</p>
                            </div>
                        </div>
                    )}

                    {tab === 'out' && unitBreakdown && (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                            <div className="bg-white/90 backdrop-blur rounded-2xl border border-gray-200 p-5 shadow-sm">
                                <p className="text-xs uppercase tracking-wide text-gray-500">Vials Out</p>
                                <p className="text-3xl font-bold text-gray-900 mt-2">
                                    {formatNumber(unitBreakdown.vials)} <span className="text-lg text-gray-500">ml</span>
                                </p>
                            </div>
                            <div className="bg-white/90 backdrop-blur rounded-2xl border border-gray-200 p-5 shadow-sm">
                                <p className="text-xs uppercase tracking-wide text-gray-500">Items Out by Boxes</p>
                                <p className="text-3xl font-bold text-gray-900 mt-2">{formatNumber(unitBreakdown.boxes)}</p>
                            </div>
                            <div className="bg-white/90 backdrop-blur rounded-2xl border border-gray-200 p-5 shadow-sm">
                                <p className="text-xs uppercase tracking-wide text-gray-500">Tablets Out</p>
                                <p className="text-3xl font-bold text-gray-900 mt-2">{formatNumber(unitBreakdown.tablets)}</p>
                            </div>
                            <div className="bg-white/90 backdrop-blur rounded-2xl border border-gray-200 p-5 shadow-sm">
                                <p className="text-xs uppercase tracking-wide text-gray-500">Capsules Out</p>
                                <p className="text-3xl font-bold text-gray-900 mt-2">{formatNumber(unitBreakdown.capsules)}</p>
                            </div>
                        </div>
                    )}

                    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                        <div className="p-5 border-b border-gray-200 bg-gray-50/70 flex flex-wrap items-end gap-3">
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">From</label>
                                <input
                                    type="date"
                                    value={fromDate}
                                    onChange={(e) => setFromDate(e.target.value)}
                                    className="px-3 py-2.5 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">To</label>
                                <input
                                    type="date"
                                    value={toDate}
                                    onChange={(e) => setToDate(e.target.value)}
                                    className="px-3 py-2.5 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => fetchReport()}
                                className="px-4 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 transition-colors shadow-sm"
                            >
                                Apply
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setFromDate('');
                                    setToDate('');
                                    fetchReport(tab, '', '');
                                }}
                                disabled={!canApplyFilter}
                                className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors"
                            >
                                Clear
                            </button>
                        </div>

                        {loading ? (
                            <div className="p-12 text-center">
                                <div className="animate-spin w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full mx-auto mb-4" />
                                <p className="text-gray-500">Loading report...</p>
                            </div>
                        ) : rows.length === 0 ? (
                            <div className="p-12 text-center text-gray-500">
                                No {tab === 'in' ? 'stock-in' : 'stock-out'} records found for the selected period.
                            </div>
                        ) : (
                            <div
                                className="overflow-x-auto overflow-y-auto max-h-[65vh] [&::-webkit-scrollbar]:hidden"
                                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                            >
                                {tab === 'out' ? (
                                    <table className="w-full">
                                        <thead className="bg-gray-50 border-b border-gray-200">
                                            <tr>
                                                <th className="sticky top-0 z-10 bg-gray-50 px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Medicine</th>
                                                <th className="sticky top-0 z-10 bg-gray-50 px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                                                <th className="sticky top-0 z-10 bg-gray-50 px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Qty Out</th>
                                                <th className="sticky top-0 z-10 bg-gray-50 px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Reason</th>
                                                <th className="sticky top-0 z-10 bg-gray-50 px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Used For</th>
                                                <th className="sticky top-0 z-10 bg-gray-50 px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date &amp; Time</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {rows.map((row) => (
                                                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                                                    <td className="px-6 py-4 font-medium text-gray-900">{row.medicine_name}</td>
                                                    <td className="px-6 py-4 text-gray-700">
                                                        <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                                                            {row.category}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 font-semibold text-red-600">
                                                        {'\u2212'}
                                                        {String(row.unit || '').toLowerCase().includes('vial') && row.used_ml != null
                                                            ? `${formatNumber(row.used_ml || 0)} ml`
                                                            : `${formatNumber(row.used_qty || 0)} ${row.unit}`}
                                                        {String(row.unit || '').toLowerCase().includes('vial') && row.used_ml != null && (
                                                            <span className="ml-1 font-normal text-gray-500">
                                                                ({formatNumber(row.used_qty || 0)} {Number(row.used_qty) === 1 ? 'vial' : 'vials'})
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span
                                                            className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                                                                REASON_BADGES[row.reason] || 'bg-gray-100 text-gray-700'
                                                            }`}
                                                        >
                                                            {REASON_LABELS[row.reason] || row.reason || 'Used'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-gray-700">
                                                        {row.used_for ? (
                                                            <div>
                                                                <p className="font-medium text-gray-900">
                                                                    {row.used_for.pet_name}
                                                                    <span className="ml-1.5 text-xs font-normal text-gray-500">
                                                                        ({row.used_for.booking_type})
                                                                    </span>
                                                                </p>
                                                                <p className="mt-0.5 text-xs text-gray-500">
                                                                    {row.used_for.service} &middot; {row.used_for.owner_name}
                                                                </p>
                                                            </div>
                                                        ) : row.reason === 'used' ||
                                                          row.reason === 'damaged' ||
                                                          row.reason === 'expired' ? (
                                                            <span className="text-gray-400">Manual stock out</span>
                                                        ) : (
                                                            <span className="text-gray-400">&mdash;</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-gray-700">{formatDateTime(row)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <table className="w-full">
                                        <thead className="bg-gray-50 border-b border-gray-200">
                                            <tr>
                                                <th className="sticky top-0 z-10 bg-gray-50 px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Medicine</th>
                                                <th className="sticky top-0 z-10 bg-gray-50 px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                                                <th className="sticky top-0 z-10 bg-gray-50 px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Batch</th>
                                                <th className="sticky top-0 z-10 bg-gray-50 px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Qty In</th>
                                                <th className="sticky top-0 z-10 bg-gray-50 px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Reason</th>
                                                <th className="sticky top-0 z-10 bg-gray-50 px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Expires</th>
                                                <th className="sticky top-0 z-10 bg-gray-50 px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date &amp; Time</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {rows.map((row) => (
                                                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                                                    <td className="px-6 py-4 font-medium text-gray-900">{row.medicine_name}</td>
                                                    <td className="px-6 py-4 text-gray-700">
                                                        <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                                                            {row.category}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-gray-700 font-mono text-xs">{row.batch_number || '-'}</td>
                                                    <td className="px-6 py-4 font-semibold text-emerald-600">
                                                        +{formatNumber(row.qty || 0)} {row.unit}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                                                            Receiving
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-gray-700">{row.expiration_date || '-'}</td>
                                                    <td className="px-6 py-4 text-gray-700">{formatDateTime(row)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
