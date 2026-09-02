import { useState } from 'react';
import { PieChart, ExternalLink, RefreshCw, BarChart3, Database, FileText, Compass } from 'lucide-react';

export function HubInteligenciaMarketingHub() {
  const [activeTab, setActiveTab] = useState<'censo' | 'lacunas' | 'portal' | 'metodologia'>('censo');
  const [activeDoc, setActiveDoc] = useState<string>('METODOLOGIA.md');
  const [iframeKey, setIframeKey] = useState(0);

  const docs = [
    { file: 'METODOLOGIA.md', title: 'Metodologia de Inteligência de Mercado' },
    { file: 'CENSO_COMPETITIVO_GR_CONTRIBUICAO_2026_08.md', title: 'Censo Competitivo GR (Contribuição 2026)' },
    { file: 'RANKING_OPORTUNIDADE_GR_2026_08.md', title: 'Ranking de Oportunidades GR' },
    { file: 'METODOLOGIA_UNIT_ECONOMICS_V1_2.md', title: 'Unit Economics V1.2' },
    { file: 'METODOLOGIA_HUB_SUITABILITY_V1.md', title: 'Metodologia Hub Suitability V1' },
    { file: 'DATA_LINEAGE.md', title: 'Lineage de Dados e Fontes' },
    { file: 'ARQUITETURA.md', title: 'Arquitetura do Hub de Inteligência' },
    { file: 'PLANO_EXPANSAO_ATLAS.md', title: 'Plano de Expansão Nacional Atlas' },
  ];

  const currentPath =
    activeTab === 'censo'
      ? '/tools/hub-inteligencia-marketing/dashboard_oportunidade_gr.html'
      : activeTab === 'lacunas'
      ? '/tools/hub-inteligencia-marketing/lacuna-gr-hub.html'
      : activeTab === 'portal'
      ? '/tools/hub-inteligencia-marketing/index.html'
      : '/tools/hub-inteligencia-marketing/index.html';

  return (
    <div className="flex flex-col h-full space-y-4 p-6 bg-base">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-brand/10 rounded-2xl border border-brand/20 text-brand">
            <PieChart className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-ink">Hub de Inteligência & Marketing</h1>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                Acervo Estratégico
              </span>
            </div>
            <p className="text-xs text-ink-2">
              Censo competitivo de GR, mapa de oportunidades territoriais, suitability e linhagem de dados.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIframeKey((k) => k + 1)}
            className="px-3 py-1.5 text-xs font-medium bg-soft text-ink hover:bg-soft-hover rounded-xl border border-line flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Recarregar
          </button>
          <a
            href={currentPath}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-xs font-medium bg-brand text-white hover:bg-brand-hover rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Abrir em Nova Aba
          </a>
        </div>
      </div>

      {/* Navigation Sub-tabs */}
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
          Metodologias & Documentação
        </button>
      </div>

      {/* Content View */}
      <div className="flex-1 min-h-[650px] bg-card rounded-2xl border border-line overflow-hidden shadow-sm flex flex-col">
        {activeTab === 'metodologia' ? (
          <div className="flex flex-col lg:flex-row h-full min-h-[650px]">
            {/* List of Docs */}
            <div className="w-full lg:w-80 bg-soft/30 border-r border-line p-4 overflow-y-auto max-h-[650px] space-y-2">
              <div className="text-xs font-bold text-ink-2 uppercase tracking-wider mb-2">
                Documentos de Metodologia
              </div>
              {docs.map((d) => (
                <button
                  key={d.file}
                  onClick={() => setActiveDoc(d.file)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    activeDoc === d.file
                      ? 'bg-brand/10 border-brand/40 text-brand font-bold shadow-sm'
                      : 'bg-card border-line hover:bg-soft text-ink'
                  }`}
                >
                  <div className="text-xs font-semibold">{d.title}</div>
                  <div className="text-[11px] text-ink-2 truncate pt-0.5">{d.file}</div>
                </button>
              ))}
            </div>

            <div className="flex-1 p-6 overflow-y-auto space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-brand" />
                  <h2 className="text-base font-bold text-ink">{docs.find((d) => d.file === activeDoc)?.title}</h2>
                </div>
                <a
                  href={`/tools/hub-inteligencia-marketing/${activeDoc}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-brand hover:underline flex items-center gap-1"
                >
                  Ver Arquivo Bruto <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <iframe
                key={`doc-${activeDoc}-${iframeKey}`}
                src={`/tools/hub-inteligencia-marketing/${activeDoc}`}
                className="w-full h-[580px] border-none rounded-xl bg-card"
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
