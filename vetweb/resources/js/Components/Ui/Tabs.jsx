import { Link } from '@inertiajs/react';

// Diri himuon ang CSS class sa tab button.
function itemClass(active, variant, fullWidth) {
    const width = fullWidth ? 'flex-1 justify-center' : '';

    if (variant === 'segmented') {
        return `inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-[15px] font-semibold leading-snug transition-colors ${width} ${
            active
                ? 'bg-white text-navy shadow-sm'
                : 'text-muted hover:bg-white/80 hover:text-navy'
        }`;
    }

    return `relative -mb-px inline-flex min-h-12 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-[15px] font-semibold leading-snug transition-colors ${width} ${
        active
            ? 'border-teal text-navy'
            : 'border-transparent text-muted hover:border-line hover:text-navy'
    }`;
}

// Diri ang count badge sa tab.
function Count({ value, active, tone = 'default' }) {
    if (value == null || value === '' || Number(value) <= 0) return null;

    if (tone === 'alert') {
        return (
            <span className="inline-flex min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums text-white">
                {Number(value) > 99 ? '99+' : value}
            </span>
        );
    }

    const toneClass =
        tone === 'danger'
            ? active
                ? 'bg-danger text-white'
                : 'bg-red-50 text-danger'
            : active
                ? 'bg-teal/10 text-teal'
                : 'bg-canvas text-muted';

    return (
        <span className={`inline-flex min-w-[1.35rem] items-center justify-center rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${toneClass}`}>
            {value}
        </span>
    );
}

// Diri ang reusable nga tabs component.
export default function Tabs({
    items = [],
    value,
    onChange,
    variant = 'line',
    fullWidth = false,
    className = '',
}) {
    const shellClass =
        variant === 'segmented'
            ? `inline-flex max-w-full flex-wrap gap-1 rounded-lg border border-line bg-canvas p-1 ${className}`
            : `flex max-w-full flex-wrap gap-x-1 overflow-hidden border-b border-line ${className}`;

    return (
        <div className={shellClass} role="tablist">
            {items.map((item) => {
                const active = String(value) === String(item.id);
                const className = itemClass(active, variant, fullWidth);
                const content = (
                    <>
                        {item.icon ? (
                            <span className={active ? 'text-teal' : 'text-muted'}>{item.icon}</span>
                        ) : null}
                        <span>{item.label}</span>
                        <Count value={item.count} active={active} tone={item.tone} />
                    </>
                );

                if (item.href) {
                    return (
                        <Link
                            key={item.id}
                            href={item.href}
                            role="tab"
                            aria-selected={active}
                            className={className}
                        >
                            {content}
                        </Link>
                    );
                }

                return (
                    <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange?.(item.id)}
                        className={className}
                    >
                        {content}
                    </button>
                );
            })}
        </div>
    );
}
