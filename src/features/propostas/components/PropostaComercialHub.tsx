import { useState } from 'react';
import { FileSignature, ExternalLink, RefreshCw } from 'lucide-react';

export function PropostaComercialHub() {
  const [activeTab, setActiveTab] = useState<'selecao' | 'modelos' | 'cockpit-atlas' | 'cockpit-totaltrac'>('selecao');
  const [selectedProposal, setSelectedProposal] = useState<string>('Modelo_Proposta_Completa_FINAL_REVISADO.html');
  const [iframeKey, setIframeKey] = useState(0);

  const proposalsList = [
    { file: 'Modelo_Proposta_Completa_FINAL_REVISADO.html', name: 'Proposta Comercial Completa Atlas GR', desc: 'Solução integral de GR, Profile e Conectividade' },
    { file: 'Modelo_Proposta_GR_FINAL_REVISADO.html', name: 'Proposta Gerenciamento de Risco (GR)', desc: 'Serviços especializados em mitigação de riscos' },
    { file: 'Modelo_Proposta_Profile_Cadastro_Consulta_FINAL_REVISADO.html', name: 'Atlas Profile — Cadastro & Consulta', desc: 'Análise cadastral e histórico de profissionais' },
    { file: 'Modelo_Proposta_Profile_GR_Avulso_FINAL_REVISADO.html', name: 'Atlas Profile — GR Avulso', desc: 'Consultas sob demanda por viagem ou operação' },
    { file: 'Modelo_Proposta_Profile_RH_FINAL_REVISADO.html', name: 'Atlas Profile — Recursos Humanos', desc: 'Validação de equipe própria e contratados' },
    { file: 'Modelo_Proposta_Torre_Logistica_Connect_FINAL_REVISADO.html', name: 'Torre de Controle Logística & Connect', desc: 'Monitoramento em tempo real e integração' },
    { file: 'Proposta_Transpacheco_corrigida.html', name: 'Proposta Especial — Transpacheco', desc: 'Modelo dedicado com personalizações operacionais' },
  ];

  const currentPath =
    activeTab === 'selecao'
      ? '/tools/propostas/Selecionar_Proposta_Atlas.html'
      : activeTab === 'modelos'
      ? `/tools/propostas/${selectedProposal}`
      : activeTab === 'cockpit-atlas'
      ? '/tools/portal-comercial/cockpit.html'
      : '/tools/portal-comercial/totaltrac-cockpit.html';

  return (
    <div className="flex flex-col h-full space-y-4 p-6 bg-base">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-brand/10 rounded-2xl border border-brand/20 text-brand">
            <FileSignature className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-ink">Proposta Comercial & Cockpit AtlasGR / Total Trac</h1>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                Acervo Executivo
              </span>
            </div>
            <p className="text-xs text-ink-2">
              Modelos de propostas revisados, gerador de propostas customizadas e acompanhamento comercial.
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

      {/* Main Tabs */}
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

      {/* Main Area */}
      <div className="flex-1 min-h-[650px] bg-card rounded-2xl border border-line overflow-hidden shadow-sm flex flex-col">
        {activeTab === 'modelos' ? (
          <div className="flex flex-col lg:flex-row h-full min-h-[650px]">
            {/* List of proposal models */}
            <div className="w-full lg:w-80 bg-soft/30 border-r border-line p-4 overflow-y-auto max-h-[650px] space-y-2">
              <div className="text-xs font-bold text-ink-2 uppercase tracking-wider mb-2">
                Selecione o Modelo
              </div>
              {proposalsList.map((p) => (
                <button
                  key={p.file}
                  onClick={() => setSelectedProposal(p.file)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    selectedProposal === p.file
                      ? 'bg-brand/10 border-brand/40 text-brand font-bold shadow-sm'
                      : 'bg-card border-line hover:bg-soft text-ink'
                  }`}
                >
                  <div className="text-xs font-semibold">{p.name}</div>
                  <div className="text-[11px] text-ink-2 truncate pt-0.5">{p.desc}</div>
                </button>
              ))}
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
