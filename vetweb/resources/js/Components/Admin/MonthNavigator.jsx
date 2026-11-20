import { useRef } from 'react';

// Diri kuhaon ang current month nga YYYY-MM.
export function currentMonthValue() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Diri iusab ang bulan paatras o paabante.
export function shiftMonth(monthValue, delta) {
    const [year, month] = monthValue.split('-').map(Number);
    const date = new Date(year, month - 1 + delta, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Diri i-format ang bulan nga label sama sa "January 2026".
export function formatMonthLabel(monthValue) {
    if (!monthValue) return 'Select month';

    const [year, month] = monthValue.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
    });
}

const navBtnClass =
    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50';

// Diri ang navigator sa pagpili ug bulan.
export default function MonthNavigator({ value, onChange, className = '' }) {
    const inputRef = useRef(null);

    // Diri ablihan ang native month picker.
    const openPicker = () => {
        if (inputRef.current?.showPicker) {
            inputRef.current.showPicker();
        } else {
            inputRef.current?.click();
        }
    };

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            <button
                type="button"
                onClick={() => onChange(shiftMonth(value, -1))}
                className={navBtnClass}
                aria-label="Previous month"
            >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
            </button>

            <button
                type="button"
                onClick={openPicker}
                className="flex h-10 min-w-[11rem] flex-1 items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50"
            >
                <span className="truncate">{formatMonthLabel(value)}</span>
                <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                </svg>
            </button>
            <input
                ref={inputRef}
                type="month"
                value={value}
                onChange={(e) => {
                    if (e.target.value) onChange(e.target.value);
                }}
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
            />

            <button
                type="button"
                onClick={() => onChange(shiftMonth(value, 1))}
                className={navBtnClass}
                aria-label="Next month"
            >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
            </button>
        </div>
    );
}
