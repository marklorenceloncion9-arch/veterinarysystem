import { useEffect, useMemo, useState } from 'react';
import BudgetSidebar from '@/Components/Budget/BudgetSidebar';
import AdminSidebar from '@/Components/Admin/Sidebar';

const REASON_LABELS = {
    used: 'Used',
    damaged: 'Damaged',
    expired: 'Expired',
    outside: 'Outside clinic',
    stock_in: 'Receiving',
    receiving: 'Receiving',
};

const REASON_BADGES = {
    used: 'bg-sky-50 text-sky-800 ring-sky-200/80',
    damaged: 'bg-amber-50 text-amber-800 ring-amber-200/80',
    expired: 'bg-red-50 text-red-800 ring-red-200/80',
    outside: 'bg-violet-50 text-violet-800 ring-violet-200/80',
    stock_in: 'bg-emerald-50 text-emerald-800 ring-emerald-200/80',
    receiving: 'bg-emerald-50 text-emerald-800 ring-emerald-200/80',
};

// Diri himuon Title Case ang text.
function toTitleCase(value) {
    if (!value || typeof value !== 'string') return value || '';
    return value
        .trim()
        .split(/\s+/)
        .map((word) => {
            if (!word) return word;
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(' ');
}

// Diri kuhaon ang ngalan nga naka-Title Case o fallback.
function displayName(value, fallback = '—') {
    const formatted = toTitleCase(value);
    return formatted || fallback;
}

// Diri i-check kung mo-match sa metric ang row.
function rowMatchesMetric(row, metric) {
    if (!metric || metric === 'all') return true;

    const unit = String(row.unit || '').toLowerCase();
    const isBoxItem = row.is_box_item ?? false;

    if (metric === 'used') return row.reason === 'used';
    if (metric === 'damaged') return row.reason === 'damaged';
    if (metric === 'expired') return row.reason === 'expired';
    if (metric === 'outside') return row.reason === 'outside';
    if (metric === 'vials') return unit.includes('vial');
    if (metric === 'boxes') return isBoxItem || unit.includes('box') || unit === 'items';
    if (metric === 'tablets') return unit.includes('tablet');
    if (metric === 'capsules') return unit.includes('capsule');

    return true;
}

// Diri ihapon ang breakdown base sa unit.
function computeUnitBreakdown(sourceRows) {
    return sourceRows.reduce(
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
}

// Diri himuon ang summary sa paggamit.
function computeUsageSummary(sourceRows) {
    return {
        total_transactions: sourceRows.length,
        used_count: sourceRows.filter((row) => row.reason === 'used').length,
        damaged_count: sourceRows.filter((row) => row.reason === 'damaged').length,
        expired_count: sourceRows.filter((row) => row.reason === 'expired').length,
        outside_count: sourceRows.filter((row) => row.reason === 'outside').length,
    };
}

// Diri ihapon ang mga wala pa nabasa.
function computeUnreadCounts(sourceRows) {
    const unread = sourceRows.filter((row) => !row.is_read);
    return {
        unread_used_count: unread.filter((row) => row.reason === 'used').length,
        unread_damaged_count: unread.filter((row) => row.reason === 'damaged').length,
        unread_expired_count: unread.filter((row) => row.reason === 'expired').length,
        unread_total: unread.length,
    };
}

// Diri ang card sa stat sa report.
function StatCard({
    label,
    hint,
    value,
    accent,
    valueClass = 'text-slate-900',
    suffix,
    selected = false,
    onClick,
    unreadCount = 0,
    onUnreadClick,
}) {
    const interactive = typeof onClick === 'function';

    const className = `relative rounded-md border border-l-[3px] bg-white px-3 py-2 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors ${accent} ${
        selected
            ? 'border-slate-400 bg-slate-50 ring-2 ring-slate-900/10'
            : 'border-slate-200/80'
    } ${interactive ? 'cursor-pointer hover:border-slate-300 hover:bg-slate-50/80' : ''}`;

    return (
        <div
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-pressed={interactive ? selected : undefined}
            onClick={interactive ? onClick : undefined}
            onKeyDown={
                interactive
                    ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              onClick?.(event);
                          }
                      }
                    : undefined
            }
            className={className}
        >
            <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">{label}</p>
                {unreadCount > 0 ? (
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            onUnreadClick?.(event);
                        }}
                        className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-sm ring-2 ring-white transition hover:bg-red-700"
                        title={`${unreadCount} unread`}
                        aria-label={`${unreadCount} unread ${label} transactions`}
                    >
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </button>
                ) : null}
            </div>
            <p className={`mt-0.5 text-lg font-semibold tracking-tight tabular-nums leading-tight ${valueClass}`}>
                {value}
                {suffix ? <span className="ml-1 text-xs font-medium text-slate-400">{suffix}</span> : null}
            </p>
            {hint ? <p className="mt-0.5 text-[11px] leading-tight text-slate-400">{hint}</p> : null}
        </div>
    );
}

