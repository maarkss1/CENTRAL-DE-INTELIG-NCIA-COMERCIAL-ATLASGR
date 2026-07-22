import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { toast, ToastMessage } from '../../lib/toast';

const KIND_STYLES: Record<ToastMessage['kind'], { accent: string; icon: typeof CheckCircle2 }> = {
    success: { accent: 'text-green-600 bg-green-100', icon: CheckCircle2 },
    error: { accent: 'text-red-600 bg-red-100', icon: AlertTriangle },
    info: { accent: 'text-atlas-orange bg-atlas-orange/10', icon: Info },
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

    return (
        <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2.5 max-w-sm">
            <AnimatePresence initial={false}>
                {toasts.map((t) => {
                    const { accent, icon: Icon } = KIND_STYLES[t.kind];
                    return (
                        <motion.div
                            key={t.id}
                            layout
                            initial={{ opacity: 0, y: 16, scale: 0.94 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, x: 40, scale: 0.94, transition: { duration: 0.18 } }}
                            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                            className="glass-panel-strong elevation-3 flex items-start gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-atlas-dark"
                        >
                            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${accent}`}>
                                <Icon className="h-4 w-4" />
                            </span>
                            <span className="flex-1 pt-0.5">{t.text}</span>
                            <button
                                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                                className="shrink-0 rounded-md p-1 text-slate-400 opacity-70 transition-opacity hover:bg-black/5 hover:opacity-100"
                                aria-label="Fechar notificação"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}
