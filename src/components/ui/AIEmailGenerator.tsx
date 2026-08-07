import { useState } from 'react';
import { Sparkles, Copy, Check, Send, Bot, RefreshCw, ShieldCheck, Zap, AlertCircle, Mail, Phone, MessageCircle } from 'lucide-react';
import { Button } from './Button';
import { useBrand } from '../../contexts/BrandContext';
import { api } from '../../lib/api';

type Channel = 'email' | 'call' | 'message';
type Tone = 'consultative' | 'direct' | 'roi_focused' | 'hyper_personalized';

interface AIEmailGeneratorProps {
  companyName?: string;
  contactName?: string;
  sector?: string;
  role?: string;
  technologies?: string[];
  companySize?: string;
  /** Telefone/WhatsApp do contato (se conhecido) — habilita "Ligar" e "Enviar WhatsApp" nos canais de ligação/mensagem. */
  phone?: string | null;
}

interface EmailResult {
  subject: string;
  body: string;
  icpAnalysis: string;
}

interface CallScriptResult {
  opening: string;
  discoveryQuestions: string[];
  objectionTips: { objection: string; response: string }[];
  closing: string;
  icpAnalysis: string;
}

interface MessageResult {
  body: string;
  followUpSuggestion: string;
  icpAnalysis: string;
}

const CHANNEL_META: Record<Channel, { label: string; icon: typeof Mail; cta: string; ctaLoading: string }> = {
  email: { label: 'E-mail', icon: Mail, cta: 'Sintetizar E-mail com IA', ctaLoading: 'Sintetizando E-mail Inteligente...' },
  call: { label: 'Ligação', icon: Phone, cta: 'Gerar Roteiro de Ligação', ctaLoading: 'Montando Roteiro de Ligação...' },
  message: { label: 'Mensagem', icon: MessageCircle, cta: 'Gerar Mensagem Curta', ctaLoading: 'Escrevendo Mensagem...' },
};

/** Só dígitos, com DDI — formato aceito pelo wa.me. */
function toWhatsAppDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('55') ? digits : `55${digits}`;
}

