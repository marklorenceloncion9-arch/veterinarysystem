// Diri i-format ang petsa sa short o long style.
export const formatDate = (dateString, style = 'short') => {
    if (!dateString) return null;
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    return date.toLocaleDateString(
        'en-US',
        style === 'long'
            ? { year: 'numeric', month: 'long', day: 'numeric' }
            : { year: 'numeric', month: 'short', day: 'numeric' }
    );
};

// Diri i-format ang kantidad nga peso.
export const formatCurrency = (value) => {
    if (value == null || value === '') return null;
    return `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
};

// Diri ihapon ang tanang hayop sa VHC record.
export const getTotalAnimals = (record) =>
    (record?.livestock || []).reduce(
        (sum, entry) => sum + (Number(entry.male_count) || 0) + (Number(entry.female_count) || 0),
        0
    );

// Diri kuhaon ang listahan sa species names sa record.
export const getSpeciesSummary = (record) =>
    (record?.livestock || []).map((entry) => entry.species?.species_name).filter(Boolean);

// Diri susihon kung valid pa o expired na ang VHC.
export const getValidityStatus = (record) => {
    if (!record?.valid_till) return { label: 'No expiry', tone: 'neutral' };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const validTill = new Date(record.valid_till);
    validTill.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((validTill - today) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { label: 'Expired', tone: 'danger' };
    if (diffDays <= 7) return { label: 'Expiring soon', tone: 'warning' };
    return { label: 'Active', tone: 'success' };
};

// Diri pilion ang kolor sumala sa purpose sa VHC.
export const purposeTone = (purpose = '') => {
    const value = purpose.toLowerCase();
    if (value.includes('slaughter')) return 'rose';
    if (value.includes('breed')) return 'emerald';
    if (value.includes('sale')) return 'amber';
    return 'violet';
};

export const toneClasses = {
    rose: 'bg-rose-50 text-rose-700 ring-rose-100',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    violet: 'bg-violet-50 text-violet-700 ring-violet-100',
    success: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    warning: 'bg-amber-50 text-amber-700 ring-amber-100',
    danger: 'bg-rose-50 text-rose-700 ring-rose-100',
    neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
};

// Diri kuhaon ang unang letra sa ngalan.
export const getInitial = (name) => (name?.trim()?.charAt(0) || 'V').toUpperCase();

export const DEFAULT_VHC_ORIGIN = 'Cogon Public Market, El Salvador City';
export const DEFAULT_VHC_ISSUED_AT = 'El Salvador City';

// Diri limpyohan ang contact number ngadto sa 09 format.
export const normalizeVhcContactNumber = (value) => {
    let phoneValue = String(value ?? '').replace(/\D/g, '');

    if (phoneValue.length > 0 && !phoneValue.startsWith('09')) {
        phoneValue = '09' + phoneValue.replace(/^0+/, '');
    }

    return phoneValue.substring(0, 11);
};

// Diri susihon kung sakto ang 11-digit nga contact number.
export const isValidVhcContactNumber = (value) => !value || /^09\d{9}$/.test(value);

const HEAD_COUNT_WORDS = [
    'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
];

// Diri isulat ang head count sa pulong ug numero.
export const formatVhcHeadCount = (count) => {
    const num = Number(count) || 0;
    if (num <= 0) return '';

    const word = num < HEAD_COUNT_WORDS.length ? HEAD_COUNT_WORDS[num] : null;
    const label = num === 1 ? 'head' : 'heads';

    return word ? `${num} (${word}) ${label}` : `${num} ${label}`;
};

// Diri i-format ang amount para sa printed VHC.
export const formatVhcPrintAmount = (value) => {
    if (value == null || value === '') return '';
    return `P ${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Diri bahinon ang petsa ngadto sa label ug tuig para sa print.
export const formatVhcPrintDateParts = (dateString) => {
    if (!dateString) {
        return { label: '__________', year: '____' };
    }

    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
        return { label: '__________', year: '____' };
    }

    return {
        label: date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
        year: String(date.getFullYear()),
    };
};

// Diri himuon ang mga row sa livestock table sa printed VHC.
export const buildVhcPrintRows = (record, minRows = 5) => {
    const rows = [];
    const age = record?.age ?? '';
    const color = record?.color ?? '';

    for (const entry of record?.livestock || []) {
        const species = (entry.species?.species_name || '').toUpperCase();
        const maleCount = Number(entry.male_count) || 0;
        const femaleCount = Number(entry.female_count) || 0;

        if (maleCount > 0) {
            rows.push({
                species,
                quantity: formatVhcHeadCount(maleCount),
                sex: maleCount === 1 ? 'MALE' : `${maleCount} MALE`,
                age,
                color,
            });
        }

        if (femaleCount > 0) {
            rows.push({
                species,
                quantity: formatVhcHeadCount(femaleCount),
                sex: femaleCount === 1 ? 'FEMALE' : `${femaleCount} FEMALE`,
                age,
                color,
            });
        }
    }

    while (rows.length < minRows) {
        rows.push({ species: '', quantity: '', sex: '', age: '', color: '' });
    }

    return rows;
};

// Diri kuhaon ang SLH control number sa VHC.
export const getVhcControlNumber = (record) => {
    if (record?.slh) {
        return record.slh.startsWith('SLH') ? record.slh : `SLH – ${record.slh}`;
    }

    return `SLH – ${String(record?.id ?? '').padStart(4, '0')}`;
};

// Diri i-convert ang petsa ngadto sa YYYY-MM-DD para sa input.
export const toInputDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
};

