export function vaccineDurationYears(doseType) {
    return doseType === 'booster' ? 3 : 1;
}

export function addYearsToDate(value, years) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (Number.isNaN(date.getTime())) return null;
    date.setFullYear(date.getFullYear() + years);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

export function formatScheduleDate(value) {
    const iso = addYearsToDate(value, 0);
    if (!iso) return '';
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

export function vaccineCoverageLabel(lastDate, doseType) {
    if (!lastDate) return null;
    const years = vaccineDurationYears(doseType);
    const until = addYearsToDate(lastDate, years);
    const kind = doseType === 'booster' ? 'Booster · 3 years' : 'First vaccination · 1 year';
    return `${formatScheduleDate(lastDate)} · ${kind} · valid until ${formatScheduleDate(until)}`;
}
