// Diri i-reset ang petsa sa sugod sa adlaw.
function startOfDay(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
}

// Diri ihapon pila ka adlaw pa una mo-expire.
export function getDaysUntilExpiry(expirationDate) {
    if (!expirationDate) return null;

    const expiry = startOfDay(expirationDate);
    const today = startOfDay(new Date());
    if (!expiry || !today) return null;

    return Math.round((expiry - today) / (1000 * 60 * 60 * 24));
}

// Diri idugtong ang mga parte sa duration gamit "and".
function joinDurationParts(parts) {
    if (parts.length === 0) return null;
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
    return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

// Diri i-format ang tuig, bulan, ug adlaw nga text.
function formatDurationSpan(years, months, days) {
    const parts = [];

    if (years === 1) parts.push('1 year');
    else if (years > 0) parts.push(`${years} years`);

    if (months === 1) parts.push('1 month');
    else if (months > 0) parts.push(`${months} months`);

    if (days === 1) parts.push('1 day');
    else if (days > 0) parts.push(`${days} days`);

    return joinDurationParts(parts);
}

// Diri dugangan ug usa ka tuig o bulan ang petsa.
function addCalendarUnit(date, unit) {
    const next = new Date(date);
    if (unit === 'year') {
        next.setFullYear(next.getFullYear() + 1);
    } else {
        next.setMonth(next.getMonth() + 1);
    }
    return next;
}

// Diri kuwentahon ang tuig, bulan, ug adlaw una mo-expire.
export function getMonthsAndDaysUntilExpiry(expirationDate) {
    const totalDays = getDaysUntilExpiry(expirationDate);
    if (totalDays == null) return null;

    const expired = totalDays < 0;
    const start = startOfDay(expired ? expirationDate : new Date());
    const end = startOfDay(expired ? new Date() : expirationDate);
    if (!start || !end) return null;

    let years = 0;
    let months = 0;
    const cursor = new Date(start);

    while (years < 200) {
        const next = addCalendarUnit(cursor, 'year');
        if (next > end) break;
        years += 1;
        cursor.setTime(next.getTime());
    }

    while (months < 12) {
        const next = addCalendarUnit(cursor, 'month');
        if (next > end) break;
        months += 1;
        cursor.setTime(next.getTime());
    }

    const days = Math.round((end - cursor) / (1000 * 60 * 60 * 24));

    return { years, months, days, expired, totalDays };
}

// Diri himuon ang label kung kanus-a mo-expire.
export function getDaysUntilExpiryLabel(expirationDate) {
    const parts = getMonthsAndDaysUntilExpiry(expirationDate);
    if (!parts) return null;
    if (parts.totalDays === 0) return 'Expires today';

    const span = formatDurationSpan(parts.years, parts.months, parts.days);
    if (!span) return parts.expired ? 'Expired' : 'Expires today';

    return parts.expired ? `Expired ${span} ago` : span;
}

// Diri pangitaon ang batch nga pinakaduol na mo-expire.
export function getNearestExpiringBatch(batches = []) {
    const withStock = batches.filter((batch) => Number(batch?.quantity || 0) > 0);
    const usable = withStock.filter(isUsableBatch);
    const pool = usable.length > 0 ? usable : withStock.filter((batch) => batch?.expiration_date);

    if (pool.length === 0) {
        return { batch: null, number: null, expirationDate: null };
    }

    const nearest = [...pool].sort((a, b) => {
        const aTime = new Date(a.expiration_date || 0).getTime();
        const bTime = new Date(b.expiration_date || 0).getTime();
        return aTime - bTime;
    })[0];

    const index = batches.findIndex((batch) => batch.id === nearest.id);

    return {
        batch: nearest,
        number: index >= 0 ? index + 1 : null,
        expirationDate: nearest.expiration_date || null,
    };
}

// Diri susihon kung expired na ang petsa.
export function isExpired(expirationDate) {
    if (!expirationDate) return false;

    const expiry = new Date(expirationDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expiry.setHours(0, 0, 0, 0);

    return expiry < today;
}

// Diri susihon kung magamit pa ang batch.
export function isUsableBatch(item) {
    if (!item) return false;
    if (item.is_usable != null) return Boolean(item.is_usable);
    if (item.is_expired != null) {
        return Number(item.quantity || 0) > 0 && !item.is_expired;
    }

    return Number(item.quantity || 0) > 0 && !isExpired(item.expiration_date);
}

export const EXPIRED_STATUS = {
    label: 'Expired',
    className: 'bg-red-50 text-red-800 ring-1 ring-inset ring-red-200/80',
    dot: 'bg-red-500',
};

export const OUT_OF_STOCK_STATUS = {
    label: 'Out of stock',
    className: 'bg-red-50 text-red-800 ring-1 ring-inset ring-red-200/80',
    dot: 'bg-red-500',
};

export const LOW_STOCK_STATUS = {
    label: 'Low stock',
    className: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200/80',
    dot: 'bg-amber-500',
};

export const EXPIRING_STATUS = {
    label: 'Expiring',
    className: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200/80',
    dot: 'bg-amber-500',
};

export const GOOD_STATUS = {
    label: 'Good',
    className: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200/80',
    dot: 'bg-emerald-500',
};

export const LOW_STOCK_THRESHOLD = 5;

// Diri susihon kung hapit na mo-expire.
export function isExpiringSoon(expirationDate) {
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

/** Shared status for Items + Stock summary (same labels everywhere). */
// Diri tagaan ug stock status label ug kolor.
export function resolveStockStatus({
    usableQty = 0,
    expiredQty = 0,
    nearestExpiry = null,
    hasExpiringSoon = false,
} = {}) {
    const usable = Math.ceil(Number(usableQty || 0) - 0.0000001);
    const expired = Number(expiredQty || 0);

    if (usable <= 0 && expired > 0) {
        return EXPIRED_STATUS;
    }

    if (usable <= 0) {
        return OUT_OF_STOCK_STATUS;
    }

    if (usable <= LOW_STOCK_THRESHOLD) {
        return LOW_STOCK_STATUS;
    }

    if (hasExpiringSoon || isExpiringSoon(nearestExpiry)) {
        return EXPIRING_STATUS;
    }

    return GOOD_STATUS;
}

// Diri kuhaon ang status sa grupo sa inventory batches.
export function getGroupInventoryStatus(activeBatches, allBatches) {
    const hasExpiredOnlyStock =
        activeBatches.length === 0 &&
        allBatches.some((batch) => Number(batch.quantity || 0) > 0);

    if (hasExpiredOnlyStock) {
        return EXPIRED_STATUS;
    }

    if (activeBatches.length === 0) {
        return OUT_OF_STOCK_STATUS;
    }

    return null;
}

// Diri kuhaon ang stock status sa summary row.
export function getSummaryStockStatus(row) {
    return resolveStockStatus({
        usableQty: row.on_hand_display ?? row.on_hand ?? 0,
        expiredQty: row.expired_on_hand_display ?? row.expired_on_hand ?? 0,
        nearestExpiry: row.nearest_expiry,
        hasExpiringSoon: Boolean(row.has_expiring_soon),
    });
}

// Diri tagaan ug priority number ang summary status para sa sort.
export function getSummaryStatusPriority(row) {
    switch (getSummaryStockStatus(row).label) {
        case 'Out of stock':
            return 0;
        case 'Expired':
            return 1;
        case 'Low stock':
            return 2;
        case 'Expiring':
            return 3;
        default:
            return 4;
    }
}

// Diri susihon kung mohaum ang summary row sa status filter.
export function matchesSummaryStatusFilter(row, statusFilter) {
    const status = getSummaryStockStatus(row);

    switch (statusFilter) {
        case 'good':
            return status.label === 'Good';
        case 'expiring':
            return status.label === 'Expiring';
        case 'expired':
            return status.label === 'Expired';
        case 'low_stock':
            return status.label === 'Low stock';
        case 'out_of_stock':
            return status.label === 'Out of stock';
        default:
            return true;
    }
}

// Diri susihon kung expired na ang inventory group.
export function isGroupExpired(group) {
    if (group?.status?.label === 'Expired') {
        return true;
    }

    return (group?.batches || []).some(
        (batch) => Number(batch.quantity || 0) > 0 && isExpired(batch.expiration_date)
    );
}

// Diri susihon kung out of stock na ang inventory group.
export function isGroupOutOfStock(group) {
    if (group?.status?.label === 'Out of stock') {
        return true;
    }

    return Boolean(group?.is_out_of_stock) && !isGroupExpired(group);
}

// Diri susihon kung low stock na ang inventory group.
export function isGroupLowStock(group) {
    const qty = Math.ceil(Number(group?.display_qty || 0) - 0.0000001);
    return qty > 0 && qty <= LOW_STOCK_THRESHOLD;
}

// Diri susihon kung mohaum ang inventory group sa status filter.
export function matchesInventoryStatusFilter(group, statusFilter) {
    const label = group?.status?.label;

    switch (statusFilter) {
        case 'good':
            return label === 'Good';
        case 'expiring':
            return label === 'Expiring';
        case 'expired':
            return label === 'Expired';
        case 'low_stock':
            return label === 'Low stock';
        case 'out_of_stock':
            return label === 'Out of stock';
        default:
            return true;
    }
}

// Diri salaon ang inventory nga magamit pa.
export function filterUsableInventory(inventory = []) {
    return inventory.filter(isUsableBatch);
}

// Diri kuhaon ang on-hand quantity sa tambal.
export function getMedicineOnHand(medicine) {
    return Number(medicine?.on_hand_display ?? Math.ceil(Number(medicine?.on_hand || 0)));
}

// Diri susihon kung wala nay stock ang tambal.
export function isMedicineOutOfStock(medicine) {
    return getMedicineOnHand(medicine) <= 0;
}

// Diri himuon ang restock link para sa tambal.
export function getRestockHref(medicineId, medicineName = '') {
    const nameParam = medicineName ? `&medicine_name=${encodeURIComponent(medicineName)}` : '';
    return `/budget/inventory/add?mode=restock&medicine_id=${medicineId}${nameParam}`;
}

/** Statuses where Restock should be visually emphasized in stock summary. */
// Diri susihon kung kinahanglan i-highlight ang Restock.
export function needsRestockAction(statusOrLabel) {
    const label = typeof statusOrLabel === 'string' ? statusOrLabel : statusOrLabel?.label;
    return ['Out of stock', 'Low stock', 'Expired', 'Expiring'].includes(label);
}

// Diri i-round ang quantity sa tulo ka decimal.
function roundQty(value) {
    return Math.round(Number(value || 0) * 1000) / 1000;
}

// Diri i-format ang quantity number nga naay comma.
function formatQtyNumber(value) {
    return Number(value || 0).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
    });
}

// Diri pilion ang singular o plural nga pulong.
function pluralize(count, singular, plural) {
    return Math.abs(Number(count)) === 1 ? singular : plural;
}

// Diri i-convert ang log qty ngadto sa native unit.
function getNativeChangeQty(log, inventory) {
    const qty = Number(log.qty || 0);
    if (!inventory) return qty;

    const unit = String(log.unit || '').toLowerCase();
    const itemsPerBox = Number(inventory.items_per_box || 0);
    const isBox = Boolean(inventory.is_box) || /box/i.test(String(inventory.unit?.name || inventory.unit || ''));

    if (isBox && itemsPerBox > 0 && (String(log.type).toUpperCase() === 'OUT' || unit.includes('item'))) {
        return roundQty(qty / itemsPerBox);
    }

    return qty;
}

// Diri i-format ang stock ngadto sa boxes ug units.
export function formatStockBreakdown(nativeQty, inventory) {
    const qty = roundQty(nativeQty);
    const unitName = inventory?.unit?.name || inventory?.unit || 'units';
    const itemsPerBox = Number(inventory?.items_per_box || 0);
    const volumeMl = Number(inventory?.volume_ml || 0);

    if ((inventory?.is_box || /box/i.test(String(unitName))) && itemsPerBox > 0) {
        const items = roundQty(qty * itemsPerBox);
        const boxes = items > 0 ? Math.ceil(items / itemsPerBox - 1e-9) : 0;
        return {
            primary: `${formatQtyNumber(items)} ${pluralize(items, 'item', 'items')}`,
            secondary: `${formatQtyNumber(boxes)} ${pluralize(boxes, 'box', 'boxes')}`,
        };
    }

    if ((inventory?.is_vial || /vial/i.test(String(unitName))) && volumeMl > 0) {
        const ml = roundQty(qty * volumeMl);
        return {
            primary: `${formatQtyNumber(qty)} ${pluralize(qty, 'vial', 'vials')}`,
            secondary: `${formatQtyNumber(ml)} ml`,
        };
    }

    return {
        primary: `${formatQtyNumber(qty)} ${unitName}`,
        secondary: null,
    };
}

// Diri dugangan ang logs ug running stock quantity.
export function withRunningQuantities(logs = [], inventory = null) {
    const chronological = [...logs].sort((a, b) => {
        const timeDiff = new Date(a.created_at || 0) - new Date(b.created_at || 0);
        if (timeDiff !== 0) return timeDiff;
        return Number(a.id || 0) - Number(b.id || 0);
    });

    let running = 0;
    const balances = new Map();

    chronological.forEach((log) => {
        const change = getNativeChangeQty(log, inventory);
        const before = running;
        running = String(log.type).toUpperCase() === 'OUT' ? running - change : running + change;
        running = roundQty(running);
        balances.set(log.id, {
            qty_before: before,
            qty_after: running,
        });
    });

    return logs.map((log) => ({
        ...log,
        ...(balances.get(log.id) || {}),
    }));
}