// Diri himuon ang payload sa VHC para i-save.
export const buildVhcPayload = (record, overrides = {}) => ({
    name: record.name ?? '',
    age: record.age ?? '',
    color: record.color ?? '',
    contact_number: record.contact_number ?? '',
    purpose: record.purpose ?? '',
    origin: record.origin ?? DEFAULT_VHC_ORIGIN,
    animals_origin: record.animals_origin ?? '',
    destination: record.destination ?? '',
    slh: record.slh ?? '',
    issued_on: toInputDate(record.issued_on),
    valid_till: toInputDate(record.valid_till),
    or_number: record.or_number ?? '',
    amount_paid: record.amount_paid ?? '',
    issued_at: record.issued_at ?? DEFAULT_VHC_ISSUED_AT,
    inspected_by: record.inspected_by ?? '',
    ...overrides,
});

// Diri kuhaon ang livestock list gikan sa VHC record.
export const livestockFromRecord = (record) =>
    (record?.livestock || []).map((entry) => ({
        species_id: entry.species_id,
        male_count: entry.male_count ?? '',
        female_count: entry.female_count ?? '',
    }));

// Diri kuhaon ang animal type name sa species.
export const getSpeciesTypeName = (speciesItem) =>
    speciesItem?.animal_type?.type_name || speciesItem?.animalType?.type_name || '';

// Diri kuhaon ang VHC fee matag ulo sa species.
export const getSpeciesVhcFee = (speciesItem, fees) => {
    const customFee = Number(speciesItem?.vhc_fee);
    if (!Number.isNaN(customFee) && customFee > 0) {
        return customFee;
    }

    const typeName = getSpeciesTypeName(speciesItem);
    if (typeName === 'Livestock') return Number(fees?.livestock) || 0;
    if (typeName === 'Poultry') return Number(fees?.poultry) || 0;
    return 0;
};

// Diri kuwentahon ang total nga bayad sa VHC.
export const calculateVhcAmount = (livestock, speciesList, fees) => {
    const certificateFee = Number(fees?.certificate) || 0;
    let total = certificateFee;

    for (const entry of livestock || []) {
        const speciesItem = (speciesList || []).find((s) => s.id === entry.species_id);
        const headCount = (Number(entry.male_count) || 0) + (Number(entry.female_count) || 0);
        total += headCount * getSpeciesVhcFee(speciesItem, fees);
    }

    return Math.round(total * 100) / 100;
};

// Diri ang Edit button nga naay icon.
export function EditButton({ onClick, label = 'Edit' }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 ring-1 ring-violet-200 transition hover:bg-violet-50"
        >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            {label}
        </button>
    );
}

// Diri ang form field nga naay label ug error.
export function FormField({ label, required, error, children }) {
    return (
        <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
                {label} {required && <span className="text-rose-500">*</span>}
            </label>
            {children}
            {error && <p className="text-xs text-rose-500">{formatVhcError(error)}</p>}
        </div>
    );
}

/** Normalize legacy validation messages for certificate fields. */
// Diri usbon ang daan nga validation message sa VHC.
export const formatVhcError = (message) => {
    if (!message || typeof message !== 'string') return message;

    return message
        .replace(/paid under/gi, 'O.R Number')
        .replace(/paid_under/gi, 'O.R Number')
        .replace(/or number/gi, 'O.R Number');
};

