import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
    useDraggable, useDroppable,
    type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import {
    CalendarDays, ChevronLeft, ChevronRight, Loader2, AlertTriangle, Check, X,
} from 'lucide-react';

import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { useBrandAccent } from '../../../hooks/useBrandAccent';
import { toast } from '../../../lib/toast';
import {
    calendarApi, activitySubject,
    type CalendarActivity, type ActivityStatus,
} from '../calendar.api';
import {
    buildMonthGrid, monthGridRange, groupByDay, dayKey, moveToDay, addMonths, isSameDay,
} from '../calendar.util';

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/**
 * Cor por status. São estados, não séries: seguem a paleta de status (com rótulo textual junto,
 * nunca só a cor) em vez das cores categóricas usadas em gráficos.
 */
const STATUS_STYLE: Record<ActivityStatus, string> = {
    'Pendente': 'bg-amber-500/15 text-amber-200 border-amber-500/30',
    'Em andamento': 'bg-sky-500/15 text-sky-200 border-sky-500/30',
    'Concluída': 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30',
    'Cancelada': 'bg-slate-500/15 text-slate-400 border-slate-500/30 line-through',
};

function timeLabel(activity: CalendarActivity): string {
    if (activity.time) return activity.time;
    const d = new Date(activity.date);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function ActivityCard({ activity, dragging }: { activity: CalendarActivity; dragging?: boolean }) {
    return (
        <div
            className={`w-full text-left px-1.5 py-1 rounded-md border text-[10px] leading-tight ${STATUS_STYLE[activity.status]} ${
                dragging ? 'shadow-lg' : ''
            }`}
        >
            <span className="font-semibold">{timeLabel(activity)}</span>{' '}
            <span className="opacity-90">{activity.type}</span>
            <span className="block truncate opacity-75">{activitySubject(activity)}</span>
        </div>
    );
}

function DraggableActivity({ activity, onOpen }: {
    activity: CalendarActivity; onOpen: (a: CalendarActivity) => void;
}) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: activity.id });

    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            onClick={() => onOpen(activity)}
            role="button"
            tabIndex={0}
            aria-label={`${activity.type} — ${activitySubject(activity)} — ${activity.status}`}
            className={`cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-30' : ''}`}
        >
            <ActivityCard activity={activity} />
        </div>
    );
}

function DayCell({ date, inMonth, isToday, activities, onOpen }: {
    date: Date; inMonth: boolean; isToday: boolean;
    activities: CalendarActivity[]; onOpen: (a: CalendarActivity) => void;
}) {
    const key = dayKey(date);
    const { setNodeRef, isOver } = useDroppable({ id: key });
    const accent = useBrandAccent();

    // Três cabem sem esticar a célula; o resto vira "+N", que abre o dia.
    const visible = activities.slice(0, 3);
    const hidden = activities.length - visible.length;

    return (
        <div
            ref={setNodeRef}
            className={`min-h-[104px] p-1.5 border border-white/5 flex flex-col gap-1 transition-colors ${
                inMonth ? 'bg-slate-900/40' : 'bg-slate-900/10'
            } ${isOver ? `${accent.bgSoft} ring-1 ${accent.border}` : ''}`}
        >
            <div className="flex items-center justify-between">
                <span
                    className={`text-[11px] font-semibold w-5 h-5 flex items-center justify-center rounded-full ${
                        isToday ? `${accent.bg} text-white` : inMonth ? 'text-gray-300' : 'text-gray-600'
                    }`}
                >
                    {date.getDate()}
                </span>
                {activities.length > 0 && (
                    <span className="text-[10px] text-gray-500">{activities.length}</span>
                )}
            </div>

            <div className="flex flex-col gap-1">
                {visible.map((a) => <DraggableActivity key={a.id} activity={a} onOpen={onOpen} />)}
                {hidden > 0 && (
                    <button
                        onClick={() => onOpen(activities[visible.length])}
                        className="text-[10px] text-gray-500 hover:text-gray-300 text-left transition-colors"
                    >
                        +{hidden} {hidden === 1 ? 'outra' : 'outras'}
                    </button>
                )}
            </div>
        </div>
    );
}

