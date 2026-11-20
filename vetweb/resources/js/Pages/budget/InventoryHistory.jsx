import { Link } from '@inertiajs/react';
import Sidebar from '@/Components/Budget/BudgetSidebar';
import BudgetNotificationBell from '@/Components/Budget/BudgetNotificationBell';
import StockEntryHistory from '@/Components/Budget/StockEntryHistory';

// Diri ang page sa history sa new item ug receiving.
export default function InventoryHistory({ inventoryId = null, search = '', from = null }) {
    const backHref = inventoryId
        ? `/budget/inventory/${inventoryId}`
        : from === 'add'
          ? '/budget/inventory/add'
          : '/budget/inventory';
    const backLabel = inventoryId ? 'Back to item' : from === 'add' ? 'Back to add inventory' : 'Back to inventory';

    return (
        <div className="flex h-screen overflow-hidden bg-canvas">
            <Sidebar />
            <main className="staff-main flex min-h-0 flex-1 flex-col">
                <div className="flex min-h-0 flex-1 flex-col px-6 py-5">
                    <div className="mb-5 shrink-0">
                        <Link
                            href={backHref}
                            className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                        >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                            </svg>
                            {backLabel}
                        </Link>
                        <div className="flex items-end justify-between gap-4">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700">
                                    Stock control
                                </p>
                                <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">History</h1>
                                <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-slate-500">
                                    New items and receiving. Filter by type, search, or date.
                                </p>
                            </div>
                            <BudgetNotificationBell />
                        </div>
                    </div>

                    <StockEntryHistory
                        initialSearch={search || ''}
                        currentInventoryId={inventoryId || null}
                        fill
                    />
                </div>
            </main>
        </div>
    );
}
