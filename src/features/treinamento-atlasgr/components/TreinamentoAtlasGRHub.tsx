import { useState } from 'react';
import { GraduationCap, ExternalLink, RefreshCw } from 'lucide-react';

export function TreinamentoAtlasGRHub() {
  const [activeSubTab, setActiveSubTab] = useState<'portal' | 'trilha' | 'prova' | 'produtos' | 'ranking'>('portal');
  const [selectedModule, setSelectedModule] = useState<string>('01-bem-vindo-atlasgr.html');
  const [iframeKey, setIframeKey] = useState(0);

  const subTabs = [
    { id: 'portal', label: 'Portal Principal', path: '/tools/treinamento-atlasgr/index.html' },
    { id: 'trilha', label: 'Trilha Comercial (15 Módulos)' },
    { id: 'prova', label: 'Prova Final', path: '/tools/treinamento-atlasgr/prova-final.html' },
    { id: 'produtos', label: 'Produtos & Glossário', path: '/tools/treinamento-atlasgr/produtos.html' },
    { id: 'ranking', label: 'Ranking & Certificados', path: '/tools/treinamento-atlasgr/ranking.html' },
  ] as const;

  const trilhaModules = [
    { file: '01-bem-vindo-atlasgr.html', name: '01. Bem-vindo à AtlasGR', desc: 'Introdução e cultura da empresa' },
    { file: '02-mercado-logistica.html', name: '02. Mercado de Logística & Transportes', desc: 'Panorama geral e dores do setor' },
    { file: '03-gerenciamento-risco.html', name: '03. Gerenciamento de Risco (GR)', desc: 'Fundamentos e importância estratégica' },
    { file: '04-produtos-atlasgr.html', name: '04. Portfólio de Produtos AtlasGR', desc: 'Soluções e proposta de valor' },
    { file: '05-software-logistico.html', name: '05. Softwares & Tecnologias Logísticas', desc: 'Ecossistema de integração' },
    { file: '06-atlas-profile.html', name: '06. Atlas Profile & Cadastro', desc: 'Análise de perfil de motoristas e ajudantes' },
    { file: '07-integracoes.html', name: '07. Integrações & Bitrix24', desc: 'Conectividade e automação comercial' },
    { file: '08-clientes.html', name: '08. Perfil de Cliente Ideal (ICP)', desc: 'Identificação e abordagem direcionada' },
    { file: '09-processo-comercial.html', name: '09. Processo Comercial Ponta a Ponta', desc: 'Qualificação, apresentação e fechamento' },
    { file: '10-termos-tecnicos.html', name: '10. Dicionário de Termos Técnicos', desc: 'Vocabulário essencial de GR' },
    { file: '11-operacao.html', name: '11. Operação & Suporte Comercial', desc: 'Bastidores da entrega de serviços' },
    { file: '12-compliance.html', name: '12. Compliance, LGPD & Regulatório', desc: 'Normas de proteção de dados' },
    { file: '13-tecnologia.html', name: '13. Arquitetura e Tecnologia Atlas', desc: 'Infraestrutura da plataforma' },
    { file: '14-casos-reais.html', name: '14. Casos Reais & Sucesso de Clientes', desc: 'Estudos de caso e depoimentos' },
    { file: '15-preparacao-final.html', name: '15. Preparação Final & Checkup', desc: 'Revisão geral para a prova final' },
  ];

  const currentTab = subTabs.find((t) => t.id === activeSubTab);
  const currentPath =
    activeSubTab === 'trilha'
      ? `/tools/treinamento-atlasgr/trilha/${selectedModule}`
      : currentTab && 'path' in currentTab
      ? currentTab.path
      : '/tools/treinamento-atlasgr/index.html';

  return (
    <div className="flex flex-col h-full space-y-4 p-6 bg-base">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-brand/10 rounded-2xl border border-brand/20 text-brand">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-ink">Treinamento AtlasGR</h1>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                Capacitação Oficial
              </span>
            </div>
            <p className="text-xs text-ink-2">
              Programa completo de formação comercial: 15 módulos didáticos, provas, produtos e certidões.
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

      {/* Sub-tab Selector */}
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

      {/* Main Content Area */}
      <div className="flex-1 min-h-[650px] bg-card rounded-2xl border border-line overflow-hidden shadow-sm flex flex-col">
        {activeSubTab === 'trilha' ? (
          <div className="flex flex-col lg:flex-row h-full min-h-[650px]">
            {/* Sidebar list of 15 modules */}
            <div className="w-full lg:w-80 bg-soft/30 border-r border-line p-4 overflow-y-auto max-h-[650px] space-y-2">
              <div className="text-xs font-bold text-ink-2 uppercase tracking-wider mb-2">
                Módulos da Trilha (15)
              </div>
              {trilhaModules.map((m) => (
                <button
                  key={m.file}
                  onClick={() => setSelectedModule(m.file)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    selectedModule === m.file
                      ? 'bg-brand/10 border-brand/40 text-brand font-bold shadow-sm'
                      : 'bg-card border-line hover:bg-soft text-ink'
                  }`}
                >
                  <div className="text-xs font-semibold">{m.name}</div>
                  <div className="text-[11px] text-ink-2 truncate pt-0.5">{m.desc}</div>
                </button>
              ))}
            </div>

            {/* Content Viewer for selected module */}
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