export function Calendar() {
    const accent = useBrandAccent();
    const [reference, setReference] = useState(() => new Date());
    const [activities, setActivities] = useState<CalendarActivity[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dragged, setDragged] = useState<CalendarActivity | null>(null);
    const [selected, setSelected] = useState<CalendarActivity | null>(null);

    // Distância mínima antes de virar arrasto: sem isso, um clique simples no card já
    // iniciaria drag e o usuário nunca conseguiria abrir o detalhe.
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

    const load = useCallback(async (ref: Date) => {
        setLoading(true);
        setError(null);
        try {
            const { from, to } = monthGridRange(ref);
            setActivities(await calendarApi.range(from, to));
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(reference); }, [load, reference]);

    const grid = useMemo(() => buildMonthGrid(reference), [reference]);
    const byDay = useMemo(() => groupByDay(activities), [activities]);
    const today = new Date();

    const handleDragStart = useCallback((event: DragStartEvent) => {
        setDragged(activities.find((a) => a.id === event.active.id) ?? null);
    }, [activities]);

    const handleDragEnd = useCallback(async (event: DragEndEvent) => {
        const activity = dragged;
        setDragged(null);
        if (!activity || !event.over) return;

        const targetKey = String(event.over.id);
        if (dayKey(new Date(activity.date)) === targetKey) return;

        const novaData = moveToDay(activity.date, targetKey);
        const anterior = activities;

        // Otimista: o card salta para o novo dia imediatamente e volta se a API recusar.
        setActivities((prev) => prev.map((a) =>
            a.id === activity.id ? { ...a, date: novaData.toISOString() } : a,
        ));

        try {
            await calendarApi.update(activity.id, { date: novaData.toISOString() });
            toast.success(`${activity.type} remarcada para ${novaData.toLocaleDateString('pt-BR')}.`);
        } catch (err) {
            setActivities(anterior);
            toast.error(`Não foi possível remarcar: ${(err as Error).message}`);
        }
    }, [dragged, activities]);

    const changeStatus = useCallback(async (activity: CalendarActivity, status: ActivityStatus) => {
        const anterior = activities;
        const statusAnterior = activity.status;

        setActivities((prev) => prev.map((a) => (a.id === activity.id ? { ...a, status } : a)));
        setSelected((s) => (s && s.id === activity.id ? { ...s, status } : s));

        try {
            await calendarApi.update(activity.id, { status });
            toast.success(`Atividade marcada como "${status}".`);
        } catch (err) {
            // Reverte os DOIS: a grade e o diálogo aberto. Reverter só a grade deixaria o detalhe
            // afirmando um status que o servidor recusou.
            setActivities(anterior);
            setSelected((s) => (s && s.id === activity.id ? { ...s, status: statusAnterior } : s));
            toast.error((err as Error).message);
        }
    }, [activities]);

    const monthLabel = reference.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    return (
        <div className="flex-1 overflow-y-auto bg-slate-950 p-8">
            <div className="max-w-6xl mx-auto space-y-6">
                <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-6">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${accent.bgSoft} ${accent.text}`}>
                            <CalendarDays className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-white capitalize">{monthLabel}</h1>
                            <p className="text-sm text-gray-400">
                                {loading
                                    ? 'Carregando…'
                                    : `${activities.length} atividade${activities.length === 1 ? '' : 's'} no período · arraste para remarcar`}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => setReference((r) => addMonths(r, -1))} aria-label="Mês anterior">
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" onClick={() => setReference(new Date())}>Hoje</Button>
                        <Button variant="outline" onClick={() => setReference((r) => addMonths(r, 1))} aria-label="Próximo mês">
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                {error && (
                    <Card padding="lg" className="text-center">
                        <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-amber-400" />
                        <p className="text-sm text-gray-300 mb-4">{error}</p>
                        <Button variant="outline" onClick={() => void load(reference)}>Tentar novamente</Button>
                    </Card>
                )}

                {!error && (
                    <Card padding="none" className={`overflow-hidden transition-opacity ${loading ? 'opacity-60' : ''}`}>
                        <div className="grid grid-cols-7 border-b border-white/10">
                            {WEEKDAYS.map((d) => (
                                <div key={d} className="py-2 text-center text-[11px] font-bold uppercase tracking-wide text-gray-500">
                                    {d}
                                </div>
                            ))}
                        </div>

                        <DndContext
                            sensors={sensors}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                            onDragCancel={() => setDragged(null)}
                        >
                            <div className="grid grid-cols-7">
                                {grid.map((date) => (
                                    <DayCell
                                        key={dayKey(date)}
                                        date={date}
                                        inMonth={date.getMonth() === reference.getMonth()}
                                        isToday={isSameDay(date, today)}
                                        activities={byDay.get(dayKey(date)) ?? []}
                                        onOpen={setSelected}
                                    />
                                ))}
                            </div>

                            {/* Fantasma que segue o cursor durante o arrasto. */}
                            <DragOverlay>
                                {dragged && <div className="w-40"><ActivityCard activity={dragged} dragging /></div>}
                            </DragOverlay>
                        </DndContext>
                    </Card>
                )}

                {!loading && !error && activities.length === 0 && (
                    <Card padding="lg" className="text-center border-dashed">
                        <CalendarDays className="w-12 h-12 mx-auto mb-4 text-gray-600" />
                        <h3 className="text-lg font-semibold text-white mb-1">Nenhuma atividade neste mês</h3>
                        <p className="text-sm text-gray-400">
                            As atividades criadas na Agenda e no CRM aparecem aqui automaticamente.
                        </p>
                    </Card>
                )}
            </div>

            {/* Detalhe do dia/atividade */}
            {selected && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-6">
                    <Card className="w-full max-w-md" accentBar>
                        <div className="flex items-start justify-between mb-4 gap-4">
                            <div>
                                <h2 className="text-lg font-bold text-white">{selected.type}</h2>
                                <p className="text-sm text-gray-400">{activitySubject(selected)}</p>
                            </div>
                            <button
                                onClick={() => setSelected(null)}
                                className="p-1 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
                                aria-label="Fechar"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <dl className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <dt className="text-gray-500">Data</dt>
                                <dd className="text-gray-200">
                                    {new Date(selected.date).toLocaleDateString('pt-BR', { dateStyle: 'full' })}
                                </dd>
                            </div>
                            <div className="flex justify-between">
                                <dt className="text-gray-500">Horário</dt>
                                <dd className="text-gray-200">{timeLabel(selected)}</dd>
                            </div>
                            <div className="flex justify-between">
                                <dt className="text-gray-500">Responsável</dt>
                                <dd className="text-gray-200">{selected.owner}</dd>
                            </div>
                            <div className="flex justify-between">
                                <dt className="text-gray-500">Status</dt>
                                <dd className="text-gray-200">{selected.status}</dd>
                            </div>
                        </dl>

                        {selected.observations && (
                            <p className="mt-3 text-sm text-gray-300 bg-white/5 rounded-xl p-3 whitespace-pre-wrap">
                                {selected.observations}
                            </p>
                        )}

                        <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-white/10">
                            {selected.status !== 'Cancelada' && (
                                <Button variant="outline" onClick={() => void changeStatus(selected, 'Cancelada')}>
                                    <X className="w-4 h-4 mr-2" /> Cancelar
                                </Button>
                            )}
                            {selected.status !== 'Concluída' && (
                                <Button onClick={() => void changeStatus(selected, 'Concluída')}>
                                    <Check className="w-4 h-4 mr-2" /> Concluir
                                </Button>
                            )}
                        </div>
                    </Card>
                </div>
            )}

            {loading && activities.length === 0 && !error && (
                <div className="fixed bottom-8 right-8 flex items-center gap-2 text-sm text-gray-400 bg-slate-900/90 border border-white/10 rounded-xl px-4 py-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Carregando atividades…
                </div>
            )}
        </div>
    );
}
