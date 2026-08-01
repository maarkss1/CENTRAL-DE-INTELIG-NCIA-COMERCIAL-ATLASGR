import { useState, useEffect } from 'react';
import { Clock, Calendar as CalendarIcon, CheckCircle2, Sparkles } from 'lucide-react';

export function ClockCalendarWidget() {
  const [time, setTime] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<number>(new Date().getDate());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const seconds = time.getSeconds().toString().padStart(2, '0');
  const dayName = time.toLocaleDateString('pt-BR', { weekday: 'long' });
  const fullDate = time.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const currentMonthName = time.toLocaleDateString('pt-BR', { month: 'long' });

  // Eventos Comerciais Agendados
  const scheduledEvents = [
    { day: 24, title: 'Demo AtlasGR — Diretoria SaaS', time: '14:00', type: 'demo', badge: 'Alta Prioridade' },
    { day: 24, title: 'Follow-up TotalTrac — Frota Sul', time: '16:30', type: 'followup', badge: 'Em Andamento' },
    { day: 25, title: 'Reunião de Fechamento de Meta', time: '10:00', type: 'meeting', badge: 'Estratégico' },
    { day: 28, title: 'Treinamento de Telemetria com SDRs', time: '15:00', type: 'training', badge: 'Interno' }
  ];

  return (
    <div className="p-6 rounded-card-lg border border-line bg-surface shadow-card relative overflow-hidden text-ink font-sans">
      <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-brand to-brand-2" />
      <div className="absolute top-0 right-0 w-48 h-48 bg-brand-2/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-brand/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-line mb-4">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand to-brand-2 flex items-center justify-center text-white shadow-card">
          <Clock className="w-5 h-5 animate-pulse" />
        </div>
        <p className="text-xs text-ink-2 capitalize font-semibold">{dayName}, {fullDate}</p>
      </div>

      {/* Relógio Ao Vivo */}
      <div className="p-6 rounded-card bg-surface-2 border border-line relative overflow-hidden text-center sm:text-left">
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-ink-2 block mb-1 flex items-center justify-center sm:justify-start gap-1">
          <Sparkles className="w-3 h-3 text-brand animate-spin-slow" /> Fuso Horário Oficial (Horário de Brasília)
        </span>
        <div className="flex items-baseline justify-center sm:justify-start gap-1 font-mono">
          <span className="text-5xl font-black text-ink tracking-tight">{hours}:{minutes}</span>
          <span className="text-xl font-bold text-brand">:{seconds}</span>
        </div>
      </div>

      {/* Calendário Mensal Compacto */}
      <div className="mt-6 space-y-3">
        <div className="flex items-center justify-between text-xs font-bold capitalize">
          <span className="flex items-center gap-1.5 text-sm font-black text-ink">
            <CalendarIcon className="w-4 h-4 text-brand" /> {currentMonthName} {time.getFullYear()}
          </span>
          <span className="text-[10px] text-ink-2 bg-surface-2 px-2 py-0.5 rounded border border-line">
            Clique num dia para ver detalhes
          </span>
        </div>

        <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-bold">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => (
            <div key={d} className="py-1 text-ink-2 text-[10px] uppercase tracking-wider">{d}</div>
          ))}

          {Array.from({ length: new Date(time.getFullYear(), time.getMonth() + 1, 0).getDate() }, (_, i) => i + 1).map((day) => {
            const hasEvent = scheduledEvents.some((e) => e.day === day);
            const isToday = day === time.getDate();
            const isSelected = day === selectedDate;

            return (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDate(day)}
                aria-label={`Ver compromissos do dia ${day}`}
                aria-pressed={isSelected}
                className={`py-2 rounded-xl transition-all relative flex flex-col items-center justify-center cursor-pointer ${
                  isToday
                    ? 'bg-gradient-to-br from-brand to-brand-2 text-white font-black shadow-lg'
                    : isSelected
                    ? 'bg-surface border-2 border-brand/40 text-ink font-bold'
                    : 'bg-surface-2 hover:bg-line text-ink-2'
                }`}
              >
                <span>{day}</span>
                {hasEvent && (
                  <span className="w-1.5 h-1.5 rounded-full absolute bottom-1 animate-pulse bg-brand-2" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Compromissos do Dia Selecionado */}
      <div className="mt-5 space-y-3">
        <h4 className="font-bold text-ink text-xs uppercase tracking-wider flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-ok" /> Compromissos do Dia {selectedDate}
        </h4>
        {scheduledEvents.filter((e) => e.day === selectedDate).length === 0 ? (
          <p className="text-xs text-ink-2 italic">Nenhum evento registrado para este dia.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {scheduledEvents.filter((e) => e.day === selectedDate).map((evt, idx) => (
              <div key={idx} className="p-3.5 rounded-card bg-surface-2 border border-line space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-ink-2">{evt.time}</span>
                  <span className="text-[9px] px-2 py-0.5 rounded font-bold border bg-soft text-brand border-brand/20">
                    {evt.badge}
                  </span>
                </div>
                <p className="font-bold text-ink leading-tight">{evt.title}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
