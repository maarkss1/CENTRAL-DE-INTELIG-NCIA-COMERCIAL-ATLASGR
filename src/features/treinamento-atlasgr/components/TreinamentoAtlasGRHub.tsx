import { useState, useEffect } from 'react';
import {
  GraduationCap,
  ExternalLink,
  BookOpen,
  Award,
  CheckCircle,
  Search,
  Layers,
} from 'lucide-react';
import { ExecutiveHeader } from '../../../components/layout/ExecutiveHeader';

export function TreinamentoAtlasGRHub() {
  const [activeSubTab, setActiveSubTab] = useState<
    'portal' | 'trilha' | 'prova' | 'produtos' | 'ranking'
  >('portal');
  const [selectedModule, setSelectedModule] = useState<string>('01-bem-vindo-atlasgr.html');
  const [iframeKey, setIframeKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [completedModules, setCompletedModules] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('@prospector:treinamento_completed_modules');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(
        '@prospector:treinamento_completed_modules',
        JSON.stringify(completedModules),
      );
    } catch {
      // ignore
    }
  }, [completedModules]);

  const toggleModuleCompleted = (file: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCompletedModules((prev) =>
      prev.includes(file) ? prev.filter((f) => f !== file) : [...prev, file],
    );
  };

  const subTabs = [
    { id: 'portal', label: 'Portal Principal', path: '/tools/treinamento-atlasgr/index.html' },
    { id: 'trilha', label: 'Trilha Comercial (15 Módulos)' },
    { id: 'prova', label: 'Prova Final', path: '/tools/treinamento-atlasgr/prova-final.html' },
    {
      id: 'produtos',
      label: 'Produtos & Glossário',
      path: '/tools/treinamento-atlasgr/produtos.html',
    },
    {
      id: 'ranking',
      label: 'Ranking & Certificados',
      path: '/tools/treinamento-atlasgr/ranking.html',
    },
  ] as const;

  const trilhaModules = [
    {
      file: '01-bem-vindo-atlasgr.html',
      name: '01. Bem-vindo à AtlasGR',
      desc: 'Introdução e cultura da empresa',
    },
    {
      file: '02-mercado-logistica.html',
      name: '02. Mercado de Logística & Transportes',
      desc: 'Panorama geral e dores do setor',
    },
    {
      file: '03-gerenciamento-risco.html',
      name: '03. Gerenciamento de Risco (GR)',
      desc: 'Fundamentos e importância estratégica',
    },
    {
      file: '04-produtos-atlasgr.html',
      name: '04. Portfólio de Produtos AtlasGR',
      desc: 'Soluções e proposta de valor',
    },
    {
      file: '05-software-logistico.html',
      name: '05. Softwares & Tecnologias Logísticas',
      desc: 'Ecossistema de integração',
    },
    {
      file: '06-atlas-profile.html',
      name: '06. Atlas Profile & Cadastro',
      desc: 'Análise de perfil de motoristas e ajudantes',
    },
    {
      file: '07-integracoes.html',
      name: '07. Integrações & Bitrix24',
      desc: 'Conectividade e automação comercial',
    },
    {
      file: '08-clientes.html',
      name: '08. Perfil de Cliente Ideal (ICP)',
      desc: 'Identificação e abordagem direcionada',
    },
    {
      file: '09-processo-comercial.html',
      name: '09. Processo Comercial Ponta a Ponta',
      desc: 'Qualificação, apresentação e fechamento',
    },
    {
      file: '10-termos-tecnicos.html',
      name: '10. Dicionário de Termos Técnicos',
      desc: 'Vocabulário essencial de GR',
    },
    {
      file: '11-operacao.html',
      name: '11. Operação & Suporte Comercial',
      desc: 'Bastidores da entrega de serviços',
    },
    {
      file: '12-compliance.html',
      name: '12. Compliance, LGPD & Regulatório',
      desc: 'Normas de proteção de dados',
    },
    {
      file: '13-tecnologia.html',
      name: '13. Arquitetura e Tecnologia Atlas',
      desc: 'Infraestrutura da plataforma',
    },
    {
      file: '14-casos-reais.html',
      name: '14. Casos Reais & Sucesso de Clientes',
      desc: 'Estudos de caso e depoimentos',
    },
    {
      file: '15-preparacao-final.html',
      name: '15. Preparação Final & Checkup',
      desc: 'Revisão geral para a prova final',
    },
  ];

  const filteredModules = trilhaModules.filter(
    (m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.desc.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const currentTab = subTabs.find((t) => t.id === activeSubTab);
  const currentPath =
    activeSubTab === 'trilha'
      ? `/tools/treinamento-atlasgr/trilha/${selectedModule}`
      : currentTab && 'path' in currentTab
        ? currentTab.path
        : '/tools/treinamento-atlasgr/index.html';

  const progressPercentage = Math.round((completedModules.length / trilhaModules.length) * 100);

  return (
    <div
      className={`flex flex-col h-full space-y-4 bg-bg ${isFullscreen ? 'fixed inset-0 z-50 p-4 bg-bg overflow-hidden' : 'p-6'}`}
    >
      {/* Unified Executive Header */}
      <ExecutiveHeader
        title="Treinamento AtlasGR"
        subtitle="Programa completo de formação comercial: 15 módulos didáticos, provas, produtos e certidões."
        icon={GraduationCap}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
        onRefresh={() => setIframeKey((k) => k + 1)}
      />

      {/* KPI Cards & Progress Bar */}
      {!isFullscreen && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3.5 bg-surface border border-line rounded-2xl flex items-center gap-3">
            <div className="p-2.5 bg-brand/10 text-brand rounded-xl">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-ink-2">Trilha Comercial</div>
              <div className="text-sm font-bold text-ink">15 Módulos</div>
            </div>
          </div>
          <div className="p-3.5 bg-surface border border-line rounded-2xl flex items-center gap-3">
            <div className="p-2.5 bg-success/10 text-success-active dark:text-success rounded-xl">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-ink-2">Progresso Concluído</div>
              <div className="text-sm font-bold text-success-active dark:text-success">
                {completedModules.length} de 15 ({progressPercentage}%)
              </div>
            </div>
          </div>
          <div className="p-3.5 bg-surface border border-line rounded-2xl flex items-center gap-3">
            <div className="p-2.5 bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 rounded-xl">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-ink-2">Certificação</div>
              <div className="text-sm font-bold text-ink">Prova Final</div>
            </div>
          </div>
          <div className="p-3.5 bg-surface border border-line rounded-2xl flex items-center gap-3">
            <div className="p-2.5 bg-info/10 text-info-active dark:text-info rounded-xl">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-ink-2">Ranking & Equipe</div>
              <div className="text-sm font-bold text-ink">Placar de Líderes</div>
            </div>
          </div>
        </div>
      )}

      {/* Sub-tab Selector */}
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
        {activeSubTab === 'trilha' ? (
          <div className="flex flex-col lg:flex-row h-full min-h-[650px]">
            {/* Sidebar list of 15 modules with search & progress checkboxes */}
            <div className="w-full lg:w-80 bg-soft/30 border-r border-line p-4 overflow-y-auto max-h-[650px] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-ink-2 uppercase tracking-wider">
                  Módulos ({filteredModules.length})
                </span>
                <span className="text-xs font-semibold text-brand">
                  {completedModules.length}/15 Concluídos
                </span>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-ink-2 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filtrar módulos..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface border border-line rounded-lg text-ink focus:outline-none focus:border-brand"
                />
              </div>

              <div className="space-y-1.5 pt-1">
                {filteredModules.map((m) => {
                  const isDone = completedModules.includes(m.file);
                  const isSelected = selectedModule === m.file;
                  return (
                    <div
                      key={m.file}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedModule(m.file)}
                      onKeyDown={(e) => e.key === 'Enter' && setSelectedModule(m.file)}
                      className={`w-full text-left p-3 rounded-xl border cursor-pointer transition-all flex items-start justify-between gap-2 ${
                        isSelected
                          ? 'bg-brand/10 border-brand/40 text-brand font-bold shadow-sm'
                          : 'bg-surface border-line hover:bg-soft text-ink'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold">{m.name}</div>
                        <div className="text-[11px] text-ink-2 truncate">{m.desc}</div>
                      </div>
                      <button
                        onClick={(e) => toggleModuleCompleted(m.file, e)}
                        className={`p-1 rounded-md transition-colors ${
                          isDone
                            ? 'text-emerald-500 hover:bg-emerald-500/10'
                            : 'text-ink-2 hover:bg-soft'
                        }`}
                        title={isDone ? 'Marcar como não concluído' : 'Marcar como concluído'}
                      >
                        <CheckCircle className={`w-4 h-4 ${isDone ? 'fill-emerald-500/20' : ''}`} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Content Viewer */}
            <div className="flex-1 h-full min-h-[650px]">
              <iframe
                key={`trilha-${selectedModule}-${iframeKey}`}
                src={`/tools/treinamento-atlasgr/trilha/${selectedModule}`}
                className="w-full h-full min-h-[650px] border-none"
                title={`Trilha - ${selectedModule}`}
              />
            </div>
          </div>
        ) : (
          <iframe
            key={`${activeSubTab}-${iframeKey}`}
            src={currentPath}
            className="w-full h-full min-h-[650px] border-none"
            title="Treinamento AtlasGR Portal"
          />
        )}
      </div>
    </div>
  );
}
