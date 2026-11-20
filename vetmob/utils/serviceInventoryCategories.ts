const SERVICE_INVENTORY_CATEGORY_MAP: Record<string, string[]> = {
  deworming: ['Dewormer'],
  vaccination: ['Vaccine'],
  'vitamin supplement': ['Vitamins'],
  spay: ['Surgery'],
  castration: ['Surgery'],
};

// Diri limpyohan ang ngalan sa serbisyo.
function normalizeServiceName(name: string): string {
  return String(name || '').trim().toLowerCase();
}

// Diri kuhaon ang category sa inventory base sa serbisyo.
export function getInventoryCategoriesForServices(serviceNames: string[] = []): string[] | null {
  const normalized = serviceNames.map(normalizeServiceName).filter(Boolean);

  if (normalized.length === 0) {
    return null;
  }

  if (normalized.includes('treatment')) {
    return null;
  }

  const categories = new Set<string>();

  normalized.forEach((name) => {
    const mapped = SERVICE_INVENTORY_CATEGORY_MAP[name];
    if (mapped) {
      mapped.forEach((category) => categories.add(category));
    }
  });

  if (categories.size === 0) {
    return null;
  }

  return Array.from(categories);
}

// Diri i-filter ang inventory base sa serbisyo.
export function filterGroupedInventoryByServices<T>(
  groupedInventory: [string, T[]][],
  serviceNames: string[] = []
): [string, T[]][] {
  const allowed = getInventoryCategoriesForServices(serviceNames);
  if (!allowed) {
    return groupedInventory;
  }

  const allowedSet = new Set(allowed.map((name) => name.toLowerCase()));

  return groupedInventory.filter(([categoryName]) =>
    allowedSet.has(String(categoryName || '').toLowerCase())
  );
}
