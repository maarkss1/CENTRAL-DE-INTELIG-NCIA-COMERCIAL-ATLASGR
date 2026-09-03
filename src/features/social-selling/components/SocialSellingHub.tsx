import { useState } from 'react';
import {
  Share2,
  ExternalLink,
  FileText,
  Download,
  Layers,
  Search,
  Copy,
  Check,
  Sparkles,
  Target,
  Award,
} from 'lucide-react';
import { ExecutiveHeader } from '../../../components/layout/ExecutiveHeader';

export function SocialSellingHub() {
  const [activeSubTab, setActiveSubTab] = useState<
    'motor' | 'pipeline' | 'linkedin' | 'posts' | 'materiais'
  >('motor');
  const [iframeKey, setIframeKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedPostIndex, setCopiedPostIndex] = useState<number | null>(null);

  const subTabs = [
    {
      id: 'motor',
      label: 'Motor de Social Selling',
      path: '/tools/social-selling/Motor de Social Selling Atlas GR.html',
    },
    {
      id: 'pipeline',
      label: 'Pipeline Tracker',
      path: '/tools/social-selling/Atlas GR Pipeline.html',
    },
    {
      id: 'linkedin',
      label: 'LinkedIn Campaign Kit',
      path: '/tools/social-selling/AtlasGR Kit Campanha LinkedIn Completo.html',
    },
    { id: 'posts', label: 'Posts Semanais (1-5)' },
    { id: 'materiais', label: 'Manual & Apresentação' },
  ] as const;

  const weeklyPostsData = [
    {
      semana: 'Semana 1',
      tema: 'Operação reativa vs. governável',
      desc: 'Conceito chave sobre maturidade em Gerenciamento de Risco (GR).',
      copy: 'Você sabia que 74% dos sinistros no transporte de carga ocorrem em operações que operam no modelo reativo? Na Atlas GR, transformamos o risco em governança preditiva. Conheça a diferença entre agir depois do sinistro e antecipar a ameaça.',
    },
    {
      semana: 'Semana 2',
      tema: 'Tecnologia útil vs. cosmética',
      desc: 'Como identificar soluções reais e ferramentas eficientes no mercado de GR.',
      copy: 'Nem todo dashboard é tecnologia útil. Muitas soluções entregam gráficos bonitos mas falham no momento crítico da tomada de decisão. A tecnologia de GR da Atlas foca em resposta imediata, integração de telemetria e validação cadastral rigorosa.',
    },
    {
      semana: 'Semana 3',
      tema: 'Segurança como performance',
      desc: 'Redução de perdas operacionais gerando margem líquida e ROI comprovado.',
      copy: 'Segurança logística não é custo, é alavanca de margem operacional. Cada sinistro evitado é lucro preservado diretamente na DRE da transportadora. Veja como o Atlas Profile e nossas torres reduzem em até 40% a sinistralidade acumulada.',
    },
    {
      semana: 'Semana 4',
      tema: 'Risco antes do sinistro',
      desc: 'Prevenção proativa, score preditivo e auditoria cadastral de motoristas.',
      copy: 'O gerenciamento de risco moderno começa muito antes do caminhão ligar o motor. A análise contínua de perfil de motoristas e ajudantes (Atlas Profile) garante que a carga viaje apenas com profissionais qualificados e checados.',
    },
    {
      semana: 'Semana 5',
      tema: 'Improviso vs. processo escalável',
      desc: 'Estruturação de processos comerciais e operacionais em Gerenciamento de Risco.',
      copy: 'Operações logísticas que dependem de processos manuais ou improvisos não escalam. Com a infraestrutura comercial e tecnológica da Atlas GR, sua transportadora ganha consistência, dados auditáveis e SLA garantido.',
    },
  ];

  const filteredPosts = weeklyPostsData.filter(
    (p) =>
      p.semana.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.tema.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.copy.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleCopyCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedPostIndex(index);
    setTimeout(() => setCopiedPostIndex(null), 2000);
  };

  const currentTab = subTabs.find((t) => t.id === activeSubTab);

  return (
    <div
      className={`flex flex-col h-full space-y-4 bg-bg ${isFullscreen ? 'fixed inset-0 z-50 p-4 bg-bg overflow-hidden' : 'p-6'}`}
    >
      {/* Unified Executive Header */}
      <ExecutiveHeader
        title="Social Selling Atlas GR"
        subtitle="Plano de ação, rastreador de pipeline, kit de campanhas LinkedIn e acervo de conteúdos."
        icon={Share2}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
        onRefresh={() => setIframeKey((k) => k + 1)}
      />

      {/* KPI Cards Bar */}
      {!isFullscreen && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3.5 bg-surface border border-line rounded-2xl flex items-center gap-3">
            <div className="p-2.5 bg-brand/10 text-brand rounded-xl">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-ink-2">Motor de Vendas</div>
              <div className="text-sm font-bold text-ink">Estratégia Outbound</div>
            </div>
          </div>
          <div className="p-3.5 bg-surface border border-line rounded-2xl flex items-center gap-3">
            <div className="p-2.5 bg-info/10 text-info-active dark:text-info rounded-xl">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-ink-2">Pipeline Tracker</div>
              <div className="text-sm font-bold text-ink">Alertas Automáticos</div>
            </div>
          </div>
          <div className="p-3.5 bg-surface border border-line rounded-2xl flex items-center gap-3">
            <div className="p-2.5 bg-success/10 text-success-active dark:text-success rounded-xl">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-ink-2">Posts LinkedIn</div>
              <div className="text-sm font-bold text-ink">5 Semanas de Copys</div>
            </div>
          </div>
          <div className="p-3.5 bg-surface border border-line rounded-2xl flex items-center gap-3">
            <div className="p-2.5 bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 rounded-xl">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-ink-2">Manual & Deck</div>
              <div className="text-sm font-bold text-ink">Brand + PPTX</div>
            </div>
          </div>
        </div>
      )}

      {/* Sub-tab Selector & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {subTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as typeof activeSubTab)}
              className={`px-4 py-2 text-xs font-semibold rounded-xl border whitespace-nowrap transition-all ${
                activeSubTab === tab.id
                  ? 'bg-brand/10 border-brand/40 text-brand shadow-sm'
                  : 'bg-soft/50 border-line text-ink-2 hover:bg-soft hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {currentTab && 'path' in currentTab && currentTab.path && (
          <a
            href={currentTab.path}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-brand hover:underline flex items-center gap-1.5 self-end sm:self-auto"
          >
            Abrir em Nova Aba <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {/* Main View Container */}
      <div
        className={`flex-1 bg-surface rounded-2xl border border-line overflow-hidden shadow-sm flex flex-col ${isFullscreen ? 'h-[calc(100vh-140px)]' : 'min-h-[650px]'}`}
      >
        {activeSubTab === 'motor' && (
          <iframe
            key={`motor-${iframeKey}`}
            src="/tools/social-selling/Motor de Social Selling Atlas GR.html"
            className="w-full h-full min-h-[650px] border-none"
            title="Motor de Social Selling Atlas GR"
          />
        )}

        {activeSubTab === 'pipeline' && (
          <iframe
            key={`pipeline-${iframeKey}`}
            src="/tools/social-selling/Atlas GR Pipeline.html"
            className="w-full h-full min-h-[650px] border-none"
            title="Atlas GR Pipeline Tracker"
          />
        )}

        {activeSubTab === 'linkedin' && (
          <iframe
            key={`linkedin-${iframeKey}`}
            src="/tools/social-selling/AtlasGR Kit Campanha LinkedIn Completo.html"
            className="w-full h-full min-h-[650px] border-none"
            title="AtlasGR Kit Campanha LinkedIn Completo"
          />
        )}

        {activeSubTab === 'posts' && (
          <div className="p-6 space-y-6 overflow-y-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-ink">
                  Acervo de Posts para LinkedIn (Semanas 1 a 5)
                </h2>
                <p className="text-xs text-ink-2">
                  Textos estratégicos e copys prontas para publicação e engajamento comercial em GR.
                </p>
              </div>

              {/* Quick Search Bar */}
              <div className="relative w-full md:w-72">
                <Search className="w-4 h-4 text-ink-2 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar por palavra-chave..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs bg-soft/50 border border-line rounded-xl text-ink focus:outline-none focus:border-brand"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredPosts.map((item, idx) => (
                <div
                  key={idx}
                  className="p-5 bg-soft/30 rounded-2xl border border-line space-y-3 flex flex-col justify-between hover:border-brand/30 transition-all"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-brand/10 text-brand border border-brand/20">
                        {item.semana}
                      </span>
                      <button
                        onClick={() => handleCopyCopy(item.copy, idx)}
                        className="px-2.5 py-1 text-xs font-medium bg-soft text-ink hover:bg-line rounded-lg border border-line flex items-center gap-1.5 transition-colors"
                        title="Copiar texto para publicação no LinkedIn"
                      >
                        {copiedPostIndex === idx ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-success-active dark:text-success" />
                            <span className="text-success-active dark:text-success font-bold">Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            Copiar Copy
                          </>
                        )}
                      </button>
                    </div>
                    <h3 className="text-sm font-bold text-ink">{item.tema}</h3>
                    <p className="text-xs text-ink-2 font-medium">{item.desc}</p>
                    <div className="p-3 bg-surface rounded-xl border border-line/60 text-xs text-ink-2 leading-relaxed italic">
                      "{item.copy}"
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSubTab === 'materiais' && (
          <div className="p-6 space-y-6 overflow-y-auto">
            <div>
              <h2 className="text-base font-bold text-ink">Materiais e Ativos Institucionais</h2>
              <p className="text-xs text-ink-2">
                Documentos oficiais de apresentação e guia de marca para o Social Selling.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-5 bg-soft/40 rounded-2xl border border-line space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-red-500/10 text-red-500 rounded-xl">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-ink">
                      Manual de Identidade Visual Atlas
                    </h3>
                    <p className="text-xs text-ink-2">Guia completo de aplicação da marca (PDF)</p>
                  </div>
                </div>
                <a
                  href="/tools/social-selling/Manual de Identidade Visual – Atlas_compressed (1).pdf"
                  target="_blank"
                  download
                  className="w-full py-2.5 px-4 bg-brand-active text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 hover:bg-brand-hover transition-colors shadow-sm"
                  rel="noopener"
                >
                  <Download className="w-4 h-4" /> Download Manual (PDF)
                </a>
              </div>

              <div className="p-5 bg-soft/40 rounded-2xl border border-line space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-500/10 text-blue-500 rounded-xl">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-ink">
                      Apresentação Social Selling Atlas
                    </h3>
                    <p className="text-xs text-ink-2">
                      Deck comercial oficial de Social Selling (PPTX)
                    </p>
                  </div>
                </div>
                <a
                  href="/tools/social-selling/Social Selling Atlas.pptx"
                  target="_blank"
                  download
                  className="w-full py-2.5 px-4 bg-brand-active text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 hover:bg-brand-hover transition-colors shadow-sm"
                  rel="noopener"
                >
                  <Download className="w-4 h-4" /> Download Apresentação (PPTX)
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
