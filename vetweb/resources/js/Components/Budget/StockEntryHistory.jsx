import { useEffect, useMemo, useState } from 'react';
import { router } from '@inertiajs/react';

const KIND_LABELS = {
    new: 'New item',
    receiving: 'Receiving',
};

const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100';

// Diri i-format ang petsa sa expiration.
function formatExpiry(value) {
    if (!value) return '—';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Diri i-format ang petsa ug oras sa entry.
function formatWhen(row) {
    if (row.created_at) {
        const date = new Date(String(row.created_at).replace(' ', 'T'));
        if (!Number.isNaN(date.getTime())) {
            return date.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
            });
        }
    }

    return [row.date, row.time].filter(Boolean).join(' ') || '—';
}

// Diri i-format ang quantity nga nadawat.
function formatQty(row) {
    const qty = Number(row.qty || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
    const unit = row.unit || 'units';
    let extra = '';

    if (row.total_items != null) {
        extra = ` · ${Number(row.total_items).toLocaleString()} items`;
    } else if (row.total_ml != null) {
        extra = ` · ${Number(row.total_ml).toLocaleString()} ml`;
    }

    return `+${qty} ${unit}${extra}`;
}

// Diri ang history sa new item ug receiving, naay filter ug date picker.
export default function StockEntryHistory({
    initialSearch = '',
    currentInventoryId = null,
    reloadToken = 0,
    fill = false,
}) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [kind, setKind] = useState('all');
    const [search, setSearch] = useState(initialSearch || '');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');

    useEffect(() => {
        setSearch(initialSearch || '');
    }, [initialSearch]);

    const dateError = fromDate && toDate && fromDate > toDate ? 'The from date must be on or before the to date.' : '';

    useEffect(() => {
        const controller = new AbortController();

        setLoading(true);
        setError('');

        fetch('/api/budget/inventory/history', { signal: controller.signal })
            .then(async (response) => {
                const data = await response.json();
                if (!response.ok || !data.success) {
                    throw new Error(data.message || 'Failed to load history');
                }
                setRows(data.history || []);
            })
            .catch((err) => {
                if (err.name === 'AbortError') return;
                setRows([]);
                setError(err.message || 'Failed to load history');
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });

        return () => controller.abort();
    }, [reloadToken]);

    const scopedRows = useMemo(() => {
        const term = search.trim().toLowerCase();

        return rows.filter((row) => {
            if (!dateError && fromDate && row.date && row.date < fromDate) return false;
            if (!dateError && toDate && row.date && row.date > toDate) return false;
            if (!term) return true;

            const haystack = [row.medicine_name, row.category, row.batch_number, row.batch_label]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            return haystack.includes(term);
        });
    }, [rows, search, fromDate, toDate, dateError]);

    const visibleRows = useMemo(() => {
        if (kind === 'all') return scopedRows;
        return scopedRows.filter((row) => row.kind === kind);
    }, [scopedRows, kind]);

    const summary = useMemo(
        () => ({
            total: scopedRows.length,
            new_count: scopedRows.filter((row) => row.kind === 'new').length,
            receiving_count: scopedRows.filter((row) => row.kind === 'receiving').length,
        }),
        [scopedRows]
    );

    const filtersActive = kind !== 'all' || search.trim() !== '' || fromDate !== '' || toDate !== '';

    const clearFilters = () => {
        setKind('all');
        setSearch('');
        setFromDate('');
        setToDate('');
    };

    const filters = [
        { id: 'all', label: 'All', count: summary.total },
        { id: 'new', label: 'New item', count: summary.new_count },
        { id: 'receiving', label: 'Receiving', count: summary.receiving_count },
    ];

    return (
        <section
            id="stock-entry-history"
            className={`rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${
                fill ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : ''
            }`}
        >
            <div className="shrink-0 border-b border-slate-100 px-5 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    {!fill && (
                        <div>
                            <h2 className="text-sm font-semibold text-slate-900">History</h2>
                            <p className="mt-1 text-xs leading-relaxed text-slate-500">
                                Every new item and receiving entry. Filter by type, search, or date.
                            </p>
                        </div>
                    )}
                    <div className="inline-flex w-fit flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
                        {filters.map((filter) => {
                            const active = kind === filter.id;
                            return (
                                <button
                                    key={filter.id}
                                    type="button"
                                    onClick={() => setKind(filter.id)}
                                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                                        active
                                            ? 'bg-white text-slate-900 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    {filter.label}
                                    <span className={`tabular-nums ${active ? 'text-violet-700' : 'text-slate-400'}`}>
                                        {filter.count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_180px_180px_auto]">
                    <div>
                        <label htmlFor="stock-history-search" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                            Search
                        </label>
                        <input
                            id="stock-history-search"
                            type="text"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') event.preventDefault();
                            }}
                            placeholder="Item, category, or batch"
                            className={inputClass}
                        />
                    </div>
                    <div>
                        <label htmlFor="stock-history-from" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                            From
                        </label>
                        <input
                            id="stock-history-from"
                            type="date"
                            value={fromDate}
                            max={toDate || undefined}
                            onChange={(event) => setFromDate(event.target.value)}
                            className={inputClass}
                        />
                    </div>
                    <div>
                        <label htmlFor="stock-history-to" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                            To
                        </label>
                        <input
                            id="stock-history-to"
                            type="date"
                            value={toDate}
                            min={fromDate || undefined}
                            onChange={(event) => setToDate(event.target.value)}
                            className={inputClass}
                        />
                    </div>
                    <div className="flex items-end">
                        <button
                            type="button"
                            onClick={clearFilters}
                            disabled={!filtersActive}
                            className="h-[42px] rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            Clear
                        </button>
                    </div>
                </div>
                {dateError && <p className="mt-2 text-xs text-red-600">{dateError}</p>}
            </div>

            {loading ? (
                <div className={`flex items-center justify-center gap-3 px-5 py-12 ${fill ? 'min-h-0 flex-1' : ''}`}>
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
                    <p className="text-sm text-slate-500">Loading history...</p>
                </div>
            ) : error ? (
                <p className="px-5 py-10 text-center text-sm text-red-600">{error}</p>
            ) : visibleRows.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-slate-500">
                    {search.trim()
                        ? 'No entries match this search. Clear the search to see every entry.'
                        : filtersActive
                          ? 'No new items or receiving match these filters.'
                          : 'No new items or receiving have been recorded yet.'}
                </p>
            ) : (
                <div className={fill ? 'min-h-[16rem] flex-1 overflow-auto' : 'max-h-[28rem] overflow-auto'}>
                    <table className="w-full min-w-[760px] text-left text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                                <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Type</th>
                                <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Item</th>
                                <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Quantity</th>
                                <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Expires</th>
                                <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Batch</th>
                                <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Date &amp; time</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {visibleRows.map((row) => {
                                const current = currentInventoryId && Number(row.inventory_id) === Number(currentInventoryId);
                                const openable = Boolean(row.inventory_id);

                                return (
                                    <tr
                                        key={row.id}
                                        onClick={() => {
                                            if (openable && !current) {
                                                router.visit(`/budget/inventory/${row.inventory_id}`);
                                            }
                                        }}
                                        className={`${current ? 'bg-violet-50/70' : 'bg-white'} ${
                                            openable && !current ? 'cursor-pointer hover:bg-violet-50/40' : ''
                                        }`}
                                    >
                                        <td className="px-4 py-3">
                                            <span
                                                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                                    row.kind === 'new'
                                                        ? 'bg-violet-50 text-violet-700 ring-1 ring-violet-200'
                                                        : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                                }`}
                                            >
                                                {KIND_LABELS[row.kind] || 'Receiving'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="font-medium text-slate-900">{row.medicine_name}</p>
                                            <p className="mt-0.5 text-xs text-slate-500">{row.category}</p>
                                        </td>
                                        <td className="px-4 py-3 font-semibold tabular-nums text-emerald-700">
                                            {formatQty(row)}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                                            {formatExpiry(row.expiration_date)}
                                        </td>
                                        <td className="px-4 py-3 text-slate-700">
                                            <p>{row.batch_label || '—'}</p>
                                            {current && <p className="mt-0.5 text-xs font-medium text-violet-700">This batch</p>}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatWhen(row)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
