import React, { useState, useEffect } from 'react';
import { TimelineEvent } from '../../../types';
import { History, Activity, MessageCircle, ArrowRight, User } from 'lucide-react';
import { clientLogger } from '../../../lib/clientLogger';

interface TimelineProps {
    leadId: string;
}

export function Timeline({ leadId }: TimelineProps) {
    const [events, setEvents] = useState<TimelineEvent[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchTimeline = async () => {
            try {
                // In a real app, this would be a dedicated endpoint or included in the lead details
                const res = await fetch(`/api/leads/${leadId}`);
                if (res.ok) {
                    const data = await res.json();
                    setEvents(data.timeline || []);
                }
            } catch (error) {
                clientLogger.error({ err: error }, 'Error fetching timeline');
            } finally {
                setLoading(false);
            }
        };
        fetchTimeline();
    }, [leadId]);

    const getEventIcon = (type: string) => {
        switch (type) {
            case 'creation': return <User className="w-4 h-4" />;
            case 'movement': return <ArrowRight className="w-4 h-4" />;
            case 'activity': return <Activity className="w-4 h-4" />;
            case 'comment': return <MessageCircle className="w-4 h-4" />;
            default: return <History className="w-4 h-4" />;
        }
    };

    const getEventColor = (type: string) => {
        switch (type) {
            case 'creation': return 'bg-blue-100 text-blue-600 border-blue-200';
            case 'movement': return 'bg-orange-100 text-orange-600 border-orange-200';
            case 'activity': return 'bg-green-100 text-green-600 border-green-200';
            case 'comment': return 'bg-purple-100 text-purple-600 border-purple-200';
            default: return 'bg-surface-2 text-ink-2 border-line';
        }
    };

    if (loading) {
        return <div className="p-4 text-center text-sm text-ink-2">Carregando timeline...</div>;
    }

    if (events.length === 0) {
        return <div className="p-4 text-center text-sm text-ink-2">Nenhum evento registrado.</div>;
    }

    return (
        <div className="space-y-4">
            <h3 className="font-semibold text-ink flex items-center gap-2 mb-4">
                <History className="w-4 h-4" /> Histórico
            </h3>
            <div className="relative border-l-2 border-line ml-3 space-y-6">
                {events.map((event) => (
                    <div key={event.id} className="relative pl-6">
                        <div className={`absolute -left-[11px] top-1 w-5 h-5 rounded-full border flex items-center justify-center ${getEventColor(event.type)}`}>
                            {React.cloneElement(getEventIcon(event.type) as React.ReactElement<{ className?: string }>, { className: 'w-2.5 h-2.5' })}
                        </div>
                        <div>
                            <p className="text-sm text-ink">{event.description}</p>
                            <span className="text-xs text-ink-2 mt-1 block">
                                {new Date(event.createdAt).toLocaleString('pt-BR')}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