export const inputClass =
    'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-500/15';

export const readOnlyClass =
    'w-full rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-sm text-slate-600';

// Diri ang banner sa flash message.
export function FlashBanner({ message }) {
    if (!message) return null;
    return (
        <div
            className={`rounded-xl border px-4 py-3 text-sm ${
                message.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
        >
            {message.text}
        </div>
    );
}

// Diri ang titulo sa section nga naay kolor nga accent.
export function SectionTitle({ children, accent = 'violet' }) {
    const accents = {
        violet: 'bg-violet-500',
        emerald: 'bg-emerald-500',
        blue: 'bg-blue-500',
        amber: 'bg-amber-500',
    };

    return (
        <h3 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
            <span className={`h-4 w-1 rounded-full ${accents[accent] || accents.violet}`} />
            {children}
        </h3>
    );
}

// Diri ang box sa usa ka detail nga label ug value.
export function DetailField({ label, value, className = '' }) {
    return (
        <div className={`rounded-xl border border-slate-100 bg-slate-50/80 p-4 ${className}`}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
            <p className="mt-1.5 text-sm font-medium text-slate-900">{value || '—'}</p>
        </div>
    );
}

// Diri ang kolor nga badge label.
export function Badge({ children, tone = 'neutral' }) {
    return (
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ${toneClasses[tone]}`}>
            {children}
        </span>
    );
}

// Diri ang card sa usa ka statistic.
export function StatCard({ label, value, hint, icon }) {
    return (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
                    <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
                    {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 ring-1 ring-violet-100">
                    {icon}
                </div>
            </div>
        </div>
    );
}

// Diri ang base layout sa modal nga naay header ug footer.
export function ModalShell({ title, subtitle, onClose, children, footer, maxWidth = 'max-w-3xl' }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
            <div className={`relative flex max-h-[92vh] w-full ${maxWidth} flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl`}>
                <div className="border-b border-line bg-navy px-6 py-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/60">VHC Certificate</p>
                            <h2 className="mt-1 text-xl font-bold text-white">{title}</h2>
                            {subtitle && <p className="mt-1 text-sm text-white/75">{subtitle}</p>}
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-full p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
                        >
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">{children}</div>
                {footer && <div className="border-t border-slate-100 bg-slate-50/80 px-6 py-4">{footer}</div>}
            </div>
        </div>
    );
}

// Diri ang pagpili sa species ug ihap sa livestock.
export function SpeciesSelector({ species, selected, onToggle, onChange, vhcFees = {} }) {
    return (
        <div className="space-y-3">
            {species.map((s) => {
                const isSelected = selected.some((l) => l.species_id === s.id);
                const entry = selected.find((l) => l.species_id === s.id);
                const headFee = getSpeciesVhcFee(s, vhcFees);

                return (
                    <div
                        key={s.id}
                        className={`rounded-xl border p-4 transition-all ${
                            isSelected
                                ? 'border-violet-200 bg-violet-50/40 ring-1 ring-violet-100'
                                : 'border-slate-200 bg-slate-50/60'
                        }`}
                    >
                        <div className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                id={`species-${s.id}`}
                                checked={isSelected}
                                onChange={() => onToggle(s.id)}
                                className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                            />
                            <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                                <label htmlFor={`species-${s.id}`} className="cursor-pointer truncate text-sm font-semibold text-slate-900">
                                    {s.species_name}
                                </label>
                                <span className="shrink-0 text-xs font-semibold tabular-nums text-violet-600">
                                    {formatCurrency(headFee)}/head
                                </span>
                            </div>
                        </div>
                        {isSelected && (
                            <div className="mt-3 grid grid-cols-2 gap-3 pl-7">
                                <div>
                                    <label className="text-xs font-medium text-slate-500">Male Count</label>
                                    <input
                                        type="number"
                                        value={entry?.male_count ?? ''}
                                        onChange={(e) => onChange(s.id, 'male_count', e.target.value)}
                                        placeholder="0"
                                        min="0"
                                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/15"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-slate-500">Female Count</label>
                                    <input
                                        type="number"
                                        value={entry?.female_count ?? ''}
                                        onChange={(e) => onChange(s.id, 'female_count', e.target.value)}
                                        placeholder="0"
                                        min="0"
                                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/15"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
