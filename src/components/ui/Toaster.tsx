import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { toast, ToastMessage } from '../../lib/toast';

const KIND_STYLES: Record<ToastMessage['kind'], { bg: string; icon: typeof CheckCircle2 }> = {
    success: { bg: 'bg-green-600', icon: CheckCircle2 },
    error: { bg: 'bg-red-600', icon: AlertTriangle },
    info: { bg: 'bg-atlas-dark', icon: Info },
};

const AUTO_DISMISS_MS = 4500;

export function Toaster() {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    useEffect(() => {
        return toast.subscribe((message) => {
            setToasts((prev) => [...prev, message]);
            setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== message.id));
            }, AUTO_DISMISS_MS);
        });
    }, []);

    if (toasts.length === 0) return null;

    return (
        <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 max-w-sm">
            {toasts.map((t) => {
                const { bg, icon: Icon } = KIND_STYLES[t.kind];
                return (
                    <div
                        key={t.id}
                        className={`${bg} text-white px-4 py-3 rounded-xl shadow-lg flex items-start gap-2.5 text-sm font-medium animate-toast-in`}
                    >
                        <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                        <span className="flex-1">{t.text}</span>
                        <button
                            type="button"
                            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                            aria-label="Fechar notificação"
                            className="shrink-0 opacity-70 hover:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
