import { useState } from 'react';
import { FileSignature, ExternalLink, Search, Sparkles, Layers, Gauge } from 'lucide-react';
import { ExecutiveHeader } from '../../../components/layout/ExecutiveHeader';

export function PropostaComercialHub() {
  const [activeTab, setActiveTab] = useState<
    'selecao' | 'modelos' | 'cockpit-atlas' | 'cockpit-totaltrac'
  >('selecao');
  const [selectedProposal, setSelectedProposal] = useState<string>(
    'Modelo_Proposta_Completa_FINAL_REVISADO.html',
  );
  const [iframeKey, setIframeKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const proposalsList = [
    {
      file: 'Modelo_Proposta_Completa_FINAL_REVISADO.html',
      name: 'Proposta Comercial Completa Atlas GR',
      desc: 'Solução integral de GR, Profile e Conectividade',
      tag: 'Completa',
    },
    {
      file: 'Modelo_Proposta_GR_FINAL_REVISADO.html',
      name: 'Proposta Gerenciamento de Risco (GR)',
      desc: 'Serviços especializados em mitigação de riscos',
      tag: 'GR',
    },
    {
      file: 'Modelo_Proposta_Profile_Cadastro_Consulta_FINAL_REVISADO.html',
      name: 'Atlas Profile — Cadastro & Consulta',
      desc: 'Análise cadastral e histórico de profissionais',
      tag: 'Profile',
    },
    {
      file: 'Modelo_Proposta_Profile_GR_Avulso_FINAL_REVISADO.html',
      name: 'Atlas Profile — GR Avulso',
      desc: 'Consultas sob demanda por viagem ou operação',
      tag: 'Profile Avulso',
    },
    {
      file: 'Modelo_Proposta_Profile_RH_FINAL_REVISADO.html',
      name: 'Atlas Profile — Recursos Humanos',
      desc: 'Validação de equipe própria e contratados',
      tag: 'RH',
    },
    {
      file: 'Modelo_Proposta_Torre_Logistica_Connect_FINAL_REVISADO.html',
      name: 'Torre de Controle Logística & Connect',
      desc: 'Monitoramento em tempo real e integração',
      tag: 'Torre',
    },
    {
      file: 'Proposta_Transpacheco_corrigida.html',
      name: 'Proposta Especial — Transpacheco',
      desc: 'Modelo dedicado com personalizações operacionais',
      tag: 'Custom',
    },
  ];

  const filteredProposals = proposalsList.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.tag.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const currentPath =
    activeTab === 'selecao'
      ? '/tools/propostas/Selecionar_Proposta_Atlas.html'
      : activeTab === 'modelos'
        ? `/tools/propostas/${selectedProposal}`
        : activeTab === 'cockpit-atlas'
          ? '/tools/portal-comercial/cockpit.html'
          : '/tools/portal-comercial/totaltrac-cockpit.html';

  return (
    <div
      className={`flex flex-col h-full space-y-4 bg-bg ${isFullscreen ? 'fixed inset-0 z-50 p-4 bg-bg overflow-hidden' : 'p-6'}`}
    >
      {/* Unified Executive Header */}
      <ExecutiveHeader
        title="Proposta Comercial & Cockpit AtlasGR / Total Trac"
        subtitle="Modelos de propostas revisados, gerador de propostas customizadas e acompanhamento comercial."
        icon={FileSignature}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
        onRefresh={() => setIframeKey((k) => k + 1)}
      />

      {/* KPI Cards Bar */}
      {!isFullscreen && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3.5 bg-surface border border-line rounded-2xl flex items-center gap-3">
            <div className="p-2.5 bg-brand/10 text-brand rounded-xl">
              <FileSignature className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-ink-2">Central de Propostas</div>
              <div className="text-sm font-bold text-ink">7 Modelos</div>
            </div>
          </div>
          <div className="p-3.5 bg-surface border border-line rounded-2xl flex items-center gap-3">
            <div className="p-2.5 bg-success/10 text-success-active dark:text-success rounded-xl">
              <Gauge className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-ink-2">Cockpit Atlas GR</div>
              <div className="text-sm font-bold text-ink">SDR & Forecast</div>
            </div>
          </div>
          <div className="p-3.5 bg-surface border border-line rounded-2xl flex items-center gap-3">
            <div className="p-2.5 bg-info/10 text-info-active dark:text-info rounded-xl">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-ink-2">Cockpit Total Trac</div>
              <div className="text-sm font-bold text-ink">Evolução & Extração</div>
            </div>
          </div>
          <div className="p-3.5 bg-surface border border-line rounded-2xl flex items-center gap-3">
            <div className="p-2.5 bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 rounded-xl">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-ink-2">Seleção Rápida</div>
              <div className="text-sm font-bold text-ink">Personalizador</div>
            </div>
          </div>
        </div>
      )}

      {/* Main Tabs Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setActiveTab('selecao')}
            className={`px-4 py-2 text-xs font-semibold rounded-xl border whitespace-nowrap transition-all ${
              activeTab === 'selecao'
                ? 'bg-brand/10 border-brand/40 text-brand shadow-sm'
                : 'bg-soft/50 border-line text-ink-2 hover:bg-soft hover:text-ink'
            }`}
          >
            Central de Seleção de Propostas
          </button>
          <button
            onClick={() => setActiveTab('modelos')}
            className={`px-4 py-2 text-xs font-semibold rounded-xl border whitespace-nowrap transition-all ${
              activeTab === 'modelos'
                ? 'bg-brand/10 border-brand/40 text-brand shadow-sm'
                : 'bg-soft/50 border-line text-ink-2 hover:bg-soft hover:text-ink'
            }`}
          >
            Modelos de Propostas (7)
          </button>
          <button
            onClick={() => setActiveTab('cockpit-atlas')}
            className={`px-4 py-2 text-xs font-semibold rounded-xl border whitespace-nowrap transition-all ${
              activeTab === 'cockpit-atlas'
                ? 'bg-brand/10 border-brand/40 text-brand shadow-sm'
                : 'bg-soft/50 border-line text-ink-2 hover:bg-soft hover:text-ink'
            }`}
          >
            Cockpit Comercial Atlas GR
          </button>
          <button
            onClick={() => setActiveTab('cockpit-totaltrac')}
            className={`px-4 py-2 text-xs font-semibold rounded-xl border whitespace-nowrap transition-all ${
              activeTab === 'cockpit-totaltrac'
                ? 'bg-brand/10 border-brand/40 text-brand shadow-sm'
                : 'bg-soft/50 border-line text-ink-2 hover:bg-soft hover:text-ink'
            }`}
          >
            Cockpit Comercial Total Trac
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

      {/* Main Container */}
      <div
        className={`flex-1 bg-surface rounded-2xl border border-line overflow-hidden shadow-sm flex flex-col ${isFullscreen ? 'h-[calc(100vh-140px)]' : 'min-h-[650px]'}`}
      >
        {activeTab === 'modelos' ? (
          <div className="flex flex-col lg:flex-row h-full min-h-[650px]">
            {/* Sidebar list of proposal models with search */}
            <div className="w-full lg:w-80 bg-soft/30 border-r border-line p-4 overflow-y-auto max-h-[650px] space-y-3">
              <div className="text-xs font-bold text-ink-2 uppercase tracking-wider">
                Modelos ({filteredProposals.length})
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-ink-2 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filtrar por nome ou tag..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface border border-line rounded-lg text-ink focus:outline-none focus:border-brand"
                />
              </div>

              <div className="space-y-1.5 pt-1">
                {filteredProposals.map((p) => (
                  <button
                    key={p.file}
                    onClick={() => setSelectedProposal(p.file)}
                    className={`w-full text-left p-3 rounded-xl border transition-all space-y-1 ${
                      selectedProposal === p.file
                        ? 'bg-brand/10 border-brand/40 text-brand font-bold shadow-sm'
                        : 'bg-surface border-line hover:bg-soft text-ink'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-brand/10 text-brand">
                        {p.tag}
                      </span>
                    </div>
                    <div className="text-xs font-semibold">{p.name}</div>
                    <div className="text-[11px] text-ink-2 truncate">{p.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 h-full min-h-[650px]">
              <iframe
                key={`modelo-${selectedProposal}-${iframeKey}`}
                src={`/tools/propostas/${selectedProposal}`}
                className="w-full h-full min-h-[650px] border-none"
                title={`Proposta - ${selectedProposal}`}
              />
            </div>
          </div>
        ) : (
          <iframe
            key={`${activeTab}-${iframeKey}`}
            src={currentPath}
            className="w-full h-full min-h-[650px] border-none"
            title="Proposta Comercial e Cockpit"
          />
        )}
      </div>
    </div>
  );
}
