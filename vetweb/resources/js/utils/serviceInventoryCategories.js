/**
 * Maps preventive services to the inventory categories they may use.
 * Treatment is intentionally omitted — medicines are chosen freely at treatment time.
 */
const SERVICE_INVENTORY_CATEGORY_MAP = {
    deworming: ['Dewormer'],
    vaccination: ['Vaccine'],
    vaccine: ['Vaccine'],
    'vitamin supplement': ['Vitamins'],
    vitamin: ['Vitamins'],
    vitamins: ['Vitamins'],
    spay: ['Surgery'],
    castration: ['Surgery'],
    surgery: ['Surgery'],
};

// Diri limpyohan ug gamyon ang letra sa service name.
function normalizeServiceName(name) {
    return String(name || '').trim().toLowerCase();
}

/**
 * @param {string[]} serviceNames
 * @returns {string[]|null} Allowed category names, or null for all categories.
 */
// Diri kuhaon ang inventory categories para sa mga service.
export function getInventoryCategoriesForServices(serviceNames = []) {
    const normalized = (serviceNames || [])
        .map(normalizeServiceName)
        .filter(Boolean);

    if (normalized.length === 0) {
        return null;
    }

    const categories = new Set();
    let hasTreatment = false;

    normalized.forEach((name) => {
        if (name === 'treatment' || name.includes('treatment')) {
            hasTreatment = true;
            return;
        }

        Object.entries(SERVICE_INVENTORY_CATEGORY_MAP).forEach(([key, mapped]) => {
            if (name === key || name.includes(key)) {
                mapped.forEach((category) => categories.add(category));
            }
        });
    });

    // Treatment is not tied to one category. A named service such as Deworming is.
    if (categories.size === 0) {
        return hasTreatment ? null : null;
    }

    if (hasTreatment) {
        return null;
    }

    return Array.from(categories);
}

/**
 * @param {[string, object[]][]} groupedInventory
 * @param {string[]} serviceNames
 * @returns {[string, object[]][]}
 */
// Diri salaon ang grouped inventory sumala sa services.
export function filterGroupedInventoryByServices(groupedInventory, serviceNames = []) {
    const allowed = getInventoryCategoriesForServices(serviceNames);
    if (!allowed) {
        return groupedInventory;
    }

    const allowedSet = new Set(allowed.map((name) => name.toLowerCase()));

    return groupedInventory.filter(([categoryName]) => {
        const category = String(categoryName || '').toLowerCase();
        if (allowedSet.has(category)) return true;
        return [...allowedSet].some((allowed) => category.includes(allowed) || allowed.includes(category));
    });
}

// Diri kuhaon ang category nga automatic gikan sa service.
export function autoInventoryCategoryLabel(serviceNames = []) {
    const allowed = getInventoryCategoriesForServices(serviceNames);
    if (allowed?.length) {
        return allowed.join(', ');
    }

    return (serviceNames || [])
        .map((name) => String(name || '').trim())
        .filter((name) => name && !name.toLowerCase().includes('treatment'))
        .join(', ');
}

/**
 * @param {string|null|undefined} categoryName
 * @param {string} serviceName
 */
// Diri susihon kung ang category mohaum sa service filter.
export function itemMatchesServiceFilter(categoryName, serviceName) {
    if (!serviceName || serviceName === 'all') {
        return true;
    }

    const allowed = getInventoryCategoriesForServices([serviceName]);
    if (!allowed) {
        return true;
    }

    const allowedSet = new Set(allowed.map((name) => name.toLowerCase()));
    return allowedSet.has(String(categoryName || '').toLowerCase());
}

/**
 * @param {string} serviceName
 * @returns {string|null}
 */
// Diri kuhaon ang hint text para sa service filter.
export function getServiceFilterHint(serviceName) {
    if (!serviceName || serviceName === 'all') {
        return null;
    }

    const allowed = getInventoryCategoriesForServices([serviceName]);
    if (!allowed) {
        return 'All inventory categories';
    }

    return allowed.join(', ');
}
