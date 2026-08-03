import { Clock, User, CheckCircle2, MessageSquare, AlertCircle } from 'lucide-react';

export interface TimelineItem {
  id: string;
  title: string;
  description?: string;
  timestamp: string;
  author?: string;
  type?: 'activity' | 'note' | 'status_change' | 'alert';
}

interface TimelineProps {
  items: TimelineItem[];
  emptyMessage?: string;
}

export function Timeline({ items, emptyMessage = 'Nenhuma atividade registrada ainda.' }: TimelineProps) {
  if (!items || items.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-ink-2 italic bg-surface-2 rounded-xl border border-line">
        {emptyMessage}
      </div>
    );
  }

  const getIcon = (type?: TimelineItem['type']) => {
    switch (type) {
      case 'note':
        return <MessageSquare className="w-3.5 h-3.5 text-blue-400" />;
      case 'status_change':
        return <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />;
      case 'alert':
        return <AlertCircle className="w-3.5 h-3.5 text-amber-400" />;
      default:
        return <Clock className="w-3.5 h-3.5 text-atlas-orange" />;
    }
  };

  return (
    <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-line">
      {items.map((item) => (
        <div key={item.id} className="relative group">
          <div className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-surface-2 border border-line flex items-center justify-center shadow-md">
            {getIcon(item.type)}
          </div>
          <div className="glass-card p-3 rounded-xl border border-line text-xs space-y-1 hover:border-line transition-all">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-ink">{item.title}</span>
              <span className="text-[10px] text-ink-2">{item.timestamp}</span>
            </div>
            {item.description && (
              <p className="text-ink-2 leading-relaxed">{item.description}</p>
            )}
            {item.author && (
              <div className="flex items-center gap-1 text-[10px] text-ink-2 pt-1 border-t border-line">
                <User className="w-3 h-3 text-atlas-orange" />
                <span>{item.author}</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
