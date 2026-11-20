// Diri i-format ang zone label para ipakita.
export function formatZoneLabel(zone) {
    if (zone == null || zone === '') return '';
    if (typeof zone === 'object' && zone.name) {
        return formatZoneLabel(zone.name);
    }

    const value = String(zone).trim();
    if (!value) return '';
    if (/^zone\b/i.test(value)) return value;
    return `Zone ${value}`;
}
