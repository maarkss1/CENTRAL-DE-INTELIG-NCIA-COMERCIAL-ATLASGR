import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Calendar,
  Clock,
  User,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Building2,
  Mail,
  Phone,
} from 'lucide-react';
import { api } from '../../../lib/api';

interface BookingLinkData {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  durationMin: number;
  host: {
    name: string;
    role: string;
    organization: string;
  };
  availableSlots: string[];
}

export function PublicBookingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<BookingLinkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedSlot, setSelectedSlot] = useState<string>('10:00');

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [successData, setSuccessData] = useState<{
    host: string;
    title: string;
    date: string;
    time: string;
  } | null>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    api
      .get<BookingLinkData>(`/api/calendar/book/${slug}`)
      .then((res) => {
        setData(res);
        if (res.availableSlots?.length > 0) {
          setSelectedSlot(res.availableSlots[0]);
        }
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : 'Link de agendamento não encontrado ou inativo.',
        );
      })
      .finally(() => setLoading(false));
  }, [slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug) return;
    setSubmitting(true);
    try {
      const res = await api.post<{ host: string; title: string; date: string; time: string }>(
        `/api/calendar/book/${slug}`,
        {
          ...form,
          date: selectedDate,
          time: selectedSlot,
        },
      );
      setSuccessData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao realizar agendamento.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
          <p className="text-sm font-medium text-slate-400">
            Carregando calendário do consultor...
          </p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-4 shadow-2xl">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-xl font-bold text-slate-100">Agendamento Indisponível</h2>
          <p className="text-sm text-slate-400">
            {error || 'Este link de agendamento expirou ou não existe mais.'}
          </p>
        </div>
      </div>
    );
  }

  if (successData) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-5 shadow-2xl animate-in zoom-in-95 duration-300">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-black text-slate-100">Reunião Confirmada!</h2>
            <p className="text-sm text-slate-400">{successData.title}</p>
          </div>

          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 text-left text-sm">
            <div className="flex items-center justify-between text-slate-300">
              <span className="text-slate-500">Consultor:</span>
              <span className="font-bold">{successData.host}</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span className="text-slate-500">Data e Hora:</span>
              <span className="font-bold">
                {new Date(`${successData.date}T12:00:00`).toLocaleDateString('pt-BR', {
                  dateStyle: 'full',
                })}{' '}
                às {successData.time}
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Um convite com o link da videoconferência foi enviado para o seu e-mail cadastrado.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 sm:p-8">
      <div className="max-w-4xl w-full bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl grid grid-cols-1 md:grid-cols-5 overflow-hidden">
        {/* Lateral Esquerda com Info do Host */}
        <div className="md:col-span-2 p-8 border-b md:border-b-0 md:border-r border-slate-800 bg-slate-950/50 space-y-6">
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-500">
              {data.host.organization}
            </span>
            <h1 className="text-2xl font-black text-slate-100 leading-tight">{data.title}</h1>
            {data.description && (
              <p className="text-xs text-slate-400 leading-relaxed">{data.description}</p>
            )}
          </div>

          <div className="space-y-3 pt-4 border-t border-slate-800/80 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                {data.host.name} ({data.host.role})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Duração de {data.durationMin} minutos</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Videoconferência / Reunião Online</span>
            </div>
          </div>
        </div>

        {/* Formulário de Agendamento */}
        <form onSubmit={handleSubmit} className="md:col-span-3 p-8 space-y-5 bg-slate-900">
          <h2 className="text-base font-black text-slate-100">Escolha a data e o horário</h2>

          {/* Seleção de Data e Horário */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="booking-date"
                className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5"
              >
                Data Desejada
              </label>
              <input
                id="booking-date"
                type="date"
                value={selectedDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-100 focus:outline-none focus:border-amber-500"
                required
              />
            </div>
            <div>
              <label
                htmlFor="booking-slot"
                className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5"
              >
                Horário Disponível
              </label>
              <select
                id="booking-slot"
                value={selectedSlot}
                onChange={(e) => setSelectedSlot(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-100 focus:outline-none focus:border-amber-500"
                required
              >
                {data.availableSlots.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div>
              <label
                htmlFor="booking-name"
                className="block text-[11px] font-bold text-slate-400 uppercase mb-1"
              >
                Seu Nome Completo
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="booking-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Carlos Mendes"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="booking-email"
                  className="block text-[11px] font-bold text-slate-400 uppercase mb-1"
                >
                  E-mail Corporativo
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="booking-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="carlos@transportes.com"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="booking-phone"
                  className="block text-[11px] font-bold text-slate-400 uppercase mb-1"
                >
                  WhatsApp / Telefone
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="booking-phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="(11) 99999-8888"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                    required
                  />
                </div>
              </div>
            </div>

            <div>
              <label
                htmlFor="booking-company"
                className="block text-[11px] font-bold text-slate-400 uppercase mb-1"
              >
                Nome da Empresa
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="booking-company"
                  type="text"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  placeholder="Ex: Transportadora Rápido Sol"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="booking-notes"
                className="block text-[11px] font-bold text-slate-400 uppercase mb-1"
              >
                Notas / Assunto (opcional)
              </label>
              <textarea
                id="booking-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Gostaria de falar sobre dimensionamento de telemetria CAN..."
                rows={2}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-500 resize-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black rounded-xl text-xs transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Calendar className="w-4 h-4" />
            )}
            Confirmar Agendamento
          </button>
        </form>
      </div>
    </div>
  );
}
