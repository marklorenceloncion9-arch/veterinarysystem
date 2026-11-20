export const DEFAULT_ADMINISTERED_BY = 'Doc. Beate Humilbe Obsioma';

// Diri himuon ang options sa "Administered by" gikan sa staff.
export function buildAdministeredByOptions(staff = []) {
    const options = [
        {
            value: DEFAULT_ADMINISTERED_BY,
            label: DEFAULT_ADMINISTERED_BY,
        },
    ];

    const seen = new Set([DEFAULT_ADMINISTERED_BY.toLowerCase()]);

    staff.forEach((member) => {
        const name = (member?.name || '').trim();
        if (!name) return;

        const key = name.toLowerCase();
        if (seen.has(key)) return;

        seen.add(key);
        options.push({
            value: name,
            label: member.role_label ? `${name} (${member.role_label})` : name,
        });
    });

    return options;
}
