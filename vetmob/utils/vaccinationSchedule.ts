export type VaccineDose = 'first' | 'booster';

export function vaccineDurationYears(doseType?: string | null): number {
  return doseType === 'booster' ? 3 : 1;
}

export function addYearsToDate(value: string, years: number): string | null {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return null;
  date.setFullYear(date.getFullYear() + years);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function vaccineValidUntil(lastDate?: string | null, doseType?: string | null): string | null {
  if (!lastDate) return null;
  return addYearsToDate(lastDate, vaccineDurationYears(doseType));
}

export function vaccineDoseLabel(doseType?: string | null): string {
  return doseType === 'booster' ? 'Booster · 3 years' : 'First vaccination · 1 year';
}

function formatScheduleDate(value?: string | null): string {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function vaccineCoverageLabel(lastDate?: string | null, doseType?: string | null): string {
  if (!lastDate) return '';
  const until = vaccineValidUntil(lastDate, doseType);
  return `${vaccineDoseLabel(doseType)}${until ? ` · valid until ${formatScheduleDate(until)}` : ''}`;
}
