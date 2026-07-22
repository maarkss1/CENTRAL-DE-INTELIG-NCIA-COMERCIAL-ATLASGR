import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Activity } from '../../../types';
import { Card } from '../../../components/ui/Card';
import { staggerContainer, staggerItem, fadeInUp } from '../../../lib/motion';
import {
    IconCalendar, IconClock, IconPhone, IconMail, IconChat, IconContacts, IconActivity,
    IconSpinner, IconCheck,
} from '../../../components/icons';
import type { AtlasIconProps } from '../../../components/icons';

const TYPE_META: Record<string, { icon: React.ComponentType<AtlasIconProps>; className: string }> = {
    'ligação': { icon: IconPhone, className: 'bg-blue-50 text-blue-700' },
    'e-mail': { icon: IconMail, className: 'bg-violet-50 text-violet-700' },
    'whatsapp': { icon: IconChat, className: 'bg-green-50 text-green-700' },
    'reunião': { icon: IconContacts, className: 'bg-amber-50 text-amber-700' },
    'visita': { icon: IconCalendar, className: 'bg-cyan-50 text-cyan-700' },
    'follow-up': { icon: IconActivity, className: 'bg-rose-50 text-rose-700' },
    'tarefa': { icon: IconCheck, className: 'bg-emerald-50 text-emerald-700' },
};
const DEFAULT_TYPE_META = { icon: IconActivity, className: 'bg-slate-100 text-slate-700' };

export function ActivityList() {
    const [activities, setActivities] = useState<Activity[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchActivities = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/activities');
            if (res.ok) {
                const data = await res.json();
                setActivities(data);
            }
        } catch (error) {
            console.error('Error fetching activities:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchActivities();
    }, []);

    const handleStatusToggle = async (activity: Activity) => {
        const newStatus = activity.status === 'Pendente' ? 'Concluída' : 'Pendente';
        try {
            const res = await fetch(`/api/activities/${activity.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            if (res.ok) {
                setActivities(prev => prev.map(a => a.id === activity.id ? { ...a, status: newStatus } : a));
            }
        } catch (error) {
            console.error('Error updating activity status:', error);
        }
    };

    return (
        <div className="flex-1 overflow-y-auto bg-gray-50/50 p-8">
            <div className="max-w-5xl mx-auto space-y-6">
                <motion.div variants={fadeInUp} initial="hidden" animate="show">
                    <h1 className="text-2xl font-bold text-atlas-dark flex items-center gap-2.5">
                        <IconCalendar className="w-6 h-6 text-atlas-orange" />
                        Atividades
                    </h1>
                    <p className="text-atlas-dark/50 mt-1">Gerencie suas tarefas e compromissos</p>
                </motion.div>

                <Card className="overflow-hidden">
                    {loading ? (
                        <div className="p-10 text-center text-atlas-dark/40 flex items-center justify-center gap-2">
                            <IconSpinner className="w-5 h-5 text-atlas-orange animate-spin" />
                            Carregando atividades...
                        </div>
                    ) : activities.length === 0 ? (
                        <div className="p-10 text-center text-atlas-dark/40 flex flex-col items-center gap-2">
                            <IconCalendar className="w-6 h-6 text-atlas-dark/20" />
                            Nenhuma atividade agendada.
                        </div>
                    ) : (
                        <motion.div variants={staggerContainer(0.04)} initial="hidden" animate="show" className="divide-y divide-black/5">
                            {activities.map(activity => {
                                const meta = TYPE_META[activity.type.toLowerCase()] ?? DEFAULT_TYPE_META;
                                return (
                                    <motion.div key={activity.id} variants={staggerItem} className="p-4 hover:bg-black/[0.015] transition-colors flex items-center gap-4 group">
                                        <button
                                            onClick={() => handleStatusToggle(activity)}
                                            className={`shrink-0 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${activity.status === 'Concluída' ? 'bg-green-500 border-green-500 text-white' : 'border-black/15 text-transparent hover:border-green-400'}`}
                                        >
                                            <IconCheck className="w-3.5 h-3.5" />
                                        </button>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-semibold ${meta.className}`}>
                                                    <meta.icon className="w-3.5 h-3.5" />
                                                    {activity.type}
                                                </span>
                                                {activity.lead?.company && (
                                                    <span className="text-sm font-semibold text-atlas-dark truncate">
                                                        {activity.lead.company.tradeName || activity.lead.company.legalName}
                                                    </span>
                                                )}
                                            </div>
                                            {activity.observations && (
                                                <p className="text-sm text-atlas-dark/55 line-clamp-1">{activity.observations}</p>
                                            )}
                                        </div>

                                        <div className="flex flex-col items-end gap-1 text-sm text-atlas-dark/45 shrink-0">
                                            <div className="flex items-center gap-1.5">
                                                <IconCalendar className="w-3.5 h-3.5" />
                                                {new Date(activity.date).toLocaleDateString('pt-BR')}
                                            </div>
                                            {activity.time && (
                                                <div className="flex items-center gap-1.5">
                                                    <IconClock className="w-3.5 h-3.5" />
                                                    {activity.time}
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </motion.div>
                    )}
                </Card>
            </div>
        </div>
    );
}