// Diri ang badge nga NEW.
function NewBadge({ onClick }) {
    return (
        <button
            type="button"
            onClick={(event) => {
                event.stopPropagation();
                onClick?.(event);
            }}
            className="ml-1.5 inline-flex shrink-0 items-center rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-red-700 print:hidden"
            title="Mark as read"
            aria-label="New unread transaction"
        >
            New
        </button>
    );
}

// Diri ang badge sa category.
function CategoryBadge({ label }) {
    return (
        <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
            {label || '—'}
        </span>
    );
}

// Diri ang badge sa rason.
function ReasonBadge({ reason }) {
    return (
        <span
            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                REASON_BADGES[reason] || 'bg-slate-100 text-slate-700 ring-slate-200/80'
            }`}
        >
            {REASON_LABELS[reason] || reason || 'Used'}
        </span>
    );
}

// Diri ang tab button nga naay unread count.
function TabButton({ active, onClick, children, unreadCount = 0, onUnreadClick }) {
    return (
        <div className="relative inline-flex">
            <button
                type="button"
                onClick={onClick}
                className={`inline-flex min-h-11 items-center rounded-md px-4 py-2 text-[15px] font-semibold leading-snug transition-colors ${
                    active
                        ? 'bg-white text-navy shadow-sm'
                        : 'text-muted hover:bg-white/80 hover:text-navy'
                }`}
            >
                {children}
            </button>
            {unreadCount > 0 ? (
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        onUnreadClick?.(event);
                    }}
                    className="absolute -right-1 -top-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-danger px-1.5 py-0.5 text-[11px] font-bold leading-none text-white shadow-sm ring-2 ring-white transition hover:bg-red-700"
                    title={`${unreadCount} unread`}
                    aria-label={`${unreadCount} unread`}
                >
                    {unreadCount > 99 ? '99+' : unreadCount}
                </button>
            ) : null}
        </div>
    );
}

// Diri ang page sa budget reports.
export default function BudgetReports({ sidebar = 'budget' }) {
    const Sidebar = sidebar === 'admin' ? AdminSidebar : BudgetSidebar;
    const [tab, setTab] = useState('out');
    const [rows, setRows] = useState([]);
    const [summary, setSummary] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [selectedMetric, setSelectedMetric] = useState(null);
    const [unreadOnly, setUnreadOnly] = useState(false);
    const [highlightedId, setHighlightedId] = useState(null);
    const [categories, setCategories] = useState([]);

    // Diri kuhaon ang mga category.
    const fetchCategories = async () => {
        try {
            const response = await fetch('/api/budget/categories');
            const data = await response.json();
            if (data.success) {
                setCategories(data.categories || []);
            }
        } catch (err) {
            console.error('Failed to fetch categories:', err);
        }
    };

    // Diri kuhaon ang report base sa tab ug petsa.
    const fetchReport = async (activeTab = tab, from = fromDate, to = toDate) => {
        setLoading(true);
        setError('');

        try {
            const params = new URLSearchParams();
            if (from) params.append('from', from);
            if (to) params.append('to', to);

            const endpoint =
                activeTab === 'in'
                    ? '/api/budget/reports/stock-in'
                    : '/api/budget/reports/usage';
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
        fetchCategories();
    }, []);

    // Diri ilisan ang tab sa report.
    const switchTab = (nextTab) => {
        if (nextTab === tab) return;
        setTab(nextTab);
        setRows([]);
        setSummary({});
        setSelectedCategory('all');
        setSelectedMetric(null);
        setUnreadOnly(false);
        setHighlightedId(null);
        fetchReport(nextTab);
    };

    // Diri himuon ang headers nga naay CSRF.
    const csrfHeaders = () => ({
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN':
            document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
        Accept: 'application/json',
    });

    // Diri i-mark nga nabasa na ang transaction.
    const markTransactionRead = async (rowId) => {
        try {
            const response = await fetch(`/api/budget/reports/logs/${rowId}/read`, {
                method: 'POST',
                headers: csrfHeaders(),
            });
            const data = await response.json();
            if (!data.success) {
                throw new Error(data.message || 'Failed to mark as read');
            }
            return data;
        } catch (err) {
            console.error('Failed to mark transaction as read:', err);
            return null;
        }
    };

    // Diri i-mark nga nabasa ang tibuok category.
    const markCategoryAsRead = async ({ type, reason = null }) => {
        // Optimistic UI: clear NEW badges immediately for the matching group.
        const viewedAt = new Date().toISOString();
        setRows((prev) =>
            prev.map((item) => {
                if (item.is_read) return item;
                if (reason && item.reason !== reason) return item;
                return { ...item, is_read: true, viewed_at: viewedAt };
            })
        );
        setUnreadOnly(false);

        try {
            const response = await fetch('/api/budget/reports/logs/read', {
                method: 'POST',
                headers: csrfHeaders(),
                body: JSON.stringify({
                    type,
                    ...(reason ? { reason } : {}),
                }),
            });
            const data = await response.json();
            if (!data.success) {
                throw new Error(data.message || 'Failed to mark transactions as read');
            }

            const serverViewedAt = data.viewed_at || viewedAt;
            const idSet = new Set((data.ids || []).map((id) => Number(id)));

            if (idSet.size > 0) {
                setRows((prev) =>
                    prev.map((item) =>
                        idSet.has(Number(item.id))
                            ? { ...item, is_read: true, viewed_at: serverViewedAt }
                            : item
                    )
                );
            }

            return data;
        } catch (err) {
            console.error('Failed to mark category as read:', err);
            return null;
        }
    };

    // Diri i-mark nga nabasa ang mga row base sa ID.
    const markRowsAsReadByIds = async (ids) => {
        const uniqueIds = [...new Set(ids.map((id) => Number(id)).filter(Boolean))];
        if (uniqueIds.length === 0) return;

        const viewedAt = new Date().toISOString();
        setRows((prev) =>
            prev.map((item) =>
                uniqueIds.includes(Number(item.id))
                    ? { ...item, is_read: true, viewed_at: viewedAt }
                    : item
            )
        );

        await Promise.all(
            uniqueIds.map((id) =>
                fetch(`/api/budget/reports/logs/${id}/read`, {
                    method: 'POST',
                    headers: csrfHeaders(),
                }).catch(() => null)
            )
        );
    };

    // Diri ablihan ang box sa category.
    const openCategoryBox = async (metric = null) => {
        const previousMetric = selectedMetric;
        setUnreadOnly(false);

        if (metric === 'outside') {
            setSelectedMetric(metric);
            return;
        }

        // Leaving a reason box for another box also clears that previous group's NEW badges.
        if (
            previousMetric &&
            previousMetric !== metric &&
            ['used', 'damaged', 'expired'].includes(previousMetric)
        ) {
            await markCategoryAsRead({ type: 'out', reason: previousMetric });
        }

        setSelectedMetric(metric);
        await markCategoryAsRead({ type: 'out', reason: metric });
    };

    // Diri ablihan ang box sa unit.
    const openUnitBox = async (metric) => {
        const previousMetric = selectedMetric;
        setUnreadOnly(false);

        if (
            previousMetric &&
            previousMetric !== metric &&
            ['used', 'damaged', 'expired'].includes(previousMetric)
        ) {
            await markCategoryAsRead({ type: 'out', reason: previousMetric });
        }

        setSelectedMetric((current) => (current === metric ? null : metric));

        const sourceRows =
            selectedCategory === 'all'
                ? rows
                : rows.filter((row) => (row.category || 'Uncategorized') === selectedCategory);

        const matchingUnreadIds = sourceRows
            .filter((row) => !row.is_read && rowMatchesMetric(row, metric))
            .map((row) => row.id);

        await markRowsAsReadByIds(matchingUnreadIds);
    };

    // Diri ablihan ug i-highlight ang transaction.
    const openTransaction = async (row) => {
        if (!row?.id) return;

        setHighlightedId(row.id);

        requestAnimationFrame(() => {
            const el = document.getElementById(`inventory-log-${row.id}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });

        if (row.is_read) return;

        const result = await markTransactionRead(row.id);
        if (!result) return;

        setRows((prev) =>
            prev.map((item) =>
                item.id === row.id
                    ? {
                          ...item,
                          is_read: true,
                          viewed_at: result.viewed_at || new Date().toISOString(),
                      }
                    : item
            )
        );
    };

    const canApplyFilter = useMemo(() => fromDate || toDate, [fromDate, toDate]);

    // Diri i-format ang numero nga walay sobra nga zero.
    const formatNumber = (num) => Number(num).toFixed(3).replace(/\.?0+$/, '');

    // Diri i-format ang petsa ug oras sa row.
    const formatDateTime = (row) => {
        if (row.created_at) {
            const dt = new Date(row.created_at);
            if (!Number.isNaN(dt.getTime())) {
                return dt.toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                });
            }
        }

        if (row.date || row.time) {
            return `${row.date || ''} ${row.time || ''}`.trim();
        }

        return '—';
    };

    const tabRows = useMemo(() => {
        if (tab === 'outside') {
            return rows.filter((row) => row.reason === 'outside');
        }
        if (tab === 'out') {
            return rows.filter((row) => row.reason !== 'outside');
        }
        return rows;
    }, [rows, tab]);

    const categoryFilteredRows = useMemo(() => {
        if (selectedCategory === 'all') return tabRows;
        return tabRows.filter((row) => (row.category || 'Uncategorized') === selectedCategory);
    }, [tabRows, selectedCategory]);

    const displayRows = useMemo(() => {
        let next = categoryFilteredRows;

        if (tab === 'out' && selectedMetric) {
            next = next.filter((row) => rowMatchesMetric(row, selectedMetric));
        }

        if (unreadOnly) {
            next = next.filter((row) => !row.is_read);
        }

        const query = searchTerm.trim().toLowerCase();
        if (query) {
            next = next.filter((row) => {
                const haystack = [
                    row.medicine_name,
                    row.category,
                    row.reason,
                    REASON_LABELS[row.reason],
                    row.unit,
                    row.batch_label,
                    row.batch_number,
                    row.expiration_date,
                    row.date,
                    row.time,
                    row.used_for?.pet_name,
                    row.used_for?.owner_name,
                    row.used_for?.service,
                    row.used_for?.booking_type,
                    row.used_for?.administered_by,
                    row.administered_by,
                    row.status,
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();

                return haystack.includes(query);
            });
        }

        return next;
    }, [categoryFilteredRows, selectedMetric, tab, unreadOnly, searchTerm]);

    const displaySummary = useMemo(() => {
        if (tab === 'out' || tab === 'outside') {
            return computeUsageSummary(categoryFilteredRows);
        }

        if (selectedCategory === 'all') {
            return summary;
        }

        return {
            total_transactions: categoryFilteredRows.length,
            total_items_in: categoryFilteredRows.reduce((sum, row) => sum + Number(row.qty || 0), 0),
        };
    }, [categoryFilteredRows, summary, tab, selectedCategory]);

    const unreadSummary = useMemo(() => {
        if (tab === 'out') {
            return computeUnreadCounts(categoryFilteredRows);
        }

        return {
            unread_total: categoryFilteredRows.filter((row) => !row.is_read).length,
            unread_used_count: 0,
            unread_damaged_count: 0,
            unread_expired_count: 0,
        };
    }, [categoryFilteredRows, tab]);

    const unitBreakdown = useMemo(() => {
        if (tab !== 'out') return null;
        return computeUnitBreakdown(categoryFilteredRows);
    }, [categoryFilteredRows, tab]);

    const hasActiveCardFilters = selectedMetric !== null || unreadOnly;
    const hasActiveCategoryFilter = selectedCategory !== 'all';
    const hasSearch = searchTerm.trim() !== '';
    const hasActiveFilters = hasActiveCardFilters || hasActiveCategoryFilter || hasSearch;

    // Diri i-clear ang mga filter sa card.
    const clearCardFilters = () => {
        setSelectedMetric(null);
        setSelectedCategory('all');
        setUnreadOnly(false);
        setSearchTerm('');
    };

    const periodLabel = fromDate || toDate
        ? `${fromDate || 'Any start'} – ${toDate || 'Any end'}`
        : 'All dates';

    const clickedTitle = {
        used: 'Used',
        damaged: 'Damage',
        expired: 'Expired',
        outside: 'Outside clinic',
        vials: 'Vials',
        boxes: 'Boxes',
        tablets: 'Tablets',
        capsules: 'Capsules',
    }[selectedMetric] || (tab === 'in' ? 'Stock In' : tab === 'outside' ? 'Outside clinic' : 'Stock Out');

    const reportTitle = hasActiveCategoryFilter && selectedCategory
        ? `${clickedTitle} · ${selectedCategory}`
        : clickedTitle;

    // Diri i-print ang report.
    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="flex h-screen overflow-hidden bg-canvas print:block print:h-auto print:overflow-visible">
            <style>{`
                @media print {
                    @page {
                        margin: 0;
                    }

                    html,
                    body {
                        width: 100% !important;
                        height: auto !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        overflow: visible !important;
                        background: #fff !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }

                    body {
                        padding: 10mm 12mm !important;
                    }

                    .inventory-report-sheet > .inventory-print-hide,
                    .inventory-print-hide {
                        display: none !important;
                    }

                    .inventory-report-print,
                    .inventory-report-print > div,
                    .inventory-report-sheet,
                    .inventory-report-sheet > div {
                        display: block !important;
                        width: 100% !important;
                        height: auto !important;
                        min-height: 0 !important;
                        max-height: none !important;
                        overflow: visible !important;
                        margin-left: 0 !important;
                        padding: 0 !important;
                        border: 0 !important;
                        border-radius: 0 !important;
                        box-shadow: none !important;
                        background: #fff !important;
                    }

                    .inventory-print-header {
                        display: block !important;
                        margin: 0 0 10px !important;
                        padding: 0 0 8px !important;
                        border-bottom: 2px solid #111827 !important;
                    }

                    .inventory-print-header h1 {
                        margin: 2px 0 0 !important;
                        font-size: 18px !important;
                        line-height: 1.2 !important;
                        color: #111827 !important;
                    }

                    .inventory-print-table {
                        width: 100% !important;
                        table-layout: fixed !important;
                        border-collapse: collapse !important;
                    }

                    .inventory-print-table thead {
                        display: table-header-group;
                    }

                    .inventory-print-table tr,
                    .inventory-print-table th {
                        position: static !important;
                        top: auto !important;
                        z-index: auto !important;
                        backdrop-filter: none !important;
                    }

                    .inventory-print-table tbody tr {
                        background: #fff !important;
                        box-shadow: none !important;
                        break-inside: avoid;
                        page-break-inside: avoid;
                    }

                    .inventory-print-table th,
                    .inventory-print-table td {
                        padding: 5px 6px !important;
                        font-size: 10px !important;
                        line-height: 1.35 !important;
                        white-space: normal !important;
                        overflow-wrap: break-word !important;
                        vertical-align: top !important;
                        border: 1px solid #d1d5db !important;
                        color: #111827 !important;
                        background: #fff !important;
                    }

                    .inventory-print-table th {
                        font-size: 8px !important;
                        font-weight: 700 !important;
                        letter-spacing: 0.03em !important;
                        text-transform: uppercase !important;
                        background: #f3f4f6 !important;
                    }

                    .inventory-print-table td span,
                    .inventory-print-table td p {
                        color: #111827 !important;
                        background: transparent !important;
                        box-shadow: none !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        font-size: 10px !important;
                    }

                    .inventory-print-footer {
                        margin-top: 8px !important;
                        font-size: 9px !important;
                        color: #6b7280 !important;
                    }
                }
            `}</style>
            <div className="print:hidden">
                <Sidebar />
            </div>

            <main className="staff-main inventory-report-print flex min-h-0 flex-1 flex-col overflow-hidden print:block print:overflow-visible">
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5 print:overflow-visible print:p-0">
                    <div className="inventory-print-header mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <p className="app-kicker print:hidden">
                                {sidebar === 'admin' ? 'Reports' : 'Budget operations'}
                            </p>
                            <p className="hidden text-[11px] font-semibold uppercase tracking-wider text-slate-500 print:block">
                                Inventory Reports · {reportTitle} · {periodLabel}
                            </p>
                            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-navy">
                                {reportTitle}
                            </h1>
                            <p className="mt-1 max-w-xl text-sm text-slate-500 print:hidden">
                                Track stock received, stock used, and items bought outside the clinic.
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 print:hidden">
                            <button
                                type="button"
                                onClick={handlePrint}
                                disabled={loading || displayRows.length === 0}
                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                </svg>
                                Print
                            </button>
                        <div className="inline-flex rounded-lg border border-line bg-canvas p-1">
                            <TabButton
                                active={tab === 'out'}
                                onClick={() => switchTab('out')}
                            >
                                Stock Out
                            </TabButton>
                            <TabButton
                                active={tab === 'in'}
                                onClick={() => switchTab('in')}
                            >
                                Stock In
                            </TabButton>
                            <TabButton
                                active={tab === 'outside'}
                                onClick={() => switchTab('outside')}
                            >
                                Outside clinic
                            </TabButton>
                        </div>
                        </div>
                    </div>

                    {error && (
                        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    {tab === 'out' ? (
                        <>
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 print:hidden">
                                <div className="flex flex-wrap items-center gap-2">
                                    <label
                                        htmlFor="usage-category"
                                        className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500"
                                    >
                                        By category
                                    </label>
                                    <select
                                        id="usage-category"
                                        value={selectedCategory}
                                        onChange={(e) => setSelectedCategory(e.target.value)}
                                        className="rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm text-slate-700 shadow-sm focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                                    >
                                        <option value="all">All categories</option>
                                        {categories.map((category) => (
                                            <option key={category.id} value={category.name}>
                                                {category.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                {hasActiveFilters && (
                                    <button
                                        type="button"
                                        onClick={clearCardFilters}
                                        className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-800"
                                    >
                                        Clear filters
                                    </button>
                                )}
                            </div>

                            <div className="mb-3 grid grid-cols-2 gap-2 xl:grid-cols-4 print:hidden">
                                <StatCard
                                    label="Total transactions"
                                    hint="All stock-out events · tap to reset"
                                    value={displaySummary.total_transactions ?? 0}
                                    accent="border-l-slate-500"
                                    selected={unreadOnly && !selectedMetric}
                                    onClick={() => openCategoryBox(null)}
                                    unreadCount={unreadSummary.unread_total}
                                    onUnreadClick={() => openCategoryBox(null)}
                                />
                                <StatCard
                                    label="Used"
                                    hint="Consumed in treatments"
                                    value={displaySummary.used_count ?? 0}
                                    accent="border-l-sky-500"
                                    valueClass="text-sky-700"
                                    selected={selectedMetric === 'used'}
                                    onClick={() => openCategoryBox('used')}
                                    unreadCount={unreadSummary.unread_used_count}
                                    onUnreadClick={() => openCategoryBox('used')}
                                />
                                <StatCard
                                    label="Damaged"
                                    hint="Unusable stock"
                                    value={displaySummary.damaged_count ?? 0}
                                    accent="border-l-amber-500"
                                    valueClass="text-amber-700"
                                    selected={selectedMetric === 'damaged'}
                                    onClick={() => openCategoryBox('damaged')}
                                    unreadCount={unreadSummary.unread_damaged_count}
                                    onUnreadClick={() => openCategoryBox('damaged')}
                                />
                                <StatCard
                                    label="Expired"
                                    hint="Written off via stock out"
                                    value={displaySummary.expired_count ?? 0}
                                    accent="border-l-red-500"
                                    valueClass="text-red-700"
                                    selected={selectedMetric === 'expired'}
                                    onClick={() => openCategoryBox('expired')}
                                    unreadCount={unreadSummary.unread_expired_count}
                                    onUnreadClick={() => openCategoryBox('expired')}
                                />
                            </div>
                        </>
                    ) : tab === 'outside' ? (
                        <div className="mb-3 flex items-center justify-between gap-3 print:hidden">
                            <p className="text-sm text-slate-500">
                                Items the clinic asked the owner to buy. These do not deduct clinic stock.
                            </p>
                            <p className="text-sm font-semibold tabular-nums text-violet-700">
                                {displaySummary.outside_count ?? displayRows.length} records
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 print:hidden">
                                <div className="flex flex-wrap items-center gap-2">
                                    <label
                                        htmlFor="stock-in-category"
                                        className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500"
                                    >
                                        By category
                                    </label>
                                    <select
                                        id="stock-in-category"
                                        value={selectedCategory}
                                        onChange={(e) => setSelectedCategory(e.target.value)}
                                        className="rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm text-slate-700 shadow-sm focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                                    >
                                        <option value="all">All categories</option>
                                        {categories.map((category) => (
                                            <option key={category.id} value={category.name}>
                                                {category.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                {(hasActiveCategoryFilter || unreadOnly || hasSearch) && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedCategory('all');
                                            setUnreadOnly(false);
                                            setSearchTerm('');
                                        }}
                                        className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-800"
                                    >
                                        Clear filters
                                    </button>
                                )}
                            </div>

                            <div className="mb-3 grid grid-cols-2 gap-2 print:hidden">
                                <StatCard
                                    label="Total stock-ins"
                                    hint="Receipt transactions"
                                    value={displaySummary.total_transactions ?? 0}
                                    accent="border-l-slate-500"
                                    selected={unreadOnly}
                                    onClick={() => setUnreadOnly(false)}
                                    unreadCount={unreadSummary.unread_total}
                                    onUnreadClick={() => setUnreadOnly(true)}
                                />
                                <StatCard
                                    label="Quantity received"
                                    hint="Units added to inventory"
                                    value={formatNumber(displaySummary.total_items_in ?? 0)}
                                    accent="border-l-emerald-500"
                                    valueClass="text-emerald-700"
                                />
                            </div>
                        </>
                    )}

                    {tab === 'out' && unitBreakdown && (
                        <div className="mb-3 grid grid-cols-2 gap-2 xl:grid-cols-4 print:hidden">
                            <StatCard
                                label="Vials out"
                                hint="Liquid volume used"
                                value={formatNumber(unitBreakdown.vials)}
                                suffix="ml"
                                accent="border-l-teal-500"
                                selected={selectedMetric === 'vials'}
                                onClick={() => openUnitBox('vials')}
                            />
                            <StatCard
                                label="Items out by boxes"
                                hint="Box-tracked items"
                                value={formatNumber(unitBreakdown.boxes)}
                                accent="border-l-slate-500"
                                selected={selectedMetric === 'boxes'}
                                onClick={() => openUnitBox('boxes')}
                            />
                            <StatCard
                                label="Tablets out"
                                hint="Solid dose units"
                                value={formatNumber(unitBreakdown.tablets)}
                                accent="border-l-sky-500"
                                selected={selectedMetric === 'tablets'}
                                onClick={() => openUnitBox('tablets')}
                            />
                            <StatCard
                                label="Capsules out"
                                hint="Capsule units"
                                value={formatNumber(unitBreakdown.capsules)}
                                accent="border-l-emerald-500"
                                selected={selectedMetric === 'capsules'}
                                onClick={() => openUnitBox('capsules')}
                            />
                        </div>
                    )}

                    <div className="inventory-report-sheet flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] print:overflow-visible print:border-0 print:shadow-none">
                        <div className="inventory-print-hide flex flex-wrap items-end gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-4 print:hidden">
                            <div className="min-w-[220px] flex-1">
                                <label htmlFor="inventory-report-search" className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
                                    Search
                                </label>
                                <div className="relative">
                                    <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                    <input
                                        id="inventory-report-search"
                                        type="text"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="Medicine, category, batch, owner..."
                                        className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
                                    From
                                </label>
                                <input
                                    type="date"
                                    value={fromDate}
                                    onChange={(e) => setFromDate(e.target.value)}
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                                />
                            </div>
                            <div>
                                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
                                    To
                                </label>
                                <input
                                    type="date"
                                    value={toDate}
                                    onChange={(e) => setToDate(e.target.value)}
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => fetchReport()}
                                className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
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
                                className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                            >
                                Clear
                            </button>
                            <p className="ml-auto text-xs text-slate-400">
                                <span className="font-semibold tabular-nums text-slate-600">{displayRows.length}</span> of{' '}
                                <span className="font-semibold tabular-nums text-slate-600">{tabRows.length}</span> records
                            </p>
                        </div>

                        {loading ? (
                            <div className="flex flex-1 flex-col items-center justify-center py-16">
                                <div className="mb-4 h-10 w-10 animate-spin rounded-full border-[3px] border-slate-900 border-t-transparent" />
                                <p className="text-sm text-slate-500">Loading report...</p>
                            </div>
                        ) : displayRows.length === 0 ? (
                            <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
                                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth="1.75"
                                            d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                        />
                                    </svg>
                                </div>
                                <p className="text-sm font-semibold text-slate-900">No records found</p>
                                <p className="mt-1 max-w-sm text-sm text-slate-500">
                                    {hasSearch
                                        ? `No records match “${searchTerm.trim()}”.`
                                        : unreadOnly
                                          ? 'No unread transactions match the selected filters.'
                                          : hasActiveFilters
                                            ? 'No records match the selected filters.'
                                            : `No ${tab === 'in' ? 'stock-in' : tab === 'outside' ? 'outside clinic' : 'stock-out'} records for the selected period.`}
                                </p>
                            </div>
                        ) : (
                            <div
                                className="min-h-0 flex-1 overflow-auto print:overflow-visible [&::-webkit-scrollbar]:hidden"
                                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                            >
                                {tab === 'outside' ? (
                                    <table className="inventory-print-table w-full text-left text-sm">
                                        <thead>
                                            <tr className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
                                                <th className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 backdrop-blur-sm">Item</th>
                                                <th className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 backdrop-blur-sm">Quantity</th>
                                                <th className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 backdrop-blur-sm">Status</th>
                                                <th className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 backdrop-blur-sm">Animal</th>
                                                <th className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 backdrop-blur-sm">Owner</th>
                                                <th className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 backdrop-blur-sm">Service</th>
                                                <th className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 backdrop-blur-sm">Date &amp; time</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {displayRows.map((row) => (
                                                <tr key={row.id} className="transition-colors hover:bg-violet-50/40">
                                                    <td className="px-4 py-3.5 font-semibold text-slate-900">{row.medicine_name}</td>
                                                    <td className="px-4 py-3.5 font-semibold tabular-nums text-violet-700">
                                                        {formatNumber(row.used_qty || 0)}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-slate-700">{row.status || 'Approved by the clinic'}</td>
                                                    <td className="px-4 py-3.5 text-slate-800">{displayName(row.used_for?.pet_name, '—')}</td>
                                                    <td className="px-4 py-3.5 text-slate-700">{displayName(row.used_for?.owner_name, '—')}</td>
                                                    <td className="px-4 py-3.5 text-slate-600">{row.used_for?.service || '—'}</td>
                                                    <td className="whitespace-nowrap px-4 py-3.5 text-slate-600">{formatDateTime(row)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : tab === 'out' ? (
                                    <table className="inventory-print-table w-full text-left text-sm">
                                        <colgroup>
                                            <col style={{ width: '13%' }} />
                                            <col style={{ width: '11%' }} />
                                            <col style={{ width: '9%' }} />
                                            <col style={{ width: '12%' }} />
                                            <col style={{ width: '9%' }} />
                                            <col style={{ width: '16%' }} />
                                            <col style={{ width: '16%' }} />
                                            <col style={{ width: '14%' }} />
                                        </colgroup>
                                        <thead>
                                            <tr className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
                                                <th className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 backdrop-blur-sm">Medicine</th>
                                                <th className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 backdrop-blur-sm">Category</th>
                                                <th className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 backdrop-blur-sm">Batch</th>
                                                <th className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 backdrop-blur-sm">Qty out</th>
                                                <th className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 backdrop-blur-sm">Reason</th>
                                                <th className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 backdrop-blur-sm">Used for</th>
                                                <th className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 backdrop-blur-sm">Administered by</th>
                                                <th className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 backdrop-blur-sm">Date &amp; time</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {displayRows.map((row) => (
                                                <tr
                                                    key={row.id}
                                                    id={`inventory-log-${row.id}`}
                                                    onClick={() => openTransaction(row)}
                                                    className={`cursor-pointer transition-colors hover:bg-slate-50/80 ${
                                                        highlightedId === row.id
                                                            ? 'bg-sky-50 ring-2 ring-inset ring-sky-300'
                                                            : !row.is_read
                                                              ? 'bg-red-50/40'
                                                              : ''
                                                    }`}
                                                >
                                                    <td className="px-4 py-3.5 font-semibold text-slate-900">
                                                        <span className="inline-flex items-center">
                                                            {row.medicine_name}
                                                            {!row.is_read ? (
                                                                <NewBadge onClick={() => openTransaction(row)} />
                                                            ) : null}
                                                        </span>
                                                        {row.reason === 'outside' && row.status ? (
                                                            <p className="mt-0.5 text-xs font-normal text-slate-500">{row.status}</p>
                                                        ) : null}
                                                    </td>
                                                    <td className="px-4 py-3.5">
                                                        <CategoryBadge label={row.category} />
                                                    </td>
                                                    <td className="whitespace-nowrap px-4 py-3.5 text-slate-700" title={row.batch_number || undefined}>
                                                        {row.batch_label || '—'}
                                                    </td>
                                                    <td className={`px-4 py-3.5 font-semibold tabular-nums ${row.reason === 'outside' ? 'text-violet-700' : 'text-red-600'}`}>
                                                        {row.reason === 'outside' ? null : '\u2212'}
                                                        {String(row.unit || '').toLowerCase().includes('vial') && row.used_ml != null
                                                            ? `${formatNumber(row.used_ml || 0)} ml`
                                                            : `${formatNumber(row.used_qty || 0)} ${row.unit}`}
                                                        {String(row.unit || '').toLowerCase().includes('vial') && row.used_ml != null && (
                                                            <span className="ml-1 font-normal text-slate-400">
                                                                ({formatNumber(row.used_qty || 0)}{' '}
                                                                {Number(row.used_qty) === 1 ? 'vial' : 'vials'})
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3.5">
                                                        <ReasonBadge reason={row.reason} />
                                                    </td>
                                                    <td className="px-4 py-3.5 text-slate-600">
                                                        {row.used_for ? (
                                                            <div>
                                                                <p className="font-semibold text-slate-900">
                                                                    {displayName(row.used_for.pet_name)}
                                                                    <span className="ml-1.5 text-xs font-normal text-slate-400">
                                                                        ({row.used_for.booking_type})
                                                                    </span>
                                                                </p>
                                                                <p className="mt-0.5 text-xs text-slate-500">
                                                                    {row.used_for.service} · {displayName(row.used_for.owner_name)}
                                                                </p>
                                                            </div>
                                                        ) : row.reason === 'used' ||
                                                          row.reason === 'damaged' ||
                                                          row.reason === 'expired' ? (
                                                            <span className="text-slate-400">Manual stock out</span>
                                                        ) : (
                                                            <span className="text-slate-400">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-slate-700">
                                                        {row.administered_by || row.used_for?.administered_by
                                                            ? (String(row.administered_by || row.used_for.administered_by).includes('(')
                                                                ? (row.administered_by || row.used_for.administered_by)
                                                                : displayName(row.administered_by || row.used_for.administered_by))
                                                            : '—'}
                                                    </td>
                                                    <td className="whitespace-nowrap px-4 py-3.5 text-slate-600">
                                                        {formatDateTime(row)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <table className="inventory-print-table w-full text-left text-sm">
                                        <thead>
                                            <tr className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
                                                <th className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 backdrop-blur-sm">Medicine</th>
                                                <th className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 backdrop-blur-sm">Category</th>
                                                <th className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 backdrop-blur-sm">Batch</th>
                                                <th className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 backdrop-blur-sm">Qty in</th>
                                                <th className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 backdrop-blur-sm">Reason</th>
                                                <th className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 backdrop-blur-sm">Expires</th>
                                                <th className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 backdrop-blur-sm">Date &amp; time</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {displayRows.map((row) => (
                                                <tr
                                                    key={row.id}
                                                    id={`inventory-log-${row.id}`}
                                                    onClick={() => openTransaction(row)}
                                                    className={`cursor-pointer transition-colors hover:bg-slate-50/80 ${
                                                        highlightedId === row.id
                                                            ? 'bg-sky-50 ring-2 ring-inset ring-sky-300'
                                                            : !row.is_read
                                                              ? 'bg-red-50/40'
                                                              : ''
                                                    }`}
                                                >
                                                    <td className="px-4 py-3.5 font-semibold text-slate-900">
                                                        <span className="inline-flex items-center">
                                                            {row.medicine_name}
                                                            {!row.is_read ? (
                                                                <NewBadge onClick={() => openTransaction(row)} />
                                                            ) : null}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3.5">
                                                        <CategoryBadge label={row.category} />
                                                    </td>
                                                    <td className="whitespace-nowrap px-4 py-3.5 text-slate-700" title={row.batch_number || undefined}>
                                                        {row.batch_label || '—'}
                                                    </td>
                                                    <td className="px-4 py-3.5 font-semibold tabular-nums text-emerald-600">
                                                        +{formatNumber(row.qty || 0)} {row.unit}
                                                    </td>
                                                    <td className="px-4 py-3.5">
                                                        <ReasonBadge reason={row.reason || 'receiving'} />
                                                    </td>
                                                    <td className="px-4 py-3.5 text-slate-600">
                                                        {row.expiration_date || '—'}
                                                    </td>
                                                    <td className="whitespace-nowrap px-4 py-3.5 text-slate-600">
                                                        {formatDateTime(row)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        )}
                    </div>
                    <p className="inventory-print-footer mt-4 hidden text-center text-xs text-slate-500 print:block">
                        Printed {new Date().toLocaleString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                        })}
                        {' · '}
                        {displayRows.length} record{displayRows.length === 1 ? '' : 's'}
                        {hasSearch ? ` matching “${searchTerm.trim()}”` : ''}
                    </p>
                </div>
            </main>
        </div>
    );
}
