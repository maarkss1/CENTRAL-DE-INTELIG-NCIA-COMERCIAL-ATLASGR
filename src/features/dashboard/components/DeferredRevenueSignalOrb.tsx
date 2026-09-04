import { lazy, Suspense, useEffect, useRef, useState } from 'react';

const RevenueSignalOrb = lazy(() =>
  import('./RevenueSignalOrb').then((module) => ({ default: module.RevenueSignalOrb })),
);

interface DeferredRevenueSignalOrbProps {
  conversionRate: number;
  pendingActivities: number;
  closedThisMonth: number;
}

export function DeferredRevenueSignalOrb(props: DeferredRevenueSignalOrbProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;

    if (!('IntersectionObserver' in window)) {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: '180px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={hostRef} className="min-h-[16rem]" data-testid="revenue-signal-orb">
      {shouldLoad ? (
        <Suspense
          fallback={
            <div className="min-h-[16rem] animate-pulse rounded-[1.6rem] border border-line bg-surface-2/60 shadow-card" />
          }
        >
          <RevenueSignalOrb {...props} />
        </Suspense>
      ) : (
        <div className="min-h-[16rem] rounded-[1.6rem] border border-line bg-surface/80 shadow-card" />
      )}
    </div>
  );
}
