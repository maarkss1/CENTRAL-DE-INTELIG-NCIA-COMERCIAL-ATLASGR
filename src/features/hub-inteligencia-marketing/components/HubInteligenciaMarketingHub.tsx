import { useState } from 'react';
import { PieChart, ExternalLink, FileText, Search, Compass, Database } from 'lucide-react';
import { ExecutiveHeader } from '../../../components/layout/ExecutiveHeader';

export function HubInteligenciaMarketingHub() {
  const [activeTab, setActiveTab] = useState<'censo' | 'lacunas' | 'portal' | 'metodologia'>(
    'censo',
  );
  const [activeDoc, setActiveDoc] = useState<string>('METODOLOGIA.md');
  const [iframeKey, setIframeKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const docs = [
    {
      file: 'METODOLOGIA.md',
      title: 'Metodologia de Inteligência de Mercado',
      desc: 'Estrutura completa de cálculo e fontes',
    },
    {
      file: 'CENSO_COMPETITIVO_GR_CONTRIBUICAO_2026_08.md',
      title: 'Censo Competitivo GR (2026)',
      desc: 'Mapeamento nacional de players de GR',
    },
    {
      file: 'RANKING_OPORTUNIDADE_GR_2026_08.md',
      title: 'Ranking de Oportunidades GR',
      desc: 'Classificação de praças e territórios',
    },
    {
      file: 'METODOLOGIA_UNIT_ECONOMICS_V1_2.md',
      title: 'Unit Economics V1.2',
      desc: 'Viabilidade econômica por município',
    },
    {
      file: 'METODOLOGIA_HUB_SUITABILITY_V1.md',
      title: 'Metodologia Hub Suitability V1',
      desc: 'Aderência e score de sinergia de polos',
    },
    {
      file: 'DATA_LINEAGE.md',
      title: 'Lineage de Dados e Fontes',
      desc: 'Rastreabilidade de CNPJ, MDF-e e RNTRC',
    },
    {
      file: 'ARQUITETURA.md',
      title: 'Arquitetura do Hub de Inteligência',
      desc: 'Pipelines ETL e modelos analíticos',
    },
    {
      file: 'PLANO_EXPANSAO_ATLAS.md',
      title: 'Plano de Expansão Nacional Atlas',
      desc: 'Estratégia comercial e penetração regional',
    },
  ];

  const filteredDocs = docs.filter(
    (d) =>
      d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.file.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const currentPath =
    activeTab === 'censo'
      ? '/tools/hub-inteligencia-marketing/dashboard_oportunidade_gr.html'
      : activeTab === 'lacunas'
        ? '/tools/hub-inteligencia-marketing/lacuna-gr-hub.html'
        : activeTab === 'portal'
          ? '/tools/hub-inteligencia-marketing/index.html'
          : '/tools/hub-inteligencia-marketing/index.html';

  return (
    <div
      className={`flex flex-col h-full space-y-4 bg-bg ${isFullscreen ? 'fixed inset-0 z-50 p-4 bg-bg overflow-hidden' : 'p-6'}`}
    >
      {/* Unified Executive Header */}
      <ExecutiveHeader
        title="Hub de Inteligência & Marketing"
        subtitle="Censo competitivo de GR, mapa de oportunidades territoriais, suitability e linhagem de dados."
        icon={PieChart}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
        onRefresh={() => setIframeKey((k) => k + 1)}
      />

      {/* KPI Summary Bar */}
      {!isFullscreen && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3.5 bg-surface border border-line rounded-2xl flex items-center gap-3">
            <div className="p-2.5 bg-brand/10 text-brand rounded-xl">
              <PieChart className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-ink-2">Censo Competitivo</div>
              <div className="text-sm font-bold text-ink">Nacional 2026</div>
            </div>
          </div>
          <div className="p-3.5 bg-surface border border-line rounded-2xl flex items-center gap-3">
            <div className="p-2.5 bg-success/10 text-success-active dark:text-success rounded-xl">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-ink-2">Mapa de Lacunas</div>
              <div className="text-sm font-bold text-ink">Polos Logísticos</div>
            </div>
          </div>
          <div className="p-3.5 bg-surface border border-line rounded-2xl flex items-center gap-3">
            <div className="p-2.5 bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 rounded-xl">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-ink-2">Data Lineage</div>
              <div className="text-sm font-bold text-ink">MDF-e + RNTRC</div>
            </div>
          </div>
          <div className="p-3.5 bg-surface border border-line rounded-2xl flex items-center gap-3">
            <div className="p-2.5 bg-info/10 text-info-active dark:text-info rounded-xl">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-ink-2">Metodologias</div>
              <div className="text-sm font-bold text-ink">8 Documentos</div>
            </div>
          </div>
        </div>
      )}

      {/* Sub-tab Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setActiveTab('censo')}
            className={`px-4 py-2 text-xs font-semibold rounded-xl border whitespace-nowrap transition-all ${
              activeTab === 'censo'
                ? 'bg-brand/10 border-brand/40 text-brand shadow-sm'
                : 'bg-soft/50 border-line text-ink-2 hover:bg-soft hover:text-ink'
            }`}
          >
            Censo Competitivo & Oportunidades GR
          </button>
          <button
            onClick={() => setActiveTab('lacunas')}
            className={`px-4 py-2 text-xs font-semibold rounded-xl border whitespace-nowrap transition-all ${
              activeTab === 'lacunas'
                ? 'bg-brand/10 border-brand/40 text-brand shadow-sm'
                : 'bg-soft/50 border-line text-ink-2 hover:bg-soft hover:text-ink'
            }`}
          >
            Mapa de Lacunas GR Hub
          </button>
          <button
            onClick={() => setActiveTab('portal')}
            className={`px-4 py-2 text-xs font-semibold rounded-xl border whitespace-nowrap transition-all ${
              activeTab === 'portal'
                ? 'bg-brand/10 border-brand/40 text-brand shadow-sm'
                : 'bg-soft/50 border-line text-ink-2 hover:bg-soft hover:text-ink'
            }`}
          >
            Market Intelligence Dashboard
          </button>
          <button
            onClick={() => setActiveTab('metodologia')}
            className={`px-4 py-2 text-xs font-semibold rounded-xl border whitespace-nowrap transition-all ${
              activeTab === 'metodologia'
                ? 'bg-brand/10 border-brand/40 text-brand shadow-sm'
                : 'bg-soft/50 border-line text-ink-2 hover:bg-soft hover:text-ink'
            }`}
          >
            Metodologias & Documentação (8)
          </button>
        </div>

        <a
          href={currentPath}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-brand hover:underline flex items-center gap-1.5 self-end sm:self-auto"
        >
          Abrir em Nova Aba <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Main Content Area */}
      <div
        className={`flex-1 bg-surface rounded-2xl border border-line overflow-hidden shadow-sm flex flex-col ${isFullscreen ? 'h-[calc(100vh-140px)]' : 'min-h-[650px]'}`}
      >
        {activeTab === 'metodologia' ? (
          <div className="flex flex-col lg:flex-row h-full min-h-[650px]">
            {/* Sidebar list of docs */}
            <div className="w-full lg:w-80 bg-soft/30 border-r border-line p-4 overflow-y-auto max-h-[650px] space-y-3">
              <div className="text-xs font-bold text-ink-2 uppercase tracking-wider">
                Documentos ({filteredDocs.length})
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-ink-2 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filtrar por título..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface border border-line rounded-lg text-ink focus:outline-none focus:border-brand"
                />
              </div>

              <div className="space-y-1.5 pt-1">
                {filteredDocs.map((d) => (
                  <button
                    key={d.file}
                    onClick={() => setActiveDoc(d.file)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      activeDoc === d.file
                        ? 'bg-brand/10 border-brand/40 text-brand font-bold shadow-sm'
                        : 'bg-surface border-line hover:bg-soft text-ink'
                    }`}
                  >
                    <div className="text-xs font-semibold">{d.title}</div>
                    <div className="text-[11px] text-ink-2 truncate pt-0.5">{d.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 p-6 overflow-y-auto space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-brand" />
                  <h2 className="text-base font-bold text-ink">
                    {docs.find((d) => d.file === activeDoc)?.title}
                  </h2>
                </div>
                <a
                  href={`/tools/hub-inteligencia-marketing/${activeDoc}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-brand hover:underline flex items-center gap-1"
                >
                  Abrir Arquivo <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <iframe
                key={`doc-${activeDoc}-${iframeKey}`}
                src={`/tools/hub-inteligencia-marketing/${activeDoc}`}
                className="w-full h-[580px] border-none rounded-xl bg-surface"
                title={`Doc - ${activeDoc}`}
              />
            </div>
          </div>
        ) : (
          <iframe
            key={`${activeTab}-${iframeKey}`}
            src={currentPath}
            className="w-full h-full min-h-[650px] border-none"
            title="Hub de Inteligência & Marketing"
          />
        )}
      </div>
    </div>
  );
}
