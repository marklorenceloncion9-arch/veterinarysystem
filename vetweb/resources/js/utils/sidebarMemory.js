import { useLayoutEffect, useRef } from 'react';

const memory = {
    admin: { scrollTop: 0, revenueOpen: false, reportsOpen: false, seen: false },
    budget: { scrollTop: 0 },
};

// Diri kuhaon ang na-save nga state sa sidebar.
export function getSidebarMemory(key) {
    return memory[key];
}

// Diri i-scroll aron makita ang active link sa sidebar.
function revealInContainer(container, child) {
    if (!container || !child) return;

    const containerRect = container.getBoundingClientRect();
    const childRect = child.getBoundingClientRect();

    if (childRect.top < containerRect.top) {
        container.scrollTop -= containerRect.top - childRect.top;
    } else if (childRect.bottom > containerRect.bottom) {
        container.scrollTop += childRect.bottom - containerRect.bottom;
    }
}

// Diri hinumdoman ug ibalik ang scroll sa sidebar nav.
export function useSidebarNavScroll(key, url) {
    const ref = useRef(null);
    const bucket = memory[key];

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return undefined;

        el.scrollTop = bucket.scrollTop || 0;
        revealInContainer(el, el.querySelector('[data-nav-active="true"]'));
        bucket.scrollTop = el.scrollTop;

        // Diri i-save ang scroll position samtang mag-scroll.
        const onScroll = () => {
            bucket.scrollTop = el.scrollTop;
        };

        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, [bucket, url]);

    return ref;
}
