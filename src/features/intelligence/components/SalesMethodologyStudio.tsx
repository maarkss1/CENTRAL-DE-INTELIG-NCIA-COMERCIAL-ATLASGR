import { useState } from 'react';
import { motion } from 'framer-motion';
import { Target, Zap, Flame, Sparkles, Copy, Check, RefreshCw, BookOpen, HelpCircle, Lightbulb, ShieldAlert, ShieldCheck, Award, FileText, Compass } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { useBrand } from '../../../contexts/BrandContext';
import { api } from '../../../lib/api';

type FrameworkType = 'spin' | 'snap' | 'aida' | 'meddpicc' | 'challenger';

interface MethodologyFormState {
  targetPersona: string;
  companySegment: string;
  icpSize: string;
  techStack: string;
  solutionName: string;
  mainPainPoint: string;
  mainBenefit: string;
}

interface MethodologyMeta {
  persona: string;
  icpSize: string;
  fitAssessment: string;
}

type MethodologyResult =
  | {
      type: 'spin';
      meta: MethodologyMeta;
      situation: string[];
      problem: string[];
      implication: string[];
      needPayoff: string[];
    }
  | {
      type: 'snap';
      meta: MethodologyMeta;
      simple: { description: string; checklist: string[] };
      invaluable: { description: string; differentiator: string };
      align: { description: string; strategicFit: string };
      priorities: { description: string; urgencyTrigger: string };
    }
  | {
      type: 'aida';
      meta: MethodologyMeta;
      attention: { hook: string; opening: string };
      interest: { body: string };
      desire: { proof: string };
      action: { cta: string };
    }
  | {
      type: 'meddpicc';
      meta: MethodologyMeta;
      metrics: string;
      economicBuyer: string;
      decisionCriteria: string;
      decisionProcess: string;
      paperProcess: string;
      identifiedPain: string;
      champion: string;
      competitors: string;
    }
  | {
      type: 'challenger';
      meta: MethodologyMeta;
      teach: { title: string; script: string };
      tailor: { title: string; script: string };
      takeControl: { title: string; script: string };
    };

