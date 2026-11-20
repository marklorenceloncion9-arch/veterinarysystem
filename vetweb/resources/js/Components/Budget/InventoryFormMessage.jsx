import { router } from '@inertiajs/react';

// Diri ipakita ang success o error message sa inventory form.
export default function InventoryFormMessage({ message, lastAddedId, viewHref, summary = null, onClose, className = '' }) {
    if (!message?.text) return null;

    const isSuccess = message.type === 'success';

    if (isSuccess) {
        return (
            <div
                className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
                onClick={onClose}
            >
                <div
                    role="status"
                    className={`w-full rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-2xl ${
                        summary?.length ? 'max-w-lg' : 'max-w-md'
                    }`}
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                        <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                        </svg>
                    </div>
                    <p className="text-xl font-bold text-emerald-800">{summary?.length ? 'Receiving summary' : 'Success'}</p>
                    <p className="mt-3 text-sm leading-relaxed text-gray-600">{message.text}</p>
                    {summary?.length > 0 && (
                        <ul className="mt-5 max-h-72 divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-200 text-left">
                            {summary.map((line) => (
                                <li key={line.key || `${line.medicine_name}-${line.expiration_date}`} className="flex items-center justify-between gap-3 px-4 py-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-slate-900">{line.medicine_name}</p>
                                        <p className="mt-0.5 text-xs text-slate-500">
                                            {line.category_name ? `${line.category_name} · ` : ''}
                                            Expires {line.expiration_date}
                                        </p>
                                    </div>
                                    <p className="shrink-0 text-sm font-semibold tabular-nums text-emerald-700">
                                        +{line.quantity} {line.unit_name}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    )}
                    <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                        {lastAddedId && viewHref ? (
                            <button
                                type="button"
                                onClick={() => router.visit(viewHref)}
                                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
                            >
                                View
                            </button>
                        ) : null}
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            role="alert"
            className={`rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 ${className}`}
        >
            <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </span>
                <div>
                    <p className="font-semibold">Something went wrong</p>
                    <p className="mt-0.5">{message.text}</p>
                </div>
            </div>
        </div>
    );
}
