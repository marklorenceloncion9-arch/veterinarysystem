import { useEffect, useState } from 'react';
import { usePage } from '@inertiajs/react';

// Diri ang sidebar frame nga mo-slide sa mobile.
export default function ResponsiveSidebarFrame({ brandTitle, brandSubtitle, children }) {
    const { url } = usePage();
    const [open, setOpen] = useState(false);
    // Diri isira ang mobile sidebar.
    const close = () => setOpen(false);

    useEffect(() => {
        setOpen(false);
    }, [url]);

    useEffect(() => {
        if (!open) return undefined;

        // Diri isira ang sidebar kung i-press ang Escape.
        const onKey = (event) => {
            if (event.key === 'Escape') setOpen(false);
        };

        document.addEventListener('keydown', onKey);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = previousOverflow;
        };
    }, [open]);

    return (
        <>
            <div className="staff-mobile-bar fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-line bg-white px-3 print:hidden lg:hidden">
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-canvas text-navy"
                    aria-label="Open navigation menu"
                >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                </button>
                <img
                    src="/images/el_salvador_city_vet_logo.png"
                    alt="Office of the City Veterinarian logo"
                    className="h-9 w-9 shrink-0 rounded-full bg-white object-contain"
                />
                <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-navy">{brandTitle}</p>
                    <p className="truncate text-[11px] font-medium text-teal">{brandSubtitle}</p>
                </div>
            </div>

            {open ? (
                <button
                    type="button"
                    className="staff-sidebar-backdrop fixed inset-0 z-40 bg-navy/50 print:hidden lg:hidden"
                    aria-label="Close navigation menu"
                    onClick={close}
                />
            ) : null}

            <aside
                className={`staff-sidebar fixed left-0 top-0 z-50 flex h-dvh w-72 flex-col bg-navy text-white transition-transform duration-200 print:hidden ${
                    open ? 'translate-x-0' : '-translate-x-full'
                } lg:translate-x-0`}
            >
                <div className="shrink-0 border-b border-white/10 px-4 py-5 lg:px-6 lg:py-6">
                    <div className="flex items-center gap-3.5">
                        <div className="h-11 w-11 overflow-hidden rounded-full border border-white/15 bg-white">
                            <img
                                src="/images/el_salvador_city_vet_logo.png"
                                alt="Office of the City Veterinarian logo"
                                className="h-full w-full object-contain"
                            />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h1 className="truncate text-lg font-bold tracking-tight !text-white">{brandTitle}</h1>
                            <p className="text-xs font-medium text-teal">{brandSubtitle}</p>
                        </div>
                        <button
                            type="button"
                            onClick={close}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white lg:hidden"
                            aria-label="Close navigation menu"
                        >
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
                <div
                    className="flex min-h-0 flex-1 flex-col"
                    onClick={(event) => {
                        if (event.target.closest('a')) close();
                    }}
                >
                    {children}
                </div>
            </aside>
        </>
    );
}
