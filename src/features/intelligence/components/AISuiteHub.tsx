import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Shield,
  Users,
  TrendingUp,
  FileCheck,
  MessageSquare,
  PhoneCall,
  Briefcase,
  BookOpen,
  AlertCircle,
  Copy,
  Check,
  Cpu,
  Target,
  RefreshCw,
  Activity,
  Layers,
  Compass,
  GraduationCap,
  SlidersHorizontal,
  Send,
} from 'lucide-react';
import { Card, CardTitle, CardDescription } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { useBrandAccent } from '../../../hooks/useBrandAccent';
import { api } from '../../../lib/api';

interface AICapability {
  id: number;
  title: string;
  category: 'prospecting' | 'sales' | 'intelligence' | 'operations' | 'management';
  icon: typeof Sparkles;
  endpoint: string;
  description: string;
  modelDefault: string;
  samplePayload: Record<string, unknown>;
}

const CAPABILITIES: AICapability[] = [
  {
    id: 1,
    title: 'Quebra-Gelo Inteligente',
    category: 'prospecting',
    icon: Sparkles,
    endpoint: '/api/prospecting/icebreaker',
    description:
      'Pesquisa notícias recentes na web e cria ganchos ultra-personalizados de 2 frases conectando com dores de logística.',
    modelDefault: 'llama3.1:8b',
    samplePayload: { companyName: 'Transportadora Rodoviário Sul' },
  },
  {
    id: 2,
    title: 'Gerador de Scripts & Pitches',
    category: 'sales',
    icon: Briefcase,
    endpoint: '/api/intelligence/suite/cadence-step',
    description:
      'Gera roteiros de abordagem consultiva adaptados ao perfil do decisor e porte da frota.',
    modelDefault: 'llama3.1:8b',
    samplePayload: {
      companyName: 'Expresso Logística',
      contactName: 'Marcos Silveira',
      channel: 'call',
      stepNumber: 1,
      valueProposition: 'Redução de sinistros com telemetria 4G',
    },
  },
  {
    id: 3,
    title: 'Inteligência de WhatsApp',
    category: 'sales',
    icon: MessageSquare,
    // AI-011: rota corrigida — apontava para '/suite/meeting-synthesis' (404, nunca existiu).
    // O backend real usa a mesma síntese de transcrição do motor #16
    // (`aiSuiteRouter.post('/meeting/synthesize', ...)`), cujo payload (`meetingTitle`/
    // `participants`/`rawTranscript`) já é exatamente o formato usado no `samplePayload`
    // abaixo — confirma que a intenção original era esta rota, só com o path errado.
    endpoint: '/api/intelligence/suite/meeting/synthesize',
    description:
      'Mede sentimento de conversas, identifica objeções ocultas e sugere réplicas imediatas.',
    modelDefault: 'llama3.1:8b',
    samplePayload: {
      meetingTitle: 'Alinhamento WhatsApp',
      participants: ['Vendedor Atlas', 'Cliente'],
      rawTranscript:
        'Cliente: O valor mensal ficou acima do meu orçamento atual. Vendedor: Entendo, podemos ajustar a taxa de instalação.',
    },
  },
  {
    id: 4,
    title: 'Resumos Executivos Diários',
    category: 'intelligence',
    icon: Activity,
    // Bug real corrigido aqui: apontava pra '/win-loss-analysis' (a mesma rota do card #12,
    // "Análise Win-Loss"), com título/descrição que não batem com o que aquele endpoint faz —
    // "Resumos Executivos Diários" é, na verdade, o relatório em Markdown de ReportsHub.tsx
    // (POST /report, ver intelligence.routes.ts), não a análise de ganhos/perdas.
    endpoint: '/api/intelligence/report',
    description:
      'Relatório executivo em Markdown a partir das métricas já calculadas (o mesmo endpoint usado por ReportsHub.tsx, sem streaming).',
    modelDefault: 'llama3.1:8b',
    samplePayload: {
      metrics: { totalLeads: 42, closedThisMonth: 6, pipelineValue: 350000 },
      brandId: 'atlasgr',
    },
  },
  {
    id: 5,
    title: 'Lead Scoring & Fit com ICP',
    category: 'prospecting',
    icon: Target,
    endpoint: '/api/intelligence/suite/bitrix-hygiene',
    description:
      'Classifica a pontuação do lead (A/B/C/D) com base em frota estimada, CNAE e faturamento.',
    modelDefault: 'deepseek-r1:8b',
    samplePayload: {
      companyName: 'LOGISTICA & TRANSPORTE VALE VERDE LTDA',
      jobTitle: 'coord operacoes frota',
      segmentHint: 'Transporte de Químicos e Perigosos',
    },
  },
  {
    id: 6,
    title: 'Mapeamento do Comitê de Compra',
    category: 'prospecting',
    icon: Users,
    endpoint: '/api/intelligence/suite/decision-committee',
    description: 'Classifica contatos em Decisor Econômico, Operacional, Técnico e Usuário Final.',
    modelDefault: 'deepseek-r1:8b',
    samplePayload: {
      companyContext: 'Transportadora com 80 carretas frigoríficas',
      contacts: [
        { name: 'Ricardo Mendes', role: 'Diretor Financeiro', department: 'Finanças' },
        { name: 'Cláudia Rocha', role: 'Gerente de Frotas e Logística', department: 'Operações' },
        { name: 'Fábio Souza', role: 'Analista de Rastreamento', department: 'Central' },
      ],
    },
  },
  {
    id: 7,
    title: 'Normalização Bitrix24',
    category: 'prospecting',
    icon: RefreshCw,
    endpoint: '/api/intelligence/suite/bitrix-hygiene',
    description:
      'Higieniza dados brutos, remove sufixos desnecessários (LTDA/ME) e padroniza cargos confusos.',
    modelDefault: 'qwen2.5:7b',
    samplePayload: {
      companyName: 'TRANSLOG TRANSPORTES RODOVIARIOS DO BRASIL S/A',
      jobTitle: 'ger. logistica e pgr',
      rawNotes: 'Interesse em 40 travas de bau',
    },
  },
  {
    id: 8,
    title: 'Cadência & Follow-Up Dinâmico',
    category: 'sales',
    icon: Layers,
    endpoint: '/api/intelligence/suite/cadence-step',
    description:
      'Reescreve e-mails e mensagens de acordo com a reação anterior do lead (abriu, sumiu, pediu tempo).',
    modelDefault: 'llama3.1:8b',
    samplePayload: {
      companyName: 'TransAgro Logística',
      contactName: 'Carlos Eduardo',
      channel: 'whatsapp',
      stepNumber: 3,
      leadReaction: 'pediu_tempo',
      valueProposition: 'Homologação rápida para a safra de grãos',
    },
  },
  {
    id: 9,
    title: 'Simulador de Roleplay (SDR)',
    category: 'sales',
    icon: PhoneCall,
    endpoint: '/api/intelligence/suite/roleplay/turn',
    description:
      'Simula um cliente difícil com objeções reais para treinar quebra de objeção antes da ligação real.',
    modelDefault: 'llama3.1:8b',
    samplePayload: {
      persona: {
        name: 'Valdir Silveira',
        role: 'Dono de Transportadora',
        companyProfile: 'Frota própria de 35 caminhões graneleiros',
        difficulty: 'Difícil',
        mainObjection: 'Já tenho rastreador antigo que atende bem',
        personality: 'Pragmático e desconfiado de novidades',
      },
      history: [],
      userMessage:
        'Olá Sr. Valdir, tudo bem? Sei que sua frota já tem rastreamento, mas nossa tecnologia reduz os falsos alertas em 80%.',
    },
  },
  {
    id: 10,
    title: 'Gerador de Propostas & ROI',
    category: 'sales',
    icon: FileCheck,
    endpoint: '/api/intelligence/suite/proposal/generate',
    description: 'Redige a justificativa de ROI e o resumo executivo da proposta personalizada.',
    modelDefault: 'llama3.1:8b',
    samplePayload: {
      clientName: 'Distribuidora Aliança',
      fleetSize: 45,
      diagnosedPains: [
        'Roubo frequente em trechos urbanos',
        'Alto custo com horas extras de motoristas',
      ],
      proposedModules: [
        'Telemetria Avançada 4G',
        'Trava Eletromagnética de Baú',
        'Sensor de Fadiga',
      ],
      monthlyInvestmentEstimated: 4500,
    },
  },
  {
    id: 11,
    title: 'Assistente Next Best Action',
    category: 'sales',
    icon: Compass,
    endpoint: '/api/intelligence/suite/next-best-action',
    description:
      'Extrai a próxima tarefa com data limite e mensagem sugerida logo após o vendedor registrar uma anotação.',
    modelDefault: 'llama3.1:8b',
    samplePayload: {
      leadOrClientName: 'TransDelta',
      stage: 'Demonstração Realizada',
      rawNote:
        'Reunião excelente com o Diretor Cláudio. Ele gostou do painel de telemetria, mas pediu para enviar até sexta a cotação com desconto para pagamento à vista da instalação.',
      salesRepName: 'Lucas SDR',
    },
  },
  {
    id: 12,
    title: 'Análise Win-Loss (Perdas/Ganhos)',
    category: 'intelligence',
    icon: TrendingUp,
    endpoint: '/api/intelligence/win-loss-analysis',
    description:
      'Identifica padrões estatísticos e comportamentais em negócios ganhos vs. perdidos no CRM.',
    modelDefault: 'deepseek-r1:8b',
    samplePayload: {},
  },
  {
    id: 13,
    title: 'Detector de Churn & Health Score',
    category: 'intelligence',
    icon: AlertCircle,
    endpoint: '/api/intelligence/suite/churn/predict',
    description:
      'Analisa tickets, quedas de telemetria e atrasos financeiros para alertar risco de cancelamento.',
    modelDefault: 'deepseek-r1:8b',
    samplePayload: {
      clientName: 'Transportadora Horizonte',
      contractAgeMonths: 18,
      monthlyRecurringRevenue: 8500,
      openSupportTickets: 4,
      unresolvedComplaints: 2,
      paymentDelaysLast90Days: 1,
      platformUsageDropPercentage: 35,
      recentSentimentNotes: 'Cliente reclamou de demora no atendimento do suporte técnico',
    },
  },
  {
    id: 14,
    title: 'Roteamento Inteligente de Leads',
    category: 'intelligence',
    icon: Cpu,
    endpoint: '/api/intelligence/suite/lead-router/match',
    description:
      'Analisa segmento e urgência do lead para direcionar ao vendedor com maior taxa histórica de fechamento.',
    modelDefault: 'deepseek-r1:8b',
    samplePayload: {
      lead: {
        leadId: 'lead_992',
        companyName: 'Química Express Cargas',
        estimatedFleet: 60,
        segment: 'Químicos / Cargas Perigosas',
        urgency: 'Alta',
        region: 'Sudeste / SP',
      },
      reps: [
        {
          repId: 'rep_1',
          name: 'Rodrigo Matos',
          specialties: ['Frota Pesada', 'Químicos', 'PGR'],
          winRatePercent: 42,
          currentLeadCount: 8,
        },
        {
          repId: 'rep_2',
          name: 'Juliana Paes',
          specialties: ['Distribuição Urbana', 'Frotas Leves'],
          winRatePercent: 35,
          currentLeadCount: 4,
        },
      ],
    },
  },
  {
    id: 15,
    title: 'Copiloto Técnico RAG & Manuais',
    category: 'operations',
    icon: BookOpen,
    endpoint: '/api/intelligence/suite/knowledge/copilot',
    description:
      'Responde a dúvidas sobre homologações de hardware, travas, sensores 1-wire e regras de PGR.',
    modelDefault: 'deepseek-r1:8b',
    samplePayload: {
      // AI-010: a busca na base de conhecimento do tenant roda no servidor
      // (searchService.hybridSearch) — o cliente só envia a pergunta.
      question:
        'Qual módulo e sensor de temperatura é indicado para carreta frigorífica de 2 compartimentos?',
    },
  },
  {
    id: 16,
    title: 'Ata e Síntese de Reuniões',
    category: 'operations',
    icon: FileCheck,
    endpoint: '/api/intelligence/suite/meeting/synthesize',
    description:
      'Converte transcrições brutas de chamadas em atas executivas com pontos acordados e tarefas atribuídas.',
    modelDefault: 'llama3.1:8b',
    samplePayload: {
      meetingTitle: 'Apresentação Comercial AtlasGR vs Concorrente',
      participants: ['Leonardo (Consultor Atlas)', 'Mauro (Gerente Geral Cliente)'],
      rawTranscript:
        'Leonardo: Demonstramos a trava de quinta roda e o bloqueador anti-jammer. Mauro: Gostei muito da redundância via satélite. Vamos avançar com o teste em 10 veículos na próxima terça.',
    },
  },
  {
    id: 17,
    title: 'Triagem na Mesa de Tratamento',
    category: 'operations',
    icon: Shield,
    endpoint: '/api/intelligence/suite/mesa/triage',
    description:
      'Classifica a severidade de alertas (P0 a P3) e entrega o POP imediato de contenção de sinistro.',
    modelDefault: 'llama3.1:8b',
    samplePayload: {
      alertId: 'ALT-88912',
      vehiclePlate: 'ABC-4E12',
      clientName: 'TransLog Cargas Nobres',
      alertType: 'Violação de Trava de Baú + Desvio Crítico de Rota',
      telemetryDataSummary:
        'Veículo desviou 15km da rodovia BR-116 em trecho classificado como Zona Vermelha. Sensor de baú acionado com ignição ligada.',
      cargoValueEstimated: 1250000,
      riskZoneClassification: 'Zona Vermelha / Alto Risco',
    },
  },
  {
    id: 18,
    title: 'Coaching Semanal de Vendedores',
    category: 'management',
    icon: GraduationCap,
    endpoint: '/api/intelligence/suite/coaching/report',
    description:
      'Gera feedback personalizado e micro-hábitos semanais com base nos KPIs individuais de cada vendedor.',
    modelDefault: 'llama3.1:8b',
    samplePayload: {
      sellerName: 'Gabriel Nogueira',
      role: 'SDR / Hunter',
      period: 'Semana 33',
      callsMade: 180,
      connectionsRatePercent: 32,
      meetingsScheduled: 14,
      proposalsSent: 8,
      dealsClosed: 4,
      conversionRatePercent: 22,
      avgTicket: 4200,
      topLossReason: 'Demora em retornar o primeiro contato',
    },
  },
  {
    id: 19,
    title: 'Gerador de Playbooks de Vendas',
    category: 'management',
    icon: BookOpen,
    endpoint: '/api/intelligence/suite/playbook/generate-chapter',
    description:
      'Cria capítulos completos de playbook com perguntas SPIN e roteiros de contorno de objeções.',
    modelDefault: 'llama3.1:8b',
    samplePayload: {
      topic:
        'Como Superar a Objeção "Já tenho seguro e a seguradora não exige telemetria avançada"',
      targetAudience: 'Closer',
      industrySegment: 'Transportadoras de E-commerce e Linha Branca',
    },
  },
  {
    id: 20,
    title: 'Higienização e Anonimização LGPD',
    category: 'management',
    icon: Shield,
    endpoint: '/api/intelligence/suite/lgpd/sanitize',
    description:
      'Detecta e mascara CPFs, placas, dados bancários e dados pessoais sensíveis com score de conformidade.',
    modelDefault: 'qwen2.5:7b',
    samplePayload: {
      rawText:
        'O motorista Carlos Alberto Silva (CPF 123.456.789-10, CNH 987654321) informou que o frete da placa BRA2E19 foi pago na conta corrente 1234-5 do Banco do Brasil.',
      preserveCompanyNames: true,
      maskLevel: 'estrito',
    },
  },
];