export function SalesMethodologyStudio() {
  const { activeBrand, brandInfo } = useBrand();
  const [activeTab, setActiveTab] = useState<FrameworkType>('spin');
  const [form, setForm] = useState<MethodologyFormState>({
    targetPersona: activeBrand === 'totaltrac' ? 'Diretor de Operações / Gestor de Frota' : 'Diretor de Logística / Head de GR',
    companySegment: activeBrand === 'totaltrac' ? 'Transportadoras / Frotas corporativas' : 'Logística / Transporte de cargas',
    icpSize: 'Mid-Market (50 a 500 colaboradores)',
    techStack: 'A confirmar durante a descoberta',
    solutionName: brandInfo.name,
    mainPainPoint: activeBrand === 'totaltrac'
      ? 'Baixa visibilidade sobre consumo, jornada e eventos da frota'
      : 'Dificuldade de comprovar e auditar o cumprimento das regras de gerenciamento de risco',
    mainBenefit: 'Hipótese: reduzir trabalho manual e aumentar a previsibilidade operacional, sujeito a diagnóstico',
  });

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<MethodologyResult | null>(null);
  const [generationError, setGenerationError] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setResult(null);
    setGenerationError('');

    try {
      const response = await api.post<{ result: MethodologyResult }>('/api/intelligence/studio', {
        kind: 'methodology',
        brand: {
          name: brandInfo.name,
          description: brandInfo.description,
        },
        inputs: {
          framework: activeTab,
          ...form,
        },
      }, { timeoutMs: 90_000 });
      setResult(response.result);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'Falha ao consultar o motor de IA');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-8 font-sans">
      
      {/* Header Studio */}
      <div className="glass-panel p-6 sm:p-8 rounded-[2.5rem] border border-line relative overflow-hidden bg-surface backdrop-blur-xl shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-indigo-500/10 via-atlas-orange/10 to-transparent rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-atlas-orange via-amber-500 to-red-600 flex items-center justify-center text-white shadow-xl shadow-atlas-orange/20">
              <BookOpen className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-black text-ink tracking-tight">Estúdio de Metodologias de Vendas B2B</h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" /> 5 frameworks · Groq IA
                </span>
              </div>
              <p className="text-xs text-ink-2 mt-1">
                SPIN Selling · SNAP Selling · AIDA Engine · MEDDPICC Enterprise · Challenger Sale
              </p>
            </div>
          </div>

          {/* Selector Tabs (5 Frameworks) */}
          <div className="flex flex-wrap items-center bg-surface-2 p-1.5 rounded-2xl border border-line w-full md:w-auto gap-1">
            <button
              onClick={() => { setActiveTab('spin'); setResult(null); }}
              className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                activeTab === 'spin' ? 'bg-atlas-orange text-white shadow-lg shadow-atlas-orange/20' : 'text-ink-2 hover:text-ink'
              }`}
            >
              <Target className="w-3.5 h-3.5" /> SPIN
            </button>
            <button
              onClick={() => { setActiveTab('snap'); setResult(null); }}
              className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                activeTab === 'snap' ? 'bg-atlas-orange text-white shadow-lg shadow-atlas-orange/20' : 'text-ink-2 hover:text-ink'
              }`}
            >
              <Zap className="w-3.5 h-3.5" /> SNAP
            </button>
            <button
              onClick={() => { setActiveTab('aida'); setResult(null); }}
              className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                activeTab === 'aida' ? 'bg-atlas-orange text-white shadow-lg shadow-atlas-orange/20' : 'text-ink-2 hover:text-ink'
              }`}
            >
              <Flame className="w-3.5 h-3.5" /> AIDA
            </button>
            <button
              onClick={() => { setActiveTab('meddpicc'); setResult(null); }}
              className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                activeTab === 'meddpicc' ? 'bg-atlas-orange text-white shadow-lg shadow-atlas-orange/20' : 'text-ink-2 hover:text-ink'
              }`}
            >
              <FileText className="w-3.5 h-3.5" /> MEDDPICC
            </button>
            <button
              onClick={() => { setActiveTab('challenger'); setResult(null); }}
              className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                activeTab === 'challenger' ? 'bg-atlas-orange text-white shadow-lg shadow-atlas-orange/20' : 'text-ink-2 hover:text-ink'
              }`}
            >
              <Compass className="w-3.5 h-3.5" /> Challenger
            </button>
          </div>
        </div>
      </div>

      {/* Grid: Form & Output */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Formulário de Parâmetros ICP & Persona */}
        <div className="lg:col-span-5 glass-panel p-6 rounded-3xl border border-line bg-surface space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-line">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-atlas-orange" />
              <h3 className="font-bold text-ink text-base">Parâmetros ICP & Persona Target</h3>
            </div>
            <span className="text-[10px] bg-atlas-orange/10 text-atlas-orange font-bold px-2 py-0.5 rounded border border-atlas-orange/20">
              Rascunho para revisão
            </span>
          </div>

          <div className="space-y-3.5 text-xs">
            <div>
              <label className="font-bold text-ink-2 block mb-1">Cargo da Persona Target (Decisor C-Level/VP)</label>
              <input
                type="text"
                value={form.targetPersona}
                onChange={(e) => setForm({ ...form, targetPersona: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-surface-2 text-ink border border-line focus:outline-none focus:ring-1 focus:ring-atlas-orange"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-ink-2 block mb-1">Porte do ICP (Tamanho)</label>
                <select
                  value={form.icpSize}
                  onChange={(e) => setForm({ ...form, icpSize: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-surface-2 text-ink border border-line focus:outline-none focus:ring-1 focus:ring-atlas-orange"
                >
                  <option value="Enterprise (+500 colaboradores)">Enterprise (+500 colab.)</option>
                  <option value="Mid-Market (50 a 500 colaboradores)">Mid-Market (50-500 colab.)</option>
                  <option value="SMB (até 50 colaboradores)">SMB (até 50 colab.)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-ink-2 block mb-1">Segmento da Empresa</label>
                <input
                  type="text"
                  value={form.companySegment}
                  onChange={(e) => setForm({ ...form, companySegment: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-surface-2 text-ink border border-line focus:outline-none focus:ring-1 focus:ring-atlas-orange"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-ink-2 block mb-1">Stack Tecnológica Mapeada (Firmographics)</label>
              <input
                type="text"
                value={form.techStack}
                onChange={(e) => setForm({ ...form, techStack: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-surface-2 text-ink border border-line focus:outline-none focus:ring-1 focus:ring-atlas-orange"
              />
            </div>

            <div>
              <label className="font-bold text-ink-2 block mb-1">Nome da Sua Solução / Produto</label>
              <input
                type="text"
                value={form.solutionName}
                onChange={(e) => setForm({ ...form, solutionName: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-surface-2 text-ink border border-line focus:outline-none focus:ring-1 focus:ring-atlas-orange"
              />
            </div>

            <div>
              <label className="font-bold text-ink-2 block mb-1">Dor Principal do Cliente (Problem Statement)</label>
              <textarea
                rows={2}
                value={form.mainPainPoint}
                onChange={(e) => setForm({ ...form, mainPainPoint: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-surface-2 text-ink border border-line focus:outline-none focus:ring-1 focus:ring-atlas-orange"
              />
            </div>

            <div>
              <label className="font-bold text-ink-2 block mb-1">Hipótese de benefício / ROI a validar</label>
              <textarea
                rows={2}
                value={form.mainBenefit}
                onChange={(e) => setForm({ ...form, mainBenefit: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-surface-2 text-ink border border-line focus:outline-none focus:ring-1 focus:ring-atlas-orange"
              />
            </div>

            <Button
              onClick={handleGenerate}
              disabled={generating}
              className="w-full py-3 text-sm font-bold shadow-lg shadow-atlas-orange/20 cursor-pointer"
            >
              {generating ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
              {generating ? 'Sintetizando Roteiro ICP...' : `Gerar Estratégia ${activeTab.toUpperCase()} com Precisão`}
            </Button>
          </div>
        </div>

        {/* Display do Resultado */}
        <div className="lg:col-span-7 space-y-6">
          {!result && !generating && (
            <div className="glass-panel p-12 rounded-3xl border border-line text-center bg-surface flex flex-col items-center justify-center min-h-[440px]">
              <div className="w-16 h-16 rounded-2xl bg-atlas-orange/10 flex items-center justify-center text-atlas-orange mb-4">
                <Lightbulb className="w-8 h-8 animate-bounce" />
              </div>
              <h3 className="text-xl font-bold text-ink mb-2">Motor de Engenharia Comercial Pronto</h3>
              <p className="text-ink-2 text-xs max-w-md leading-relaxed">
                Escolha entre **SPIN**, **SNAP**, **AIDA**, **MEDDPICC** ou **Challenger** no topo para gerar estratégias sob medida.
              </p>
            </div>
          )}

          {generating && (
            <div className="glass-panel p-12 rounded-3xl border border-line text-center bg-surface flex flex-col items-center justify-center min-h-[440px]">
              <RefreshCw className="w-10 h-10 text-atlas-orange animate-spin mb-4" />
              <h3 className="text-lg font-bold text-ink mb-1">Processando Metodologia {activeTab.toUpperCase()}</h3>
              <p className="text-xs text-ink-2">Modelando dados para a persona <strong className="text-ink">{form.targetPersona}</strong> ({form.icpSize})...</p>
            </div>
          )}

          {generationError && !generating && (
            <div className="p-4 rounded-2xl border border-red-500/30 bg-red-500/10 text-sm text-red-300">
              Não foi possível gerar a estratégia: {generationError}
            </div>
          )}

          {result && !generating && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Card de Meta & ICP Score */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-950 border border-indigo-500/30 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
                    <Award className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white">Roteiro Otimizado para {result.meta.persona}</h4>
                    <p className="text-[11px] text-gray-400">Porte ICP: {result.meta.icpSize}</p>
                  </div>
                </div>
                <span className="max-w-sm px-3 py-1 rounded-xl bg-amber-500/10 text-amber-200 font-semibold border border-amber-500/30 text-right">
                  Validar: {result.meta.fitAssessment}
                </span>
              </div>

              {/* SPIN Selling Display */}
              {result.type === 'spin' && (
                <div className="space-y-4">
                  <SpinBlock title="S — Situation (Perguntas de Contexto)" items={result.situation} onCopy={(txt) => handleCopy(txt, 's')} copied={copiedKey === 's'} color="border-blue-500/30 bg-blue-950/20" icon={<HelpCircle className="w-4 h-4 text-blue-400" />} />
                  <SpinBlock title="P — Problem (Perguntas de Dor & Gargalo)" items={result.problem} onCopy={(txt) => handleCopy(txt, 'p')} copied={copiedKey === 'p'} color="border-amber-500/30 bg-amber-950/20" icon={<ShieldAlert className="w-4 h-4 text-amber-400" />} />
                  <SpinBlock title="I — Implication (Perguntas de Custo Financeiro)" items={result.implication} onCopy={(txt) => handleCopy(txt, 'i')} copied={copiedKey === 'i'} color="border-red-500/30 bg-red-950/20" icon={<Flame className="w-4 h-4 text-red-400" />} />
                  <SpinBlock title="N — Need-Payoff (Perguntas de Valor & ROI)" items={result.needPayoff} onCopy={(txt) => handleCopy(txt, 'n')} copied={copiedKey === 'n'} color="border-green-500/30 bg-green-950/20" icon={<Sparkles className="w-4 h-4 text-green-400" />} />
                </div>
              )}

              {/* SNAP Selling Display */}
              {result.type === 'snap' && (
                <div className="space-y-4">
                  <SnapCard title="S — Keep it Simple" subtitle="Simplicidade C-Level" content={result.simple.description} checklist={result.simple.checklist} onCopy={() => handleCopy(result.simple.description, 'snap1')} copied={copiedKey === 'snap1'} />
                  <SnapCard title="N — Be iNvaluable" subtitle="Valor & Insights Exclusivos" content={result.invaluable.description} extra={result.invaluable.differentiator} onCopy={() => handleCopy(result.invaluable.description, 'snap2')} copied={copiedKey === 'snap2'} />
                  <SnapCard title="A — Always Align" subtitle="Alinhamento com Metas da Persona" content={result.align.description} extra={result.align.strategicFit} onCopy={() => handleCopy(result.align.description, 'snap3')} copied={copiedKey === 'snap3'} />
                  <SnapCard title="P — Raise Priorities" subtitle="Urgência & Custo de Inação" content={result.priorities.description} extra={result.priorities.urgencyTrigger} onCopy={() => handleCopy(result.priorities.urgencyTrigger, 'snap4')} copied={copiedKey === 'snap4'} />
                </div>
              )}

              {/* AIDA Display */}
              {result.type === 'aida' && (
                <div className="glass-panel p-6 rounded-3xl border border-line bg-surface space-y-6">
                  <div className="flex items-center justify-between pb-3 border-b border-line">
                    <h3 className="font-bold text-ink text-base flex items-center gap-2">
                      <Flame className="w-5 h-5 text-atlas-orange" /> Copywriter AIDA Hiper-personalizado
                    </h3>
                    <Button variant="outline" size="sm" onClick={() => handleCopy(`${result.attention.hook}\n\n${result.attention.opening}\n\n${result.interest.body}\n\n${result.desire.proof}\n\n${result.action.cta}`, 'aida_all')} className="text-xs">
                      {copiedKey === 'aida_all' ? <Check className="w-3.5 h-3.5 text-green-400 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                      {copiedKey === 'aida_all' ? 'Copiado!' : 'Copiar Copy Completa'}
                    </Button>
                  </div>

                  <div className="space-y-4 text-xs">
                    <div className="p-3.5 rounded-2xl bg-surface-2 border border-indigo-500/30">
                      <span className="font-extrabold text-indigo-400 uppercase tracking-wider block mb-1">A — Attention (Hook C-Level)</span>
                      <p className="font-bold text-ink mb-1">{result.attention.hook}</p>
                      <p className="text-ink-2">{result.attention.opening}</p>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-surface-2 border border-blue-500/30">
                      <span className="font-extrabold text-blue-400 uppercase tracking-wider block mb-1">I — Interest (Problema & Stack Technographics)</span>
                      <p className="text-ink-2 leading-relaxed">{result.interest.body}</p>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-surface-2 border border-amber-500/30">
                      <span className="font-extrabold text-amber-400 uppercase tracking-wider block mb-1">D — Desire (Diferencial & ROI Prometido)</span>
                      <p className="text-ink-2 leading-relaxed">{result.desire.proof}</p>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-surface-2 border border-green-500/30">
                      <span className="font-extrabold text-green-400 uppercase tracking-wider block mb-1">A — Action (Chamada com Baixa Fricção)</span>
                      <p className="text-ink font-bold">{result.action.cta}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* MEDDPICC Display */}
              {result.type === 'meddpicc' && (
                <div className="glass-panel p-6 rounded-3xl border border-line bg-surface space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-line">
                    <h3 className="font-bold text-ink text-base flex items-center gap-2">
                      <FileText className="w-5 h-5 text-indigo-400" /> Qualificação Enterprise MEDDPICC
                    </h3>
                    <Button variant="outline" size="sm" onClick={() => handleCopy(JSON.stringify(result, null, 2), 'medd_all')} className="text-xs">
                      {copiedKey === 'medd_all' ? <Check className="w-3.5 h-3.5 text-green-400 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                      {copiedKey === 'medd_all' ? 'Copiado!' : 'Copiar Matriz MEDDPICC'}
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <MeddCard letter="M" title="Metrics (Métricas)" content={result.metrics} color="text-blue-400 border-blue-500/30" />
                    <MeddCard letter="E" title="Economic Buyer (Comprador Econômico)" content={result.economicBuyer} color="text-purple-400 border-purple-500/30" />
                    <MeddCard letter="D" title="Decision Criteria (Critérios)" content={result.decisionCriteria} color="text-indigo-400 border-indigo-500/30" />
                    <MeddCard letter="D" title="Decision Process (Processo)" content={result.decisionProcess} color="text-teal-400 border-teal-500/30" />
                    <MeddCard letter="P" title="Paper Process (Fluxo Jurídico)" content={result.paperProcess} color="text-amber-400 border-amber-500/30" />
                    <MeddCard letter="I" title="Identified Pain (Dor Mapeada)" content={result.identifiedPain} color="text-red-400 border-red-500/30" />
                    <MeddCard letter="C" title="Champion (Sponsor Interno)" content={result.champion} color="text-emerald-400 border-emerald-500/30" />
                    <MeddCard letter="C" title="Competitors (Status Quo)" content={result.competitors} color="text-pink-400 border-pink-500/30" />
                  </div>
                </div>
              )}

              {/* Challenger Sale Display */}
              {result.type === 'challenger' && (
                <div className="glass-panel p-6 rounded-3xl border border-line bg-surface space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-line">
                    <h3 className="font-bold text-ink text-base flex items-center gap-2">
                      <Compass className="w-5 h-5 text-amber-400" /> Estratégia Challenger Sale (Teach, Tailor, Take Control)
                    </h3>
                  </div>

                  <div className="space-y-4 text-xs">
                    <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/30 space-y-1">
                      <h4 className="font-bold text-amber-400 text-sm">{result.teach.title}</h4>
                      <p className="text-gray-200 leading-relaxed font-medium">{result.teach.script}</p>
                    </div>

                    <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 space-y-1">
                      <h4 className="font-bold text-indigo-400 text-sm">{result.tailor.title}</h4>
                      <p className="text-gray-200 leading-relaxed font-medium">{result.tailor.script}</p>
                    </div>

                    <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 space-y-1">
                      <h4 className="font-bold text-emerald-400 text-sm">{result.takeControl.title}</h4>
                      <p className="text-gray-200 leading-relaxed font-medium">{result.takeControl.script}</p>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

function MeddCard({ letter, title, content, color }: { letter: string; title: string; content: string; color: string }) {
  return (
    <div className={`p-3.5 rounded-2xl bg-surface-2 border ${color} space-y-1`}>
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-lg bg-line font-black text-ink flex items-center justify-center text-xs">
          {letter}
        </span>
        <span className="font-bold text-ink">{title}</span>
      </div>
      <p className="text-ink-2 leading-relaxed text-[11px] font-medium pt-1">{content}</p>
    </div>
  );
}

function SpinBlock({ title, items, onCopy, copied, color, icon }: { title: string; items: string[]; onCopy: (txt: string) => void; copied: boolean; color: string; icon: React.ReactNode }) {
  const fullText = items.map((it, idx) => `${idx + 1}. ${it}`).join('\n');
  return (
    <div className={`p-5 rounded-2xl border ${color} space-y-3`}>
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-white text-sm flex items-center gap-2">
          {icon} {title}
        </h4>
        <button onClick={() => onCopy(fullText)} className="text-xs text-gray-400 hover:text-white flex items-center gap-1 cursor-pointer">
          {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copiado' : 'Copiar Bloco'}
        </button>
      </div>
      <ul className="space-y-2 text-xs text-gray-300">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 bg-slate-900/50 p-2.5 rounded-xl border border-white/5">
            <span className="font-bold text-atlas-orange">{i + 1}.</span>
            <span className="leading-relaxed">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SnapCard({ title, subtitle, content, checklist, extra, onCopy, copied }: { title: string; subtitle: string; content: string; checklist?: string[]; extra?: string; onCopy: () => void; copied: boolean }) {
  return (
    <div className="glass-card p-5 rounded-2xl border border-line space-y-3 bg-surface">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <h4 className="font-bold text-ink text-sm">{title}</h4>
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-400/10 text-amber-300 font-bold border border-amber-400/20">{subtitle}</span>
        </div>
        <button onClick={onCopy} className="text-xs text-ink-2 hover:text-ink flex items-center gap-1 cursor-pointer">
          {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <p className="text-xs text-ink-2 leading-relaxed font-medium">{content}</p>
      {extra && <p className="text-xs text-atlas-orange font-bold pt-1 border-t border-line">💡 {extra}</p>}
      {checklist && (
        <ul className="space-y-1 text-xs text-ink-2 pt-2 border-t border-line">
          {checklist.map((item, idx) => (
            <li key={idx} className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-green-400 shrink-0" /> {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
