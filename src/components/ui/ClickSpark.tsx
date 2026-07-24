import { useEffect, useState } from 'react';

interface Spark {
    id: number;
    x: number;
    y: number;
}

export function ClickSpark() {
    const [sparks, setSparks] = useState<Spark[]>([]);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            const newSpark = {
                id: Date.now() + Math.random(),
                x: e.clientX,
                y: e.clientY,
            };

            setSparks(prev => [...prev.slice(-10), newSpark]);

            setTimeout(() => {
                setSparks(prev => prev.filter(s => s.id !== newSpark.id));
            }, 600);
        };

        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    return (
        <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
            {sparks.map(spark => (
                <div
                    key={spark.id}
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{ left: spark.x, top: spark.y }}
                >
                    <span className="block h-8 w-8 animate-ping rounded-full bg-gradient-to-r from-orange-500/40 via-amber-400/30 to-blue-500/40 blur-xs" />
                    <span className="absolute inset-0 block h-4 w-4 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-orange-400 opacity-80" />
                </div>
            ))}
        </div>
    );
}
