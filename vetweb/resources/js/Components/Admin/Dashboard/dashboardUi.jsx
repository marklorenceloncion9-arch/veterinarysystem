import { Link } from '@inertiajs/react';
import { useState } from 'react';

// Diri ang mga kulay sa chart. Parehas ra sa theme sa tibuok system.
export const COLORS = {
    navy: '#16324f',
    teal: '#1f7a8c',
    blue: '#3c91e6',
    green: '#2e8b57',
    amber: '#d99a00',
    red: '#d64545',
    grid: '#eceff3',
    axis: '#6b7280',
};

export const SPECIES_PALETTE = ['#16324f', '#1f7a8c', '#3c91e6', '#d99a00', '#2e8b57', '#8a6fb5', '#c9764a', '#7a8794'];

export const STATUS_COLORS = {
    pending: '#d99a00',
    approved: '#3c91e6',
    processing: '#1f7a8c',
    ongoing: '#16324f',
    completed: '#2e8b57',
    cancelled: '#d64545',
    rejected: '#a83232',
};

export const STATUS_CHIPS = {
    pending: 'bg-amber-50 text-amber-700',
    approved: 'bg-blue-50 text-blue-700',
    processing: 'bg-teal/10 text-teal-dark',
    ongoing: 'bg-navy/10 text-navy',
    completed: 'bg-emerald-50 text-emerald-700',
    cancelled: 'bg-red-50 text-red-700',
};

export const TYPE_LABELS = {
    appointment: 'Clinic',
    walk_in: 'Walk-in',
    home_service: 'Home service',
};

// Diri i-format ang kwarta sa peso.
export function formatCurrency(value) {
    return `₱${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

// Diri i-format ang numero nga naay comma.
export function formatNumber(value) {
    return Number(value || 0).toLocaleString();
}

// Diri i-total ang mga value sa series.
export function sumSeries(items, key = 'value') {
    return (items || []).reduce((sum, item) => sum + Number(item[key] ?? item.count ?? 0), 0);
}

// Diri kwentahon ang percent sa value.
export function formatPercent(value, total) {
    const amount = Number(value || 0);
    const whole = Number(total || 0);
    if (whole <= 0) return '0%';
    return `${Math.round((amount / whole) * 100)}%`;
}

// Diri kwentahon ang kausaban sa karon nga bulan batok sa miaging bulan.
export function monthChange(series) {
    if (!Array.isArray(series) || series.length < 2) return null;

    const current = Number(series[series.length - 1]?.value) || 0;
    const previous = Number(series[series.length - 2]?.value) || 0;
    const previousLabel = series[series.length - 2]?.label || 'last month';

    if (current === previous) {
        return { label: `Same as ${previousLabel}`, tone: 'flat' };
    }

    if (previous <= 0) {
        return { label: `Up from ${previousLabel}`, tone: 'up' };
    }

    const pct = Math.round(((current - previous) / previous) * 100);

    return {
        label: `${pct > 0 ? '+' : ''}${pct}% vs ${previousLabel}`,
        tone: pct > 0 ? 'up' : 'down',
    };
}

// Diri ang gamay nga text sa kausaban (taas, ubos, o parehas).
export function ChangeText({ change }) {
    if (!change) return null;

    const tone = change.tone === 'up'
        ? 'text-success'
        : change.tone === 'down'
            ? 'text-danger'
            : 'text-muted';

    const arrow = change.tone === 'up' ? '↑' : change.tone === 'down' ? '↓' : '→';

    return (
        <span className={`text-xs font-medium ${tone}`}>
            {arrow} {change.label}
        </span>
    );
}

// Diri ang tooltip sa tanang chart kung i-hover.
export function ChartTooltip({ active, payload, label, formatValue = formatNumber, total, unit }) {
    if (!active || !payload?.length) return null;

    const item = payload[0];
    const row = item?.payload || {};
    const raw = item?.value ?? row.count ?? row.value ?? 0;
    const title = row.full_label || row.label || row.name || item?.name || label || '';
    const percent = total ? formatPercent(raw, total) : null;

    return (
        <div className="rounded-md border border-line bg-white px-3 py-2 shadow-lg">
            <p className="max-w-[220px] text-xs text-muted">{title}</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-navy">
                {formatValue(raw)}
                {unit ? <span className="ml-1 font-normal text-muted">{unit}</span> : null}
                {percent ? <span className="ml-2 text-xs font-medium text-teal">{percent}</span> : null}
            </p>
        </div>
    );
}

// Diri ang message kung walay data ang chart.
export function ChartEmpty({ message = 'No data yet.', height = 'h-40' }) {
    return (
        <div className={`flex ${height} items-center justify-center rounded-md border border-dashed border-line text-sm text-muted`}>
            {message}
        </div>
    );
}

// Diri ang puti nga box nga naay title para sa mga section.
export function Panel({ title, subtitle, action, children, className = '' }) {
    return (
        <section className={`rounded-lg border border-line bg-white p-5 shadow-card ${className}`}>
            {(title || action) && (
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                        {title && <h2 className="text-base font-semibold text-navy">{title}</h2>}
                        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
                    </div>
                    {action}
                </div>
            )}
            {children}
        </section>
    );
}

// Diri ang gamay nga toggle (pananglitan 3M / 6M / 12M).
export function Segmented({ options, value, onChange, label }) {
    return (
        <div className="inline-flex rounded-md border border-line bg-canvas p-0.5" role="group" aria-label={label}>
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    onClick={() => onChange(option.value)}
                    aria-pressed={option.value === value}
                    className={`rounded px-3 py-1 text-sm font-medium transition ${
                        option.value === value
                            ? 'bg-white text-navy shadow-sm'
                            : 'text-muted hover:text-navy'
                    }`}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

// Diri ang listahan nga naay bar. Kung i-hover ang usa ka linya, mo-highlight ra kini.
export function BarList({ items, total, unit = '', empty = 'No data yet.' }) {
    const [active, setActive] = useState(null);

    const rows = (items || []).filter((item) => Number(item.value) > 0);

    if (rows.length === 0) {
        return <ChartEmpty message={empty} height="h-40" />;
    }

    const max = Math.max(...rows.map((item) => Number(item.value)), 1);
    const whole = total ?? sumSeries(rows, 'value');

    return (
        <ul className="space-y-0.5" onMouseLeave={() => setActive(null)}>
            {rows.map((item, index) => {
                const percent = formatPercent(item.value, whole);
                const content = (
                    <>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="min-w-0 truncate text-ink">{item.label}</span>
                            <span className="shrink-0 tabular-nums">
                                <span className="font-semibold text-navy">{formatNumber(item.value)}</span>
                                <span className="ml-2 inline-block w-9 text-right text-muted">{percent}</span>
                            </span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line/70">
                            <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${(Number(item.value) / max) * 100}%`, backgroundColor: item.color }}
                            />
                        </div>
                    </>
                );
                const className = `block rounded-md px-2 py-1.5 transition ${
                    active === index ? 'bg-canvas' : ''
                } ${active !== null && active !== index ? 'opacity-50' : ''}`;
                const title = `${item.label}: ${formatNumber(item.value)}${unit ? ` ${unit}` : ''} (${percent})`;

                return (
                    <li key={item.label} onMouseEnter={() => setActive(index)}>
                        {item.href ? (
                            <Link href={item.href} className={className} title={title}>{content}</Link>
                        ) : (
                            <div className={className} title={title}>{content}</div>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}
