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
    <div className="p-6 rounded-card-lg border border-atlas-orange/15 bg-white shadow-[0_20px_60px_rgba(255,86,24,0.12)] relative overflow-hidden text-slate-900 font-sans">
      <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-atlas-orange to-orange-300" />
      <div className="absolute top-0 right-0 w-48 h-48 bg-atlas-orange/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-atlas-orange/10 mb-4">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-atlas-orange to-atlas-yellow flex items-center justify-center text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_4px_14px_rgba(255,86,24,0.4)]">
          <Clock className="w-5 h-5 animate-pulse" />
        </div>
        <p className="text-xs text-slate-500 capitalize font-semibold">{dayName}, {fullDate}</p>
      </div>

      {/* Relógio Ao Vivo */}
      <div className="p-6 rounded-card bg-gradient-to-r from-orange-50 via-white to-orange-50 border border-atlas-orange/15 relative overflow-hidden text-center sm:text-left">
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-atlas-orange block mb-1 flex items-center justify-center sm:justify-start gap-1">
          <Sparkles className="w-3 h-3 text-atlas-orange animate-spin-slow" /> Fuso Horário Oficial (Horário de Brasília)
        </span>
        <div className="flex items-baseline justify-center sm:justify-start gap-1 font-mono">
          <span className="text-5xl font-black text-slate-900 tracking-tight">{hours}:{minutes}</span>
          <span className="text-xl font-bold text-atlas-orange">:{seconds}</span>
        </div>
      </div>

      {/* Calendário Mensal Compacto */}
      <div className="mt-6 space-y-3">
        <div className="flex items-center justify-between text-xs font-bold capitalize">
          <span className="flex items-center gap-1.5 text-sm font-black text-slate-900">
            <CalendarIcon className="w-4 h-4 text-atlas-orange" /> {currentMonthName} {time.getFullYear()}
          </span>
          <span className="text-[10px] text-atlas-orange bg-atlas-orange/10 px-2 py-0.5 rounded border border-atlas-orange/20">
            Clique num dia para ver detalhes
          </span>
        </div>

        <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-bold">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => (
            <div key={d} className="py-1 text-slate-400 text-[10px] uppercase tracking-wider">{d}</div>
          ))}

          {Array.from({ length: new Date(time.getFullYear(), time.getMonth() + 1, 0).getDate() }, (_, i) => i + 1).map((day) => {
            const hasEvent = scheduledEvents.some((e) => e.day === day);
            const isToday = day === time.getDate();
            const isSelected = day === selectedDate;

            return (
              <button
                key={day}
                onClick={() => setSelectedDate(day)}
                className={`py-2 rounded-xl transition-all relative flex flex-col items-center justify-center cursor-pointer ${
                  isToday
                    ? 'bg-gradient-to-br from-atlas-orange to-atlas-yellow text-white font-black shadow-lg shadow-atlas-orange/30 ring-2 ring-atlas-orange/30'
                    : isSelected
                    ? 'bg-white border-2 border-atlas-orange text-atlas-orange font-bold'
                    : 'bg-orange-50 hover:bg-orange-100 text-slate-600'
                }`}
              >
                <span>{day}</span>
                {hasEvent && (
                  <span className="w-1.5 h-1.5 rounded-full bg-atlas-orange absolute bottom-1 animate-pulse" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Compromissos do Dia Selecionado */}
      <div className="mt-5 space-y-3">
        <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-success" /> Compromissos do Dia {selectedDate}
        </h4>
        {scheduledEvents.filter((e) => e.day === selectedDate).length === 0 ? (
          <p className="text-xs text-slate-400 italic">Nenhum evento registrado para este dia.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {scheduledEvents.filter((e) => e.day === selectedDate).map((evt, idx) => (
              <div key={idx} className="p-3.5 rounded-card bg-orange-50 border border-atlas-orange/15 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-atlas-orange">{evt.time}</span>
                  <span className="text-[9px] px-2 py-0.5 rounded bg-atlas-orange/15 text-atlas-orange font-bold border border-atlas-orange/30">
                    {evt.badge}
                  </span>
                </div>
                <p className="font-bold text-slate-900 leading-tight">{evt.title}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
