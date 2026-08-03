import { useState } from 'react';
import { Sparkles, Copy, Check, Send, Bot, RefreshCw, ShieldCheck, Zap, AlertCircle } from 'lucide-react';
import { Button } from './Button';
import { useBrand } from '../../contexts/BrandContext';
import { api } from '../../lib/api';

interface AIEmailGeneratorProps {
  companyName?: string;
  contactName?: string;
  sector?: string;
  role?: string;
  technologies?: string[];
  companySize?: string;
}

export function AIEmailGenerator({
  companyName = 'Empresa Alvo',
  contactName = 'Decisor de Compras',
  sector = 'Tecnologia',
  role = 'Diretor Comercial',
  technologies = ['React', 'AWS', 'Salesforce'],
  companySize = '50-200 Colaboradores (Mid-Market)'
}: AIEmailGeneratorProps) {
  const { brandInfo } = useBrand();
  const [tone, setTone] = useState<'consultative' | 'direct' | 'roi_focused' | 'hyper_personalized'>('consultative');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [icpAnalysis, setIcpAnalysis] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const generateEmail = async () => {
    setGenerating(true);
    setCopied(false);
    setError('');

    try {
      const response = await api.post<{
        result: { subject: string; body: string; icpAnalysis: string };
      }>('/api/intelligence/studio', {
        kind: 'email',
        brand: { name: brandInfo.name, description: brandInfo.description },
        inputs: {
          companyName,
          contactName,
          sector,
          role,
          technologies,
          companySize,
          tone,
        },
      }, { timeoutMs: 90_000 });
      setSubject(response.result.subject);
      setBody(response.result.body);
      setIcpAnalysis(response.result.icpAnalysis);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Não foi possível gerar o e-mail.');
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(`Assunto: ${subject}\n\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="glass-card p-5 rounded-2xl border border-line bg-surface space-y-4 shadow-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-line">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-600 to-atlas-orange flex items-center justify-center text-white shadow-md">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-ink">Copiloto IA: Gerador de Cold Mail V3</h4>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" /> ICP Match
              </span>
            </div>
            <p className="text-xs text-ink-2">Personalização profunda baseada na Persona ({role}) e ICP ({companySize})</p>
          </div>
        </div>

        {/* Seleção de Tom */}
        <div className="flex flex-wrap items-center bg-surface-2 p-1 rounded-xl border border-line text-[11px] font-semibold">
          <button
            onClick={() => setTone('consultative')}
            className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
              tone === 'consultative' ? 'bg-atlas-orange text-white font-bold shadow-sm' : 'text-ink-2 hover:text-ink'
            }`}
          >
            Consultivo
          </button>
          <button
            onClick={() => setTone('direct')}
            className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
              tone === 'direct' ? 'bg-atlas-orange text-white font-bold shadow-sm' : 'text-ink-2 hover:text-ink'
            }`}
          >
            Direto
          </button>
          <button
            onClick={() => setTone('roi_focused')}
            className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
              tone === 'roi_focused' ? 'bg-atlas-orange text-white font-bold shadow-sm' : 'text-ink-2 hover:text-ink'
            }`}
          >
            Foco ROI
          </button>
          <button
            onClick={() => setTone('hyper_personalized')}
            className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
              tone === 'hyper_personalized' ? 'bg-atlas-orange text-white font-bold shadow-sm' : 'text-ink-2 hover:text-ink'
            }`}
          >
            Hiper-personalizado
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!body ? (
        <div className="text-center p-6 border border-dashed border-line rounded-xl bg-surface-2 space-y-3">
          <Sparkles className="w-8 h-8 text-indigo-400 mx-auto animate-pulse" />
          <div>
            <p className="text-xs font-bold text-ink mb-1">
              Pronto para gerar cold mail de altíssima conversão
            </p>
            <p className="text-xs text-ink-2 max-w-md mx-auto">
              O motor de IA cruzará a persona <strong className="text-indigo-300">{role}</strong>, os dados do segmento <strong className="text-indigo-300">{sector}</strong> e as ferramentas detectadas (<strong className="text-indigo-300">{technologies.join(', ')}</strong>).
            </p>
          </div>
          <Button onClick={generateEmail} disabled={generating} className="w-full sm:w-auto shadow-lg shadow-atlas-orange/20 cursor-pointer">
            {generating ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2 text-amber-400" />}
            {generating ? 'Sintetizando E-mail Inteligente...' : 'Sintetizar E-mail com IA'}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {icpAnalysis && (
            <div className="p-2.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-xs text-indigo-200 font-semibold flex items-center justify-between">
              <span>{icpAnalysis}</span>
              <span className="text-[10px] bg-indigo-500/20 px-2 py-0.5 rounded text-indigo-300 uppercase">Validação Persona OK</span>
            </div>
          )}

          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-ink-2 block mb-1">
              Assunto Recomendado (AIDA Hook)
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full text-xs font-bold px-3 py-2 rounded-lg bg-surface-2 text-ink border border-line focus:outline-none focus:ring-1 focus:ring-atlas-orange"
            />
          </div>

          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-ink-2 block mb-1">
              Corpo da Mensagem (Engenharia de Prompt ICP)
            </label>
            <textarea
              rows={7}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full text-xs px-3 py-2.5 rounded-lg bg-surface-2 text-ink border border-line focus:outline-none focus:ring-1 focus:ring-atlas-orange leading-relaxed font-sans"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <Button variant="ghost" size="sm" onClick={generateEmail} disabled={generating} className="text-xs text-indigo-400">
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${generating ? 'animate-spin' : ''}`} />
              Regerar com Novo Tom
            </Button>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={copyToClipboard} className="text-xs">
                {copied ? <Check className="w-3.5 h-3.5 text-green-400 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                {copied ? 'Copiado!' : 'Copiar Texto'}
              </Button>
              <a
                href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
                className="inline-flex items-center justify-center text-xs font-bold px-3.5 py-1.5 rounded-md bg-atlas-orange text-white hover:bg-atlas-orange/90 transition-colors shadow-md"
              >
                <Send className="w-3.5 h-3.5 mr-1.5" /> Enviar
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
