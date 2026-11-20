import { useState, useEffect, useMemo, Fragment } from 'react';
import { Link } from '@inertiajs/react';
import Sidebar from '@/Components/Budget/BudgetSidebar';
import {
    getSummaryStockStatus,
    getSummaryStatusPriority,
    getRestockHref,
    needsRestockAction,
    resolveStockStatus,
    isExpired,
    getDaysUntilExpiry,
    getDaysUntilExpiryLabel,
    getNearestExpiringBatch,
    isUsableBatch,
    isExpiringSoon as isBatchExpiringSoon,
    matchesInventoryStatusFilter,
    matchesSummaryStatusFilter,
} from '@/utils/inventoryStock';
import Tabs from '@/Components/Ui/Tabs';

const STATUS_FILTERS = {
    all: 'all',
    good: 'good',
    expiring: 'expiring',
    expired: 'expired',
    low_stock: 'low_stock',
    out_of_stock: 'out_of_stock',
};

const STATUS_FILTER_OPTIONS = [
    { key: STATUS_FILTERS.all, label: 'All' },
    { key: STATUS_FILTERS.good, label: 'Good' },
    { key: STATUS_FILTERS.expiring, label: 'Expiring' },
    { key: STATUS_FILTERS.expired, label: 'Expired' },
    { key: STATUS_FILTERS.low_stock, label: 'Low stock' },
    { key: STATUS_FILTERS.out_of_stock, label: 'Out of stock' },
];

const STAT_CARDS = [
    {
        key: 'total',
        label: 'Catalog items',
        hint: 'Unique medicines',
        icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
        accent: 'border-l-violet-500',
        iconClass: 'text-violet-600 bg-violet-50',
    },
    {
        key: 'expiring',
        label: 'Expiring',
        hint: 'Within 3 months',
        icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
        accent: 'border-l-amber-500',
        iconClass: 'text-amber-600 bg-amber-50',
    },
    {
        key: 'stock',
        label: 'Units on hand',
        hint: 'All batches',
        icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
        accent: 'border-l-sky-500',
        iconClass: 'text-sky-600 bg-sky-50',
    },
];

// Diri ang card sa stat sa inventory.
function StatCard({ label, hint, value, icon, accent, iconClass }) {
    return (
        <div
            className={`flex items-center gap-4 rounded-lg border border-slate-200/80 border-l-4 bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${accent}`}
        >
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d={icon} />
                </svg>
            </div>
            <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">{label}</p>
                <p className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums text-slate-900">{value}</p>
                <p className="mt-0.5 text-xs text-slate-400">{hint}</p>
            </div>
        </div>
    );
}

// Diri i-check kung hapit na ma-expire.
function isExpiringSoon(expirationDate) {
    if (!expirationDate) return false;

    const expiry = new Date(expirationDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expiry.setHours(0, 0, 0, 0);

    if (expiry < today) {
        return false;
    }

    const threeMonths = new Date(today);
    threeMonths.setMonth(threeMonths.getMonth() + 3);

    return expiry <= threeMonths;
}

// Diri kuhaon ang badge base sa expiration.
function getStatusBadge(expirationDate) {
    if (isExpired(expirationDate)) {
        return {
            label: 'Expired',
            className: 'bg-red-50 text-red-800 ring-1 ring-inset ring-red-200/80',
            dot: 'bg-red-500',
        };
    }

    if (isExpiringSoon(expirationDate)) {
        return {
            label: 'Expiring',
            className: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200/80',
            dot: 'bg-amber-500',
        };
    }

    return {
        label: 'Good',
        className: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200/80',
        dot: 'bg-emerald-500',
    };
}

// Diri ang badge sa status.
function StatusBadge({ status }) {
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${status.className}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
            {status.label}
        </span>
    );
}

// Diri ang icon sa restock.
function RestockIcon({ className = 'h-3.5 w-3.5' }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
        </svg>
    );
}

// Diri ang icon sa batches.
function BatchesIcon({ className = 'h-3.5 w-3.5' }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
        </svg>
    );
}

// Diri ang icon sa view.
function ViewIcon({ className = 'h-3.5 w-3.5' }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
        </svg>
    );
}