export function AIEmailGenerator({
  companyName = 'Empresa Alvo',
  contactName = 'Decisor de Compras',
  sector = 'Tecnologia',
  role = 'Diretor Comercial',
  technologies = ['React', 'AWS', 'Salesforce'],
  companySize = '50-200 Colaboradores (Mid-Market)',
  phone,
}: AIEmailGeneratorProps) {
  const { brandInfo } = useBrand();
  const [channel, setChannel] = useState<Channel>('email');
  const [tone, setTone] = useState<Tone>('consultative');

  const [emailResult, setEmailResult] = useState<EmailResult | null>(null);
  const [callResult, setCallResult] = useState<CallScriptResult | null>(null);
  const [messageResult, setMessageResult] = useState<MessageResult | null>(null);

  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const meta = CHANNEL_META[channel];
  const hasResult = channel === 'email' ? !!emailResult : channel === 'call' ? !!callResult : !!messageResult;

  const generate = async () => {
    setGenerating(true);
    setCopied(false);
    setError('');

    const inputs = { companyName, contactName, sector, role, technologies, companySize, tone };
    const brand = { name: brandInfo.name, description: brandInfo.description };

    try {
      if (channel === 'email') {
        const response = await api.post<{ result: EmailResult }>('/api/intelligence/studio', { kind: 'email', brand, inputs }, { timeoutMs: 90_000 });
        setEmailResult(response.result);
      } else if (channel === 'call') {
        const response = await api.post<{ result: CallScriptResult }>('/api/intelligence/studio', { kind: 'call_script', brand, inputs }, { timeoutMs: 90_000 });
        setCallResult(response.result);
      } else {
        const response = await api.post<{ result: MessageResult }>('/api/intelligence/studio', { kind: 'message', brand, inputs }, { timeoutMs: 90_000 });
        setMessageResult(response.result);
      }
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Não foi possível gerar o conteúdo.');
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = () => {
    let text = '';
    if (channel === 'email' && emailResult) {
      text = `Assunto: ${emailResult.subject}\n\n${emailResult.body}`;
    } else if (channel === 'call' && callResult) {
      text = [
        `Abertura:\n${callResult.opening}`,
        `Perguntas de descoberta:\n${callResult.discoveryQuestions.map((q) => `- ${q}`).join('\n')}`,
        `Objeções e respostas:\n${callResult.objectionTips.map((o) => `- "${o.objection}" → ${o.response}`).join('\n')}`,
        `Fechamento:\n${callResult.closing}`,
      ].join('\n\n');
    } else if (channel === 'message' && messageResult) {
      text = messageResult.body;
    }
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="glass-card p-5 rounded-2xl border border-line bg-surface space-y-4 shadow-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-line">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-600 to-brand flex items-center justify-center text-white shadow-md">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-ink">Copiloto IA: Abordagem de Prospecção</h4>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" /> ICP Match
              </span>
            </div>
            <p className="text-xs text-ink-2">Personalização profunda baseada na Persona ({role}) e ICP ({companySize})</p>
          </div>
        </div>

        {/* Seleção de Tom */}
        <div className="flex flex-wrap items-center bg-surface-2 p-1 rounded-xl border border-line text-[11px] font-semibold">
          {([
            ['consultative', 'Consultivo'],
            ['direct', 'Direto'],
            ['roi_focused', 'Foco ROI'],
            ['hyper_personalized', 'Hiper-personalizado'],
          ] as [Tone, string][]).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTone(value)}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                tone === value ? 'bg-brand text-white font-bold shadow-sm' : 'text-ink-2 hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Seleção de Canal */}
      <div className="flex items-center gap-1.5 bg-surface-2 p-1 rounded-xl border border-line w-fit">
        {(Object.keys(CHANNEL_META) as Channel[]).map((c) => {
          const Icon = CHANNEL_META[c].icon;
          return (
            <button
              key={c}
              onClick={() => { setChannel(c); setError(''); setCopied(false); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                channel === c ? 'bg-brand text-white shadow-sm' : 'text-ink-2 hover:text-ink'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {CHANNEL_META[c].label}
            </button>
          );
        })}
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!hasResult ? (
        <div className="text-center p-6 border border-dashed border-line rounded-xl bg-surface-2 space-y-3">
          <Sparkles className="w-8 h-8 text-indigo-400 mx-auto animate-pulse" />
          <div>
            <p className="text-xs font-bold text-ink mb-1">
              Pronto para gerar {channel === 'email' ? 'cold mail' : channel === 'call' ? 'roteiro de ligação' : 'mensagem'} de altíssima conversão
            </p>
            <p className="text-xs text-ink-2 max-w-md mx-auto">
              O motor de IA cruzará a persona <strong className="text-indigo-300">{role}</strong>, os dados do segmento <strong className="text-indigo-300">{sector}</strong> e as ferramentas detectadas (<strong className="text-indigo-300">{technologies.join(', ')}</strong>).
            </p>
          </div>
          <Button onClick={generate} disabled={generating} className="w-full sm:w-auto shadow-lg shadow-brand/20 cursor-pointer">
            {generating ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2 text-amber-400" />}
            {generating ? meta.ctaLoading : meta.cta}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {channel === 'email' && emailResult && (
            <EmailPanel result={emailResult} onChange={setEmailResult} />
          )}
          {channel === 'call' && callResult && (
            <CallScriptPanel result={callResult} />
          )}
          {channel === 'message' && messageResult && (
            <MessagePanel result={messageResult} onChange={setMessageResult} />
          )}

          <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={generate} disabled={generating} className="text-xs text-indigo-400">
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${generating ? 'animate-spin' : ''}`} />
              Regerar com Novo Tom
            </Button>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={copyToClipboard} className="text-xs">
                {copied ? <Check className="w-3.5 h-3.5 text-green-400 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                {copied ? 'Copiado!' : 'Copiar Texto'}
              </Button>
              {channel === 'email' && emailResult && (
                <a
                  href={`mailto:?subject=${encodeURIComponent(emailResult.subject)}&body=${encodeURIComponent(emailResult.body)}`}
                  className="inline-flex items-center justify-center text-xs font-bold px-3.5 py-1.5 rounded-md bg-brand text-white hover:bg-brand/90 transition-colors shadow-md"
                >
                  <Send className="w-3.5 h-3.5 mr-1.5" /> Enviar
                </a>
              )}
              {channel === 'call' && phone && (
                <a
                  href={`tel:${phone}`}
                  className="inline-flex items-center justify-center text-xs font-bold px-3.5 py-1.5 rounded-md bg-brand text-white hover:bg-brand/90 transition-colors shadow-md"
                >
                  <Phone className="w-3.5 h-3.5 mr-1.5" /> Ligar para {phone}
                </a>
              )}
              {channel === 'message' && messageResult && phone && (
                <a
                  href={`https://wa.me/${toWhatsAppDigits(phone)}?text=${encodeURIComponent(messageResult.body)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center text-xs font-bold px-3.5 py-1.5 rounded-md bg-brand text-white hover:bg-brand/90 transition-colors shadow-md"
                >
                  <Send className="w-3.5 h-3.5 mr-1.5" /> Enviar WhatsApp
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IcpBadge({ text }: { text: string }) {
  return (
    <div className="p-2.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-xs text-indigo-200 font-semibold flex items-center justify-between gap-2">
      <span>{text}</span>
      <span className="text-[10px] bg-indigo-500/20 px-2 py-0.5 rounded text-indigo-300 uppercase shrink-0">Validação Persona OK</span>
    </div>
  );
}

function EmailPanel({ result, onChange }: { result: EmailResult; onChange: (r: EmailResult) => void }) {
  return (
    <>
      <IcpBadge text={result.icpAnalysis} />
      <div>
        <label className="text-[10px] font-extrabold uppercase tracking-wider text-ink-2 block mb-1">
          Assunto Recomendado (AIDA Hook)
        </label>
        <input
          type="text"
          value={result.subject}
          onChange={(e) => onChange({ ...result, subject: e.target.value })}
          className="w-full text-xs font-bold px-3 py-2 rounded-lg bg-surface-2 text-ink border border-line focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>
      <div>
        <label className="text-[10px] font-extrabold uppercase tracking-wider text-ink-2 block mb-1">
          Corpo da Mensagem (Engenharia de Prompt ICP)
        </label>
        <textarea
          rows={7}
          value={result.body}
          onChange={(e) => onChange({ ...result, body: e.target.value })}
          className="w-full text-xs px-3 py-2.5 rounded-lg bg-surface-2 text-ink border border-line focus:outline-none focus:ring-1 focus:ring-brand leading-relaxed font-sans"
        />
      </div>
    </>
  );
}

function CallScriptPanel({ result }: { result: CallScriptResult }) {
  return (
    <>
      <IcpBadge text={result.icpAnalysis} />
      <div className="space-y-3 text-xs text-ink">
        <div>
          <label className="text-[10px] font-extrabold uppercase tracking-wider text-ink-2 block mb-1">Abertura (primeiros 10s)</label>
          <p className="px-3 py-2.5 rounded-lg bg-surface-2 border border-line leading-relaxed">{result.opening}</p>
        </div>
        <div>
          <label className="text-[10px] font-extrabold uppercase tracking-wider text-ink-2 block mb-1">Perguntas de Descoberta</label>
          <ul className="space-y-1.5">
            {result.discoveryQuestions.map((q, i) => (
              <li key={i} className="px-3 py-2 rounded-lg bg-surface-2 border border-line leading-relaxed">{i + 1}. {q}</li>
            ))}
          </ul>
        </div>
        <div>
          <label className="text-[10px] font-extrabold uppercase tracking-wider text-ink-2 block mb-1">Contorno de Objeções</label>
          <div className="space-y-1.5">
            {result.objectionTips.map((o, i) => (
              <div key={i} className="px-3 py-2 rounded-lg bg-surface-2 border border-line leading-relaxed">
                <p className="text-ink-2 italic">&quot;{o.objection}&quot;</p>
                <p className="mt-1">→ {o.response}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[10px] font-extrabold uppercase tracking-wider text-ink-2 block mb-1">Fechamento (próximo passo)</label>
          <p className="px-3 py-2.5 rounded-lg bg-surface-2 border border-line leading-relaxed">{result.closing}</p>
        </div>
      </div>
    </>
  );
}

function MessagePanel({ result, onChange }: { result: MessageResult; onChange: (r: MessageResult) => void }) {
  return (
    <>
      <IcpBadge text={result.icpAnalysis} />
      <div>
        <label className="text-[10px] font-extrabold uppercase tracking-wider text-ink-2 block mb-1">
          Mensagem (WhatsApp / SMS)
        </label>
        <textarea
          rows={4}
          value={result.body}
          onChange={(e) => onChange({ ...result, body: e.target.value })}
          className="w-full text-xs px-3 py-2.5 rounded-lg bg-surface-2 text-ink border border-line focus:outline-none focus:ring-1 focus:ring-brand leading-relaxed font-sans"
        />
      </div>
      <div>
        <label className="text-[10px] font-extrabold uppercase tracking-wider text-ink-2 block mb-1">Se não responder</label>
        <p className="px-3 py-2 rounded-lg bg-surface-2 border border-line text-xs text-ink-2 leading-relaxed">{result.followUpSuggestion}</p>
      </div>
    </>
  );
}
