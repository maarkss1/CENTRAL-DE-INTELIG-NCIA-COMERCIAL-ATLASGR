import { useState } from 'react';
import { motion } from 'framer-motion';
import { Target, Zap, Flame, Sparkles, Copy, Check, RefreshCw, BookOpen, HelpCircle, Lightbulb, ShieldAlert, ShieldCheck, Award, FileText, Compass } from 'lucide-react';
import { Button } from '../../../components/ui/Button';

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

export function SalesMethodologyStudio() {
  const [activeTab, setActiveTab] = useState<FrameworkType>('spin');
  const [form, setForm] = useState<MethodologyFormState>({
    targetPersona: 'Diretor Comercial / VP de Vendas / CEO',
    companySegment: 'Tecnologia / SaaS B2B / Logística',
    icpSize: 'Mid-Market (50 a 500 colaboradores)',
    techStack: 'Salesforce, AWS, React, SAP',
    solutionName: 'Plataforma AtlasGR (IA + Prospecção Autônoma)',
    mainPainPoint: 'Ciclo de vendas longo e perda de tempo de SDRs com pesquisas manuais de leads',
    mainBenefit: 'Aumento de 300% na taxa de qualificação e redução de 50% no CAC'
  });

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setResult(null);

    await new Promise((r) => setTimeout(r, 800));

    if (activeTab === 'spin') {
      setResult({
        type: 'spin',
        meta: { persona: form.targetPersona, icpSize: form.icpSize, matchScore: '98%' },
        situation: [
          `Como o seu time de vendas realiza o mapeamento e qualificação de novos clientes hoje no segmento de ${form.companySegment}?`,
          `Quantos SDRs e executivos de conta utilizam a stack técnica (${form.techStack}) para gerenciar a operação?`,
          `Qual é o tempo médio gasto por vendedor para pesquisar o histórico de um lead de porte ${form.icpSize} antes da primeira ligação?`
        ],
        problem: [
          `Vocês percebem gargalos na passagem de leads da pré-venda para os executivos ao lidar com a dor de: "${form.mainPainPoint}"?`,
          `A falta de dados de contatos diretos (telefones e e-mails de decisores) tem inflado o Custo de Aquisição de Clientes (CAC)?`,
          `Qual é a maior resistência que a figura de ${form.targetPersona} enfrenta para atingir as metas trimestrais da empresa?`
        ],
        implication: [
          `Se a equipe continuar enfrentando "${form.mainPainPoint}", qual é o impacto financeiro acumulado por mês para uma operação de porte ${form.icpSize}?`,
          `Como a demora de 3 a 5 dias no primeiro contato com o lead afeta a taxa de conversão final frente aos concorrentes?`,
          `Qual é a consequência de não ter previsibilidade de pipeline para o cargo de ${form.targetPersona} no planejamento anual?`
        ],
        needPayoff: [
          `Se você pudesse automatizar 80% da pesquisa de leads e entregar informações enriquecidas via ${form.solutionName}, quanto a sua conversão aumentaria?`,
          `Como alcançar o resultado de "${form.mainBenefit}" impactaria a posição de mercado da empresa nos próximos 90 dias?`,
          `Qual seria o valor estratégico de integrar inteligência autônoma diretamente com a sua stack atual (${form.techStack})?`
        ],
        objectionHandler: [
          { objection: 'Já temos uma ferramenta de CRM/leads.', response: `Exatamente por utilizar ${form.techStack}, o ${form.solutionName} não substitui, mas potencializa o seu ecossistema atual, entregando dados validados em milissegundos.` },
          { objection: 'Não temos orçamento agora.', response: `Ao resolver "${form.mainPainPoint}", nossa solução se paga no primeiro contrato fechado, gerando ${form.mainBenefit}.` }
        ]
      });
    } else if (activeTab === 'snap') {
      setResult({
        type: 'snap',
        meta: { persona: form.targetPersona, icpSize: form.icpSize, matchScore: '97%' },
        simple: {
          title: 'S — Keep it Simple (Simplicidade Extrema para C-Level)',
          description: `Apresente o ${form.solutionName} sem jargões: "Uma camada de IA autônoma para ${form.targetPersona} que resolve ${form.mainPainPoint} em 3 cliques."`,
          checklist: ['Proposta comercial concisa de 1 página', 'Sem onboarding burocrático ou código complexo', `Conexão nativa com a stack (${form.techStack})`]
        },
        invaluable: {
          title: 'N — Be iNvaluable (Diferencial Inestimável)',
          description: `Entregue dados que o cliente não possui: "Detectamos que 45% das empresas de porte ${form.icpSize} no setor de ${form.companySegment} perdem vendas por falta de velocidade na qualificação."`,
          differentiator: `Garantia de ${form.mainBenefit} com automação de ponta.`
        },
        align: {
          title: 'A — Always Align (Alinhamento com Objetivos da Persona)',
          description: `Alinhe o projeto diretamente aos KPIs da liderança (${form.targetPersona}): "${form.mainBenefit}."`,
          strategicFit: `Compatibilidade total com o plano de expansão de receita da operação.`
        },
        priorities: {
          title: 'P — Raise Priorities (Senso de Urgência & Custo da Inação)',
          description: `Destaque a urgência comercial para uma empresa de porte ${form.icpSize}.`,
          urgencyTrigger: `Custo estimado de inação: R$ 18.000/mês em oportunidades perdidas por cada vendedor sem prospecção automatizada.`
        }
      });
    } else if (activeTab === 'aida') {
      setResult({
        type: 'aida',
        meta: { persona: form.targetPersona, icpSize: form.icpSize, matchScore: '99%' },
        attention: {
          hook: `Assunto: ${form.targetPersona}: Solução para ${form.mainPainPoint} na ${form.companySegment}`,
          opening: `Olá ${form.targetPersona}, acompanhando operações de porte ${form.icpSize} no setor de ${form.companySegment}, notamos o desafio de manter a eficiência na aquisição de clientes.`
        },
        interest: {
          body: `Percebemos que empresas operando com a stack (${form.techStack}) costumam perder tempo precioso quando a qualificação de leads é manual, gerando a dor de ${form.mainPainPoint}.`
        },
        desire: {
          proof: `Com o ${form.solutionName}, entregamos ${form.mainBenefit}. Nossa tecnologia autônoma permite que decisores no seu cargo acelerem o fechamento sem aumentar a equipe.`
        },
        action: {
          cta: `Teria 10 minutos nesta quinta-feira às 14h para uma simulação prática com dados da sua empresa?`,
          linkText: 'Responder E-mail para Agendar Demo'
        }
      });
    } else if (activeTab === 'meddpicc') {
      setResult({
        type: 'meddpicc',
        meta: { persona: form.targetPersona, icpSize: form.icpSize, matchScore: '99%' },
        metrics: `KPIs Quantificáveis: Redução de 50% no CAC, ganho de 15h/semana por SDR e ${form.mainBenefit}.`,
        economicBuyer: `Decisor Econômico: ${form.targetPersona} (detém autoridade de orçamento e aprovação final de capex/opex).`,
        decisionCriteria: `Critérios de Escolha: Integração com ${form.techStack}, compliance LGPD, velocidade de enriquecimento e facilidade de adoção.`,
        decisionProcess: `Processo de Decisão: Demo técnica (1ª semana) -> Validação com SDRs (2ª semana) -> Aprovação de contrato (3ª semana).`,
        paperProcess: `Fluxo Jurídico/Compras: Validação da minuta de SaaS B2B, emissão de NDA e faturamento faturado via CNPJ.`,
        identifiedPain: `Dor Crítica Mapeada: "${form.mainPainPoint}", gerando perda de receita recorrente e ciclo de vendas estagnado.`,
        champion: `Internally Champion: Coordenador de Pré-vendas ou Head de Sales Ops que advoga pela automatização.`,
        competitors: `Concorrentes/Status Quo: Prospecção manual via planilha (status quo) vs Soluções concorrentes sem IA integrada.`
      });
    } else {
      // Challenger Sale
      setResult({
        type: 'challenger',
        meta: { persona: form.targetPersona, icpSize: form.icpSize, matchScore: '98%' },
        teach: {
          title: '1. Teach (Ensine com Insights Únicos)',
          script: `“Muitas empresas no setor de ${form.companySegment} acreditam que contratar mais SDRs resolve a meta. Na verdade, nossos dados mostram que o problema é a qualidade da informação prévia: 60% do tempo do vendedor é desperdiçado pesquisando contatos errados.”`
        },
        tailor: {
          title: '2. Tailor (Personalize para a Persona)',
          script: `“Para você como ${form.targetPersona}, o que realmente importa não é o volume de tentativas, mas sim garantir ${form.mainBenefit} com total alinhamento à sua infraestrutura (${form.techStack}).”`
        },
        takeControl: {
          title: '3. Take Control (Assuma o Controle Comercial)',
          script: `“Para avançarmos com segurança, não precisamos de um piloto longo. Sugiro rodarmos um teste de 14 dias com 500 leads reais da ${form.companySegment}. Se provarmos o resultado, fechamos o contrato anual. Vamos agendar para terça-feira?”`
        }
      });
    }

    setGenerating(false);
  };

  return (
    <div className="space-y-8 font-sans">
      
      {/* Header Studio */}
      <div className="glass-panel p-6 sm:p-8 rounded-[2.5rem] border border-white/10 relative overflow-hidden bg-slate-900/70 backdrop-blur-xl shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-indigo-500/10 via-atlas-orange/10 to-transparent rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-atlas-orange via-amber-500 to-red-600 flex items-center justify-center text-white shadow-xl shadow-atlas-orange/20">
              <BookOpen className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-black text-white tracking-tight">Estúdio de Metodologias de Vendas B2B</h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" /> 5 Frameworks Elite
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                SPIN Selling · SNAP Selling · AIDA Engine · MEDDPICC Enterprise · Challenger Sale
              </p>
            </div>
          </div>

          {/* Selector Tabs (5 Frameworks) */}
          <div className="flex flex-wrap items-center bg-slate-800/80 p-1.5 rounded-2xl border border-white/10 w-full md:w-auto gap-1">
            <button
              onClick={() => { setActiveTab('spin'); setResult(null); }}
              className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                activeTab === 'spin' ? 'bg-atlas-orange text-white shadow-lg shadow-atlas-orange/20' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Target className="w-3.5 h-3.5" /> SPIN
            </button>
            <button
              onClick={() => { setActiveTab('snap'); setResult(null); }}
              className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                activeTab === 'snap' ? 'bg-atlas-orange text-white shadow-lg shadow-atlas-orange/20' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Zap className="w-3.5 h-3.5" /> SNAP
            </button>
            <button
              onClick={() => { setActiveTab('aida'); setResult(null); }}
              className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                activeTab === 'aida' ? 'bg-atlas-orange text-white shadow-lg shadow-atlas-orange/20' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Flame className="w-3.5 h-3.5" /> AIDA
            </button>
            <button
              onClick={() => { setActiveTab('meddpicc'); setResult(null); }}
              className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                activeTab === 'meddpicc' ? 'bg-atlas-orange text-white shadow-lg shadow-atlas-orange/20' : 'text-gray-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" /> MEDDPICC
            </button>
            <button
              onClick={() => { setActiveTab('challenger'); setResult(null); }}
              className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                activeTab === 'challenger' ? 'bg-atlas-orange text-white shadow-lg shadow-atlas-orange/20' : 'text-gray-400 hover:text-white'
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
        <div className="lg:col-span-5 glass-panel p-6 rounded-3xl border border-white/10 bg-slate-900/60 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-atlas-orange" />
              <h3 className="font-bold text-white text-base">Parâmetros ICP & Persona Target</h3>
            </div>
            <span className="text-[10px] bg-atlas-orange/10 text-atlas-orange font-bold px-2 py-0.5 rounded border border-atlas-orange/20">
              Precisão Máxima
            </span>
          </div>

          <div className="space-y-3.5 text-xs">
            <div>
              <label className="font-bold text-gray-300 block mb-1">Cargo da Persona Target (Decisor C-Level/VP)</label>
              <input
                type="text"
                value={form.targetPersona}
                onChange={(e) => setForm({ ...form, targetPersona: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-800 text-white border border-white/10 focus:outline-none focus:ring-1 focus:ring-atlas-orange"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-gray-300 block mb-1">Porte do ICP (Tamanho)</label>
                <select
                  value={form.icpSize}
                  onChange={(e) => setForm({ ...form, icpSize: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white border border-white/10 focus:outline-none focus:ring-1 focus:ring-atlas-orange"
                >
                  <option value="Enterprise (+500 colaboradores)">Enterprise (+500 colab.)</option>
                  <option value="Mid-Market (50 a 500 colaboradores)">Mid-Market (50-500 colab.)</option>
                  <option value="SMB (até 50 colaboradores)">SMB (até 50 colab.)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-gray-300 block mb-1">Segmento da Empresa</label>
                <input
                  type="text"
                  value={form.companySegment}
                  onChange={(e) => setForm({ ...form, companySegment: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 text-white border border-white/10 focus:outline-none focus:ring-1 focus:ring-atlas-orange"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-gray-300 block mb-1">Stack Tecnológica Mapeada (Firmographics)</label>
              <input
                type="text"
                value={form.techStack}
                onChange={(e) => setForm({ ...form, techStack: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-800 text-white border border-white/10 focus:outline-none focus:ring-1 focus:ring-atlas-orange"
              />
            </div>

            <div>
              <label className="font-bold text-gray-300 block mb-1">Nome da Sua Solução / Produto</label>
              <input
                type="text"
                value={form.solutionName}
                onChange={(e) => setForm({ ...form, solutionName: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-800 text-white border border-white/10 focus:outline-none focus:ring-1 focus:ring-atlas-orange"
              />
            </div>

            <div>
              <label className="font-bold text-gray-300 block mb-1">Dor Principal do Cliente (Problem Statement)</label>
              <textarea
                rows={2}
                value={form.mainPainPoint}
                onChange={(e) => setForm({ ...form, mainPainPoint: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-800 text-white border border-white/10 focus:outline-none focus:ring-1 focus:ring-atlas-orange"
              />
            </div>

            <div>
              <label className="font-bold text-gray-300 block mb-1">Principal Benefício / ROI Prometido</label>
              <textarea
                rows={2}
                value={form.mainBenefit}
                onChange={(e) => setForm({ ...form, mainBenefit: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-800 text-white border border-white/10 focus:outline-none focus:ring-1 focus:ring-atlas-orange"
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
            <div className="glass-panel p-12 rounded-3xl border border-white/10 text-center bg-slate-900/40 flex flex-col items-center justify-center min-h-[440px]">
              <div className="w-16 h-16 rounded-2xl bg-atlas-orange/10 flex items-center justify-center text-atlas-orange mb-4">
                <Lightbulb className="w-8 h-8 animate-bounce" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Motor de Engenharia Comercial Pronto</h3>
              <p className="text-gray-400 text-xs max-w-md leading-relaxed">
                Escolha entre **SPIN**, **SNAP**, **AIDA**, **MEDDPICC** ou **Challenger** no topo para gerar estratégias sob medida.
              </p>
            </div>
          )}

          {generating && (
            <div className="glass-panel p-12 rounded-3xl border border-white/10 text-center bg-slate-900/40 flex flex-col items-center justify-center min-h-[440px]">
              <RefreshCw className="w-10 h-10 text-atlas-orange animate-spin mb-4" />
              <h3 className="text-lg font-bold text-white mb-1">Processando Metodologia {activeTab.toUpperCase()}</h3>
              <p className="text-xs text-gray-400">Modelando dados para a persona <strong className="text-white">{form.targetPersona}</strong> ({form.icpSize})...</p>
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
                <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-extrabold border border-emerald-500/30">
                  {result.meta.matchScore} Fit Score
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
                <div className="glass-panel p-6 rounded-3xl border border-white/10 bg-slate-900/60 space-y-6">
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <h3 className="font-bold text-white text-base flex items-center gap-2">
                      <Flame className="w-5 h-5 text-atlas-orange" /> Copywriter AIDA Hiper-personalizado
                    </h3>
                    <Button variant="outline" size="sm" onClick={() => handleCopy(`${result.attention.hook}\n\n${result.attention.opening}\n\n${result.interest.body}\n\n${result.desire.proof}\n\n${result.action.cta}`, 'aida_all')} className="text-xs">
                      {copiedKey === 'aida_all' ? <Check className="w-3.5 h-3.5 text-green-400 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                      {copiedKey === 'aida_all' ? 'Copiado!' : 'Copiar Copy Completa'}
                    </Button>
                  </div>

                  <div className="space-y-4 text-xs">
                    <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-indigo-500/30">
                      <span className="font-extrabold text-indigo-400 uppercase tracking-wider block mb-1">A — Attention (Hook C-Level)</span>
                      <p className="font-bold text-white mb-1">{result.attention.hook}</p>
                      <p className="text-gray-300">{result.attention.opening}</p>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-blue-500/30">
                      <span className="font-extrabold text-blue-400 uppercase tracking-wider block mb-1">I — Interest (Problema & Stack Technographics)</span>
                      <p className="text-gray-300 leading-relaxed">{result.interest.body}</p>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-amber-500/30">
                      <span className="font-extrabold text-amber-400 uppercase tracking-wider block mb-1">D — Desire (Diferencial & ROI Prometido)</span>
                      <p className="text-gray-300 leading-relaxed">{result.desire.proof}</p>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-green-500/30">
                      <span className="font-extrabold text-green-400 uppercase tracking-wider block mb-1">A — Action (Chamada com Baixa Fricção)</span>
                      <p className="text-white font-bold">{result.action.cta}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* MEDDPICC Display */}
              {result.type === 'meddpicc' && (
                <div className="glass-panel p-6 rounded-3xl border border-white/10 bg-slate-900/60 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <h3 className="font-bold text-white text-base flex items-center gap-2">
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
                <div className="glass-panel p-6 rounded-3xl border border-white/10 bg-slate-900/60 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <h3 className="font-bold text-white text-base flex items-center gap-2">
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
    <div className={`p-3.5 rounded-2xl bg-slate-800/70 border ${color} space-y-1`}>
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-lg bg-white/10 font-black text-white flex items-center justify-center text-xs">
          {letter}
        </span>
        <span className="font-bold text-white">{title}</span>
      </div>
      <p className="text-gray-300 leading-relaxed text-[11px] font-medium pt-1">{content}</p>
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
    <div className="glass-card p-5 rounded-2xl border border-white/10 space-y-3 bg-slate-900/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <h4 className="font-bold text-white text-sm">{title}</h4>
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-400/10 text-amber-300 font-bold border border-amber-400/20">{subtitle}</span>
        </div>
        <button onClick={onCopy} className="text-xs text-gray-400 hover:text-white flex items-center gap-1 cursor-pointer">
          {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <p className="text-xs text-gray-300 leading-relaxed font-medium">{content}</p>
      {extra && <p className="text-xs text-atlas-orange font-bold pt-1 border-t border-white/5">💡 {extra}</p>}
      {checklist && (
        <ul className="space-y-1 text-xs text-gray-400 pt-2 border-t border-white/5">
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