// Diri ang cell sa nabilin nga panahon.
function TimeLeftCell({ value }) {
    if (!value) {
        return <span className="text-slate-400">—</span>;
    }

    const days = getDaysUntilExpiry(value);
    const label = getDaysUntilExpiryLabel(value);
    const tone =
        days == null
            ? 'text-slate-400'
            : days < 0
              ? 'text-red-600'
              : days <= 90
                ? 'text-amber-700'
                : 'text-slate-600';

    return <span className={`text-sm font-medium tabular-nums ${tone}`}>{label}</span>;
}

// Diri ang cell sa batch nga hapit ma-expire.
function BatchNearCell({ number }) {
    if (!number) {
        return <span className="text-slate-400">—</span>;
    }

    return <span className="font-medium text-slate-800">Batch {number}</span>;
}

// Diri ang page sa listahan sa inventory.
export default function InventoryList() {
    const [inventory, setInventory] = useState([]);
    const [medicines, setMedicines] = useState([]);
    const [summaryRows, setSummaryRows] = useState([]);
    const [summaryTotals, setSummaryTotals] = useState(null);
    const [viewMode, setViewMode] = useState('items');
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [statusFilter, setStatusFilter] = useState(STATUS_FILTERS.all);
    const [categories, setCategories] = useState([]);
    const [expandedMedicines, setExpandedMedicines] = useState({});

    useEffect(() => {
        fetchInventory();
        fetchMedicines();
        fetchSummary();
        fetchCategories();
    }, []);

    // Diri kuhaon ang listahan sa mga tambal.
    const fetchMedicines = async () => {
        try {
            const response = await fetch('/api/budget/medicines');
            const data = await response.json();
            if (data.success) {
                setMedicines(data.medicines || []);
            }
        } catch (error) {
            console.error('Failed to fetch medicines:', error);
        }
    };

    // Diri kuhaon ang tanang inventory.
    const fetchInventory = async () => {
        try {
            const response = await fetch('/api/budget/inventory');
            const data = await response.json();
            if (data.success) {
                setInventory(data.inventory);
            }
        } catch (error) {
            console.error('Failed to fetch inventory:', error);
        } finally {
            setLoading(false);
        }
    };

    // Diri kuhaon ang summary sa inventory.
    const fetchSummary = async () => {
        try {
            const response = await fetch('/api/budget/inventory/summary');
            const data = await response.json();
            if (data.success) {
                setSummaryRows(data.summary || []);
                setSummaryTotals(data.totals || null);
            }
        } catch (error) {
            console.error('Failed to fetch stock summary:', error);
        }
    };

    // Diri kuhaon ang mga category.
    const fetchCategories = async () => {
        try {
            const response = await fetch('/api/budget/categories');
            const data = await response.json();
            if (data.success) {
                setCategories(data.categories);
            }
        } catch (error) {
            console.error('Failed to fetch categories:', error);
        }
    };

    // Diri i-format ang quantity.
    const formatQuantity = (value) =>
        Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 });

    // Diri kwentahon ang display sa vial.
    const formatVialDisplay = (item) => {
        const quantity = Number(item.quantity || 0);
        const volumePerVial = Number(item.volume_ml || 0);
        return {
            displayVials: Math.ceil(quantity),
            totalMlRemaining: quantity * volumePerVial,
        };
    };

    // Diri i-check kung vial ang item.
    const isVialItem = (item) =>
        Boolean(item?.is_vial) || String(item?.unit?.name || '').toLowerCase().includes('vial');

    // Diri i-check kung vial ang ngalan sa unit.
    const unitLooksLikeVial = (unitName) => /\bvial/i.test(String(unitName || ''));
    // Diri i-check kung box ang ngalan sa unit.
    const unitLooksLikeBox = (unitName) => /\bbox/i.test(String(unitName || ''));

    // Diri i-sort ang mga batch base sa expiration.
    const sortBatches = (batches) =>
        [...batches].sort((a, b) => {
            const aExpired = isExpired(a.expiration_date);
            const bExpired = isExpired(b.expiration_date);
            if (aExpired !== bExpired) {
                return aExpired ? 1 : -1;
            }

            return new Date(a.created_at) - new Date(b.created_at);
        });

    // Diri kuhaon ang text sa stock sa item.
    const getStockDisplay = (item) => {
        if (isVialItem(item)) {
            const { displayVials } = formatVialDisplay(item);
            return `${displayVials} ${item.unit?.name || 'vials'}`;
        }

        if (item.is_box) {
            const boxes = formatQuantity(Math.ceil(Number(item.quantity)));
            const items = formatQuantity(Math.ceil(Number(item.quantity)) * Number(item.items_per_box));
            return `${boxes} ${item.unit?.name} (${items} items)`;
        }

        return `${formatQuantity(Math.ceil(Number(item.quantity)))} ${item.unit?.name || 'units'}`;
    };

    const stats = useMemo(() => {
        const catalogCount =
            medicines.length > 0
                ? medicines.length
                : new Set(inventory.map((item) => item.medicine_id ?? item.medicine?.id)).size;
        const totalStock = inventory.reduce((sum, item) => {
            if (!isUsableBatch(item)) return sum;
            const quantity = Number(item.quantity || 0);
            return sum + Math.ceil(quantity - 0.0000001);
        }, 0);

        return {
            total: catalogCount,
            expiring: inventory.filter((item) => Number(item.quantity) > 0 && isExpiringSoon(item.expiration_date)).length,
            stock: Math.round(totalStock).toLocaleString(),
        };
    }, [inventory, medicines]);

    const inventoryByMedicine = useMemo(() => {
        const map = new Map();

        inventory.forEach((item) => {
            const medicineId = item.medicine_id ?? item.medicine?.id;
            if (!medicineId) return;

            if (!map.has(medicineId)) {
                map.set(medicineId, []);
            }
            map.get(medicineId).push(item);
        });

        return map;
    }, [inventory]);

    const groupedInventory = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();

        return medicines
            .filter((medicine) => {
                const matchesSearch = medicine.name?.toLowerCase().includes(query);
                const matchesCategory =
                    selectedCategory === 'all' || medicine.category_id === parseInt(selectedCategory, 10);
                return matchesSearch && matchesCategory;
            })
            .map((medicine) => {
                const batches = sortBatches(inventoryByMedicine.get(medicine.id) || []);
                const firstBatch = batches[0];
                const unitName = firstBatch?.unit?.name || medicine.unit_name || 'units';
                const isVial = firstBatch ? isVialItem(firstBatch) : unitLooksLikeVial(unitName);
                const isBox = firstBatch ? Boolean(firstBatch.is_box) : unitLooksLikeBox(unitName);
                const activeBatches = batches.filter((b) => isUsableBatch(b));
                const firstActiveBatchId = activeBatches[0]?.id ?? null;
                const rawQty = activeBatches.reduce((sum, b) => sum + Number(b.quantity || 0), 0);
                const displayQty = Math.ceil(rawQty - 0.0000001);
                const nearestExpiring = getNearestExpiringBatch(batches);
                const nearestExpiry = nearestExpiring.expirationDate;
                const totalItems = isBox
                    ? activeBatches.reduce(
                          (sum, b) =>
                              sum + Number(b.total_items ?? Number(b.quantity) * Number(b.items_per_box || 0)),
                          0
                      )
                    : null;
                const expiredQty = batches
                    .filter((b) => Number(b.quantity || 0) > 0 && !isUsableBatch(b))
                    .reduce((sum, b) => sum + Number(b.quantity || 0), 0);
                const hasExpiringSoon = activeBatches.some((b) => isBatchExpiringSoon(b.expiration_date));
                const groupStatus = resolveStockStatus({
                    usableQty: displayQty,
                    expiredQty,
                    nearestExpiry,
                    hasExpiringSoon,
                });

                return {
                    medicine_id: medicine.id,
                    name: medicine.name,
                    category: medicine.category || 'Uncategorized',
                    category_id: medicine.category_id,
                    unit: unitName,
                    is_vial: isVial,
                    is_box: isBox,
                    volume_ml: firstBatch?.volume_ml ?? medicine.volume_ml,
                    items_per_box: firstBatch?.items_per_box ?? medicine.items_per_box,
                    batches,
                    first_active_batch_id: firstActiveBatchId,
                    raw_qty: rawQty,
                    display_qty: displayQty,
                    total_items: totalItems,
                    nearest_expiry: nearestExpiry,
                    nearest_expiring_batch: nearestExpiring.number,
                    batch_count: batches.length,
                    status: groupStatus,
                    is_out_of_stock: displayQty <= 0,
                };
            })
            .filter((group) => matchesInventoryStatusFilter(group, statusFilter))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [medicines, inventoryByMedicine, searchTerm, selectedCategory, statusFilter]);

    const filteredSummary = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();

        return summaryRows
            .filter((row) => {
                const matchesSearch = row.medicine_name?.toLowerCase().includes(query);
                const matchesCategory =
                    selectedCategory === 'all' || row.category_id === parseInt(selectedCategory, 10);
                const matchesStatus = matchesSummaryStatusFilter(row, statusFilter);
                return matchesSearch && matchesCategory && matchesStatus;
            })
            .sort((a, b) => {
                const priorityDiff = getSummaryStatusPriority(a) - getSummaryStatusPriority(b);
                if (priorityDiff !== 0) return priorityDiff;
                return a.medicine_name.localeCompare(b.medicine_name);
            });
    }, [summaryRows, searchTerm, selectedCategory, statusFilter]);

    const summaryStatusFilterMap = {
        good: STATUS_FILTERS.good,
        low_stock: STATUS_FILTERS.low_stock,
        expiring: STATUS_FILTERS.expiring,
        expired: STATUS_FILTERS.expired,
        out_of_stock: STATUS_FILTERS.out_of_stock,
    };

    // Diri i-toggle ang pag-expand sa tambal.
    const toggleExpanded = (medicineId) => {
        setExpandedMedicines((prev) => ({
            ...prev,
            [medicineId]: !prev[medicineId],
        }));
    };

    // Diri kuhaon ang text sa stock sa group.
    const getGroupStockDisplay = (group) => {
        if (group.display_qty <= 0) {
            return 'No stock';
        }
        if (group.is_vial) {
            return `${group.display_qty} ${group.unit}`;
        }
        if (group.is_box) {
            return `${group.display_qty} ${group.unit} (${formatQuantity(Math.ceil(Number(group.total_items || 0)))} items)`;
        }
        return `${group.display_qty} ${group.unit}`;
    };

    const hasActiveFilters =
        searchTerm.trim() !== '' ||
        selectedCategory !== 'all' ||
        statusFilter !== STATUS_FILTERS.all;

    // Diri i-clear ang mga filter.
    const clearFilters = () => {
        setSearchTerm('');
        setSelectedCategory('all');
        setStatusFilter(STATUS_FILTERS.all);
    };

    // Diri tan-awon ang mga batch sa tambal.
    const viewMedicineBatches = (medicineId, medicineName) => {
        setViewMode('items');
        setSearchTerm(medicineName || '');
        setStatusFilter(STATUS_FILTERS.all);
        setExpandedMedicines((prev) => ({ ...prev, [medicineId]: true }));
    };

    const resultCount = viewMode === 'summary' ? filteredSummary.length : groupedInventory.length;

    return (
        <div className="flex h-screen overflow-hidden bg-canvas">
            <Sidebar />

            <main className="relative staff-main flex min-h-0 flex-1 flex-col">
                <div
                    className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-canvas"
                    aria-hidden="true"
                />

                <div className="relative flex min-h-0 flex-1 flex-col px-6 py-6 lg:px-8">
                    {/* Header */}
                    <div className="mb-6 shrink-0">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                                <p className="app-kicker">
                                    Stock control
                                </p>
                                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-navy">
                                    Inventory
                                </h1>
                                <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-slate-500">
                                    Monitor medicines and supplies by item, batch, and expiry.
                                </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2.5">
                                <Tabs
                                    variant="segmented"
                                    value={viewMode}
                                    onChange={setViewMode}
                                    items={[
                                        { id: 'items', label: 'Items' },
                                        { id: 'summary', label: 'Stock summary' },
                                    ]}
                                />
                                <Link
                                    href="/budget/inventory/add"
                                    className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-violet-800"
                                >
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                                    </svg>
                                    Add inventory
                                </Link>
                            </div>
                        </div>

                        {/* Metrics */}
                        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                            {STAT_CARDS.map((card) => (
                                <StatCard
                                    key={card.key}
                                    label={card.label}
                                    hint={card.hint}
                                    value={stats[card.key]}
                                    icon={card.icon}
                                    accent={card.accent}
                                    iconClass={card.iconClass}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Filters + table */}
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
                        <div className="shrink-0 border-b border-slate-200 bg-slate-50/80 px-4 py-3.5 sm:px-5">
                            <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                                <div className="relative min-w-0 flex-1 lg:max-w-xs">
                                    <svg
                                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth="2"
                                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                        />
                                    </svg>
                                    <input
                                        type="text"
                                        placeholder="Search by medicine name…"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                                    />
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    <label className="sr-only" htmlFor="inventory-category">
                                        Category
                                    </label>
                                    <select
                                        id="inventory-category"
                                        value={selectedCategory}
                                        onChange={(e) => setSelectedCategory(e.target.value)}
                                        className="rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm text-slate-700 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                                    >
                                        <option value="all">All categories</option>
                                        {categories.map((category) => (
                                            <option key={category.id} value={String(category.id)}>
                                                {category.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex items-center gap-3 lg:ml-auto">
                                    {hasActiveFilters && (
                                        <button
                                            type="button"
                                            onClick={clearFilters}
                                            className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
                                        >
                                            Reset filters
                                        </button>
                                    )}
                                    <p className="text-xs text-slate-500">
                                        <span className="font-semibold tabular-nums text-slate-800">{resultCount}</span>
                                        {' '}
                                        {resultCount === 1 ? 'result' : 'results'}
                                    </p>
                                </div>
                            </div>
                            <Tabs
                                value={statusFilter}
                                onChange={setStatusFilter}
                                items={STATUS_FILTER_OPTIONS.map((option) => ({
                                    id: option.key,
                                    label: option.label,
                                }))}
                            />
                            </div>
                        </div>

                        {loading ? (
                            <div className="flex flex-1 flex-col items-center justify-center py-20">
                                <div className="mb-3 h-9 w-9 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
                                <p className="text-sm text-slate-500">Loading inventory…</p>
                            </div>
                        ) : viewMode === 'summary' ? (
                            filteredSummary.length === 0 ? (
                                <EmptyState
                                    title={summaryRows.length === 0 ? 'No stock summary available' : 'No matching medicines'}
                                    description={
                                        summaryRows.length === 0
                                            ? 'Add inventory to see per-medicine totals.'
                                            : 'Try a different search or filter.'
                                    }
                                />
                            ) : (
                                <div className="flex min-h-0 flex-1 flex-col">
                                    {summaryTotals?.status_counts && (
                                        <div className="shrink-0 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="mr-1 text-xs font-medium text-slate-500">
                                                    {summaryTotals.medicines ?? summaryRows.length} medicines
                                                    {summaryTotals.usable_on_hand != null && (
                                                        <> · {Number(summaryTotals.usable_on_hand).toLocaleString()} usable units</>
                                                    )}
                                                </span>
                                                {[
                                                    {
                                                        key: 'out_of_stock',
                                                        label: 'Out of stock',
                                                        className: 'bg-red-50 text-red-800 ring-red-200/80',
                                                        activeClass: 'ring-2 ring-red-400',
                                                    },
                                                    {
                                                        key: 'expired',
                                                        label: 'Expired',
                                                        className: 'bg-red-50 text-red-800 ring-red-200/80',
                                                        activeClass: 'ring-2 ring-red-400',
                                                    },
                                                    {
                                                        key: 'low_stock',
                                                        label: 'Low stock',
                                                        className: 'bg-amber-50 text-amber-800 ring-amber-200/80',
                                                        activeClass: 'ring-2 ring-amber-400',
                                                    },
                                                    {
                                                        key: 'expiring',
                                                        label: 'Expiring',
                                                        className: 'bg-amber-50 text-amber-800 ring-amber-200/80',
                                                        activeClass: 'ring-2 ring-amber-400',
                                                    },
                                                    {
                                                        key: 'good',
                                                        label: 'Good',
                                                        className: 'bg-emerald-50 text-emerald-800 ring-emerald-200/80',
                                                        activeClass: 'ring-2 ring-emerald-400',
                                                    },
                                                ].map((item) => {
                                                    const filterKey = summaryStatusFilterMap[item.key];
                                                    const isActive = statusFilter === filterKey;
                                                    return (
                                                        <button
                                                            key={item.key}
                                                            type="button"
                                                            onClick={() =>
                                                                setStatusFilter(isActive ? STATUS_FILTERS.all : filterKey)
                                                            }
                                                            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition ${item.className} ${
                                                                isActive ? item.activeClass : 'hover:opacity-90'
                                                            }`}
                                                        >
                                                            {item.label}
                                                            <span className="font-semibold tabular-nums">
                                                                {summaryTotals.status_counts[item.key] ?? 0}
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    <div className="min-h-0 flex-1 overflow-auto">
                                        <table className="w-full min-w-[980px] text-left text-sm">
                                            <thead>
                                                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                                                    <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3">Medicine</th>
                                                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">On hand</th>
                                                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Batches</th>
                                                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Batch near expiring</th>
                                                    <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Time left</th>
                                                    <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3">Status</th>
                                                    <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3 text-right">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {filteredSummary.map((row) => {
                                                    const stockStatus = getSummaryStockStatus(row);
                                                    const usableOnHand = Number(
                                                        row.on_hand_display ?? Math.ceil(Number(row.on_hand || 0))
                                                    );
                                                    const expiredOnHand = Number(
                                                        row.expired_on_hand_display ??
                                                            Math.ceil(Number(row.expired_on_hand || 0))
                                                    );
                                                    const isOutOfStock = usableOnHand <= 0 && expiredOnHand <= 0;
                                                    const urgent =
                                                        stockStatus.label === 'Out of stock' ||
                                                        stockStatus.label === 'Expired';
                                                    const nearestExpiring = getNearestExpiringBatch(
                                                        sortBatches(inventoryByMedicine.get(row.medicine_id) || [])
                                                    );

                                                    return (
                                                        <tr
                                                            key={row.medicine_id}
                                                            className="transition-colors hover:bg-slate-50/90"
                                                        >
                                                            <td className="px-5 py-3.5">
                                                                <p className="font-medium text-slate-900">
                                                                    {row.medicine_name}
                                                                </p>
                                                                <p className="mt-0.5 text-xs text-slate-400">
                                                                    {row.category}
                                                                </p>
                                                            </td>
                                                            <td className="px-4 py-3.5">
                                                                <p
                                                                    className={`font-semibold tabular-nums ${
                                                                        isOutOfStock || stockStatus.label === 'Expired'
                                                                            ? 'text-red-600'
                                                                            : stockStatus.label === 'Low stock'
                                                                              ? 'text-amber-700'
                                                                              : 'text-slate-900'
                                                                    }`}
                                                                >
                                                                    {isOutOfStock
                                                                        ? 'No stock'
                                                                        : `${formatQuantity(usableOnHand)} ${row.unit}`}
                                                                </p>
                                                                {expiredOnHand > 0 && (
                                                                    <p className="mt-0.5 text-xs font-medium text-red-600">
                                                                        {formatQuantity(expiredOnHand)} {row.unit} expired
                                                                    </p>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-3.5 tabular-nums text-slate-600">
                                                                {Number(row.total_batches) > 0
                                                                    ? Number(row.total_batches)
                                                                    : 0}
                                                                {Number(row.expired_batches) > 0 && (
                                                                    <span className="mt-0.5 block text-xs text-red-500">
                                                                        {row.expired_batches} expired
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-3.5 text-slate-700">
                                                                <BatchNearCell number={nearestExpiring.number} />
                                                            </td>
                                                            <td className="px-4 py-3.5">
                                                                <TimeLeftCell
                                                                    value={
                                                                        nearestExpiring.expirationDate ||
                                                                        row.nearest_expiry
                                                                    }
                                                                />
                                                            </td>
                                                            <td className="px-5 py-3.5">
                                                                <StatusBadge status={stockStatus} />
                                                            </td>
                                                            <td className="px-5 py-3.5 text-right">
                                                                <div className="inline-flex items-center justify-end gap-1.5">
                                                                    <Link
                                                                        href={getRestockHref(
                                                                            row.medicine_id,
                                                                            row.medicine_name
                                                                        )}
                                                                        title="Restock"
                                                                        aria-label={`Restock ${row.medicine_name}`}
                                                                        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                                                                            urgent
                                                                                ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                                                                                : needsRestockAction(stockStatus)
                                                                                  ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                                                                  : 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'
                                                                        }`}
                                                                    >
                                                                        <RestockIcon />
                                                                    </Link>
                                                                    <button
                                                                        type="button"
                                                                        title="View batches"
                                                                        aria-label={`View batches for ${row.medicine_name}`}
                                                                        onClick={() =>
                                                                            viewMedicineBatches(
                                                                                row.medicine_id,
                                                                                row.medicine_name
                                                                            )
                                                                        }
                                                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                                                                    >
                                                                        <BatchesIcon />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )
                        ) : groupedInventory.length === 0 ? (
                            <EmptyState
                                title={inventory.length === 0 ? 'No inventory items yet' : 'No matching items'}
                                description={
                                    inventory.length === 0
                                        ? 'Add your first item to start tracking stock.'
                                        : 'Try a different search or filter.'
                                }
                                action={
                                    inventory.length === 0 ? (
                                        <Link
                                            href="/budget/inventory/add"
                                            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800"
                                        >
                                            Add inventory
                                        </Link>
                                    ) : null
                                }
                            />
                        ) : (
                            <div className="min-h-0 flex-1 overflow-auto">
                                <table className="w-full min-w-[1080px] text-left text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                                            <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3">Item</th>
                                            <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Category</th>
                                            <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Total stock</th>
                                            <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Batches</th>
                                            <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Batch near expiring</th>
                                            <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Time left</th>
                                            <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3">Status</th>
                                            <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3 text-right">
                                                Action
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {groupedInventory.map((group) => {
                                            const expanded = Boolean(expandedMedicines[group.medicine_id]);

                                            return (
                                                <Fragment key={group.medicine_id}>
                                                    <tr className="border-b border-slate-100 transition-colors hover:bg-slate-50/90">
                                                        <td className="px-5 py-3.5">
                                                            {group.batch_count > 0 ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleExpanded(group.medicine_id)}
                                                                    className="flex items-start gap-2.5 text-left"
                                                                >
                                                                    <span
                                                                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-slate-200 bg-white text-slate-400 transition-transform duration-200 ${
                                                                            expanded ? 'rotate-90 border-violet-200 text-violet-600' : ''
                                                                        }`}
                                                                    >
                                                                        <svg
                                                                            className="h-3 w-3"
                                                                            fill="none"
                                                                            stroke="currentColor"
                                                                            viewBox="0 0 24 24"
                                                                        >
                                                                            <path
                                                                                strokeLinecap="round"
                                                                                strokeLinejoin="round"
                                                                                strokeWidth="2.5"
                                                                                d="M9 5l7 7-7 7"
                                                                            />
                                                                        </svg>
                                                                    </span>
                                                                    <div>
                                                                        <p className="font-medium text-slate-900">
                                                                            {group.name}
                                                                        </p>
                                                                        <p className="mt-0.5 text-xs text-slate-400">
                                                                            {group.batch_count} batch
                                                                            {group.batch_count === 1 ? '' : 'es'}
                                                                        </p>
                                                                    </div>
                                                                </button>
                                                            ) : (
                                                                <div className="flex items-start gap-2.5 pl-0.5">
                                                                    <div>
                                                                        <p className="font-medium text-slate-900">
                                                                            {group.name}
                                                                        </p>
                                                                        <p className="mt-0.5 text-xs text-slate-400">
                                                                            No batches on hand
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3.5 text-slate-500">{group.category}</td>
                                                        <td className="px-4 py-3.5">
                                                            <p
                                                                className={`font-medium tabular-nums ${
                                                                    group.is_out_of_stock
                                                                        ? 'text-red-600'
                                                                        : 'text-slate-900'
                                                                }`}
                                                            >
                                                                {getGroupStockDisplay(group)}
                                                            </p>
                                                            {group.is_vial && group.volume_ml > 0 && (
                                                                <p className="mt-0.5 text-xs tabular-nums text-sky-700">
                                                                    {(
                                                                        group.raw_qty * Number(group.volume_ml)
                                                                    ).toLocaleString(undefined, {
                                                                        minimumFractionDigits: 0,
                                                                        maximumFractionDigits: 2,
                                                                    })}{' '}
                                                                    ml remaining
                                                                </p>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3.5 tabular-nums text-slate-600">
                                                            {group.batch_count}
                                                        </td>
                                                        <td className="px-4 py-3.5 text-slate-700">
                                                            <BatchNearCell number={group.nearest_expiring_batch} />
                                                        </td>
                                                        <td className="px-4 py-3.5">
                                                            <TimeLeftCell value={group.nearest_expiry} />
                                                        </td>
                                                        <td className="px-4 py-3.5">
                                                            <StatusBadge status={group.status} />
                                                        </td>
                                                        <td className="px-5 py-3.5 text-right">
                                                            <div className="inline-flex items-center justify-end gap-1.5">
                                                                {(group.is_out_of_stock ||
                                                                    group.status?.label === 'Low stock' ||
                                                                    group.status?.label === 'Expired') && (
                                                                    <Link
                                                                        href={getRestockHref(group.medicine_id, group.name)}
                                                                        title="Restock"
                                                                        aria-label={`Restock ${group.name}`}
                                                                        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                                                                            group.is_out_of_stock ||
                                                                            group.status?.label === 'Expired'
                                                                                ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                                                                                : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                                                        }`}
                                                                    >
                                                                        <RestockIcon />
                                                                    </Link>
                                                                )}
                                                                {group.batch_count > 0 ? (
                                                                    <button
                                                                        type="button"
                                                                        title={expanded ? 'Hide batches' : 'Show batches'}
                                                                        aria-label={
                                                                            expanded
                                                                                ? `Hide batches for ${group.name}`
                                                                                : `Show batches for ${group.name}`
                                                                        }
                                                                        onClick={() => toggleExpanded(group.medicine_id)}
                                                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-violet-700 transition hover:bg-violet-100"
                                                                    >
                                                                        <BatchesIcon />
                                                                    </button>
                                                                ) : null}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                    {expanded &&
                                                        group.batches.map((item, index) => {
                                                            const status = getStatusBadge(item.expiration_date);
                                                            const isLast = index === group.batches.length - 1;
                                                            return (
                                                                <tr
                                                                    key={item.id}
                                                                    className={`bg-slate-50/70 ${
                                                                        isLast
                                                                            ? 'border-b border-slate-200'
                                                                            : 'border-b border-slate-100'
                                                                    }`}
                                                                >
                                                                    <td className="px-5 py-2.5 pl-14">
                                                                        <div className="border-l-2 border-violet-300 pl-3">
                                                                            <p className="text-sm text-slate-800">
                                                                                Batch {index + 1}
                                                                                {item.id === group.first_active_batch_id && (
                                                                                    <span className="ml-2 text-[11px] font-medium uppercase tracking-wide text-violet-600">
                                                                                        Used first
                                                                                    </span>
                                                                                )}
                                                                                {isExpired(item.expiration_date) && (
                                                                                    <span className="ml-2 text-[11px] font-medium uppercase tracking-wide text-red-600">
                                                                                        Not for use
                                                                                    </span>
                                                                                )}
                                                                            </p>
                                                                            {item.batch_number && (
                                                                                <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                                                                                    {item.batch_number}
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-4 py-2.5" />
                                                                    <td className="px-4 py-2.5 tabular-nums text-slate-700">
                                                                        {getStockDisplay(item)}
                                                                    </td>
                                                                    <td className="px-4 py-2.5 text-xs text-slate-500">
                                                                        {index + 1} of {group.batch_count}
                                                                    </td>
                                                                    <td className="px-4 py-2.5 text-slate-700">
                                                                        <BatchNearCell number={index + 1} />
                                                                    </td>
                                                                    <td className="px-4 py-2.5">
                                                                        <TimeLeftCell value={item.expiration_date} />
                                                                    </td>
                                                                    <td className="px-4 py-2.5">
                                                                        <StatusBadge status={status} />
                                                                    </td>
                                                                    <td className="px-5 py-2.5 text-right">
                                                                        <Link
                                                                            href={`/budget/inventory/${item.id}`}
                                                                            title="View batch"
                                                                            aria-label={`View batch ${index + 1}`}
                                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-violet-700 transition hover:bg-violet-100"
                                                                        >
                                                                            <ViewIcon />
                                                                        </Link>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                </Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}

// Diri ang display kung walay sulod.
function EmptyState({ title, description, action = null }) {
    return (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
                <svg className="h-6 w-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.75"
                        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                    />
                </svg>
            </div>
            <p className="text-sm font-semibold text-slate-900">{title}</p>
            <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
            {action}
        </div>
    );
}
