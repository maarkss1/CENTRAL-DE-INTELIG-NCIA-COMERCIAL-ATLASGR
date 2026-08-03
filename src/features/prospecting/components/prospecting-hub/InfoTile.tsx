import { type LucideIcon } from 'lucide-react';

export function InfoTile({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
    return (
        <div className="bg-surface-2 rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-ink-2 mb-1">
                <Icon size={12} />
                <span className="text-[10px] tracking-wider font-bold uppercase">{label}</span>
            </div>
            <p className="text-sm font-bold text-ink truncate" title={value}>{value}</p>
        </div>
    );
}