export function AISuiteHub() {
  const [selectedId, setSelectedId] = useState<number>(1);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [payloadText, setPayloadText] = useState<string>(
    JSON.stringify(CAPABILITIES[0].samplePayload, null, 2),
  );
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<string | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const accent = useBrandAccent();

  const selectedCap = CAPABILITIES.find((c) => c.id === selectedId) || CAPABILITIES[0];

  const filteredCapabilities = CAPABILITIES.filter((c) => {
    if (categoryFilter === 'all') return true;
    return c.category === categoryFilter;
  });

  const handleSelectCapability = (cap: AICapability) => {
    setSelectedId(cap.id);
    setPayloadText(JSON.stringify(cap.samplePayload, null, 2));
    setExecutionResult(null);
    setExecutionError(null);
  };

  const handleRunCapability = async () => {
    setIsRunning(true);
    setExecutionError(null);
    setExecutionResult(null);
    try {
      let parsedBody = {};
      if (payloadText.trim()) {
        parsedBody = JSON.parse(payloadText);
      }
      const res = await api.post<{ success: boolean; data?: unknown; result?: unknown }>(
        selectedCap.endpoint,
        parsedBody,
      );
      const output = res.data || res.result || res;
      setExecutionResult(typeof output === 'string' ? output : JSON.stringify(output, null, 2));
    } catch (err) {
      setExecutionError((err as Error).message || 'Falha ao executar serviço de IA');
    } finally {
      setIsRunning(false);
    }
  };

  const handleCopyResult = () => {
    if (!executionResult) return;
    void navigator.clipboard.writeText(executionResult);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-transparent p-6 md:p-8 space-y-6">
      {/* Header com indicador de status */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-success/10 text-success-active dark:text-success border border-success/20">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              Ollama & Cloud Multi-Engine Ready
            </span>
            <span className="text-xs text-ink-3">20 Motores de IA Ativos</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-ink tracking-tight mt-1.5">
            Central de Inteligência Artificial — Suíte Completa
          </h1>
          <p className="text-sm text-ink-2 mt-0.5">
            Execute, teste e orquestre os 20 motores de IA integrados à operação da AtlasGR e
            TotalTrac.
          </p>
        </div>

        {/* Filtros de Categoria */}
        <div className="flex flex-wrap items-center gap-1.5 bg-surface-2/60 p-1.5 rounded-xl border border-border/40">
          {[
            { id: 'all', label: 'Todos (20)' },
            { id: 'prospecting', label: 'Prospecção' },
            { id: 'sales', label: 'Vendas' },
            { id: 'intelligence', label: 'Inteligência' },
            { id: 'operations', label: 'Operações' },
            { id: 'management', label: 'Gestão' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setCategoryFilter(f.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                categoryFilter === f.id
                  ? 'bg-surface text-ink shadow-sm border border-border/60'
                  : 'text-ink-2 hover:text-ink hover:bg-surface/50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      {/* Layout em 2 Colunas: Lista dos 20 Recursos + Painel de Teste/Execução */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Coluna Esquerda: Grade dos Motores */}
        <div className="lg:col-span-5 space-y-2.5 max-h-[750px] overflow-y-auto pr-1">
          {filteredCapabilities.map((cap) => {
            const Icon = cap.icon;
            const isSelected = cap.id === selectedId;
            return (
              <button
                type="button"
                key={cap.id}
                onClick={() => handleSelectCapability(cap)}
                aria-pressed={isSelected}
                className={`w-full text-left group p-3.5 rounded-xl border cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  isSelected
                    ? `bg-surface shadow-md ${accent.border} ring-2 ring-primary/20`
                    : `bg-surface/50 hover:bg-surface border-border/50 ${accent.hoverBorder}`
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                      isSelected ? `${accent.bgSoft} ${accent.text}` : 'bg-surface-2 text-ink-2'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-ink truncate group-hover:text-primary transition-colors">
                        <span className="text-xs font-mono text-ink-3 mr-1.5">#{cap.id}</span>
                        {cap.title}
                      </h3>
                      <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-surface-2 border border-border/50 text-ink-3">
                        {cap.modelDefault}
                      </span>
                    </div>
                    <p className="text-xs text-ink-2 line-clamp-2 mt-1 leading-relaxed">
                      {cap.description}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Coluna Direita: Console Interativo de Execução */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="border border-border/60 shadow-sm bg-surface">
            <div className="p-5 border-b border-border/40 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${accent.bgSoft} ${accent.text}`}
                >
                  <selectedCap.icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-ink-3">
                      Motor #{selectedCap.id}
                    </span>
                    <CardTitle className="text-base font-bold text-ink">
                      {selectedCap.title}
                    </CardTitle>
                  </div>
                  <CardDescription className="text-xs text-ink-2 mt-0.5">
                    Endpoint:{' '}
                    <code className="font-mono text-primary bg-primary/10 px-1 py-0.5 rounded text-[11px]">
                      {selectedCap.endpoint}
                    </code>
                  </CardDescription>
                </div>
              </div>

              <Button
                onClick={handleRunCapability}
                disabled={isRunning}
                className="gap-2 shrink-0 font-semibold"
              >
                {isRunning ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Processando IA...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Executar Motor
                  </>
                )}
              </Button>
            </div>

            <div className="p-5 space-y-4">
              {/* Editor de Payload */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="ai-suite-payload"
                    className="text-xs font-semibold text-ink flex items-center gap-1.5"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-ink-3" />
                    Parâmetros de Entrada (JSON Payload):
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setPayloadText(JSON.stringify(selectedCap.samplePayload, null, 2))
                    }
                    className="text-xs text-primary hover:underline font-medium"
                  >
                    Restaurar Exemplo da AtlasGR
                  </button>
                </div>
                <textarea
                  id="ai-suite-payload"
                  value={payloadText}
                  onChange={(e) => setPayloadText(e.target.value)}
                  rows={6}
                  className="w-full font-mono text-xs p-3 rounded-lg bg-surface-2 border border-border/60 text-ink focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
                  placeholder="Insira os parâmetros em formato JSON..."
                />
              </div>

              {/* Resultado da Execução */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  {/* Não é <label htmlFor>: descreve uma área de resultado somente leitura
                      (motion.div abaixo), não um controle de formulário. */}
                  <span className="text-xs font-semibold text-ink flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-brand" />
                    Resultado do Processamento:
                  </span>
                  {executionResult && (
                    <button
                      type="button"
                      onClick={handleCopyResult}
                      className="text-xs text-ink-2 hover:text-ink flex items-center gap-1 font-medium"
                    >
                      {copied ? (
                        <Check className="w-3.5 h-3.5 text-success" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {copied ? 'Copiado!' : 'Copiar Resposta'}
                    </button>
                  )}
                </div>

                <AnimatePresence mode="wait">
                  {executionError && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="p-3.5 rounded-lg bg-danger/10 border border-danger/20 text-danger-active dark:text-danger text-xs flex items-start gap-2.5"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">Erro durante a chamada do motor:</p>
                        <p className="font-mono text-[11px] mt-0.5">{executionError}</p>
                      </div>
                    </motion.div>
                  )}

                  {executionResult && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="p-3.5 rounded-lg bg-surface-2 border border-border/60 overflow-x-auto max-h-[350px]"
                    >
                      <pre className="font-mono text-xs text-ink whitespace-pre-wrap leading-relaxed">
                        {executionResult}
                      </pre>
                    </motion.div>
                  )}

                  {!executionResult && !executionError && (
                    <div className="p-8 rounded-lg border border-dashed border-border/60 text-center text-ink-3 text-xs flex flex-col items-center justify-center gap-2">
                      <Cpu className="w-6 h-6 stroke-[1.5] text-ink-3/70" />
                      <span>
                        Clique em &ldquo;Executar Motor&rdquo; acima para processar com o modelo
                        configurado no servidor.
                      </span>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
