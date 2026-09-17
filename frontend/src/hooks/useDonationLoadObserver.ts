import { useEffect, useState } from 'react';

interface DonationLoadObserverOptions {
    hasMore: boolean;
    isLoading: boolean;
    onLoadMore: () => void | Promise<void>;
}

export function useDonationLoadObserver({
    hasMore,
    isLoading,
    onLoadMore,
}: DonationLoadObserverOptions) {
    const [container, containerRef] = useState<HTMLDivElement | null>(null);
    const [sentinel, sentinelRef] = useState<HTMLTableRowElement | null>(null);

    useEffect(() => {
        if (!hasMore || isLoading || !container || !sentinel) return;

        const observer = new IntersectionObserver(([entry]) => {
            if (entry?.isIntersecting) void onLoadMore();
        }, {
            root: container,
            rootMargin: '240px 0px',
            threshold: 0.1,
        });

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [container, sentinel, hasMore, isLoading, onLoadMore]);

    return { containerRef, sentinelRef };
}
