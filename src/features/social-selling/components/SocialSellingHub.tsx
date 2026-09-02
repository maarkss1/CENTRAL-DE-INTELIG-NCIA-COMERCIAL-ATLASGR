import { useState } from 'react';
import { Share2, ExternalLink, RefreshCw, FileText, Download, Layers } from 'lucide-react';

export function SocialSellingHub() {
  const [activeSubTab, setActiveSubTab] = useState<'motor' | 'pipeline' | 'linkedin' | 'posts' | 'materiais'>('motor');
  const [iframeKey, setIframeKey] = useState(0);

  const subTabs = [
    { id: 'motor', label: 'Motor de Social Selling', path: '/tools/social-selling/Motor de Social Selling Atlas GR.html' },
    { id: 'pipeline', label: 'Pipeline Tracker', path: '/tools/social-selling/Atlas GR Pipeline.html' },
    { id: 'linkedin', label: 'LinkedIn Campaign Kit', path: '/tools/social-selling/AtlasGR Kit Campanha LinkedIn Completo.html' },
    { id: 'posts', label: 'Posts Semanais (1-5)' },
    { id: 'materiais', label: 'Manual & Apresentação' },
  ] as const;

  const currentTab = subTabs.find((t) => t.id === activeSubTab);

  return (
    <div className="flex flex-col h-full space-y-4 p-6 bg-base">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-brand/10 rounded-2xl border border-brand/20 text-brand">
            <Share2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-ink">Social Selling Atlas GR</h1>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                Acesso Exclusivo
              </span>
            </div>
            <p className="text-xs text-ink-2">
              Plano de ação, rastreador de pipeline, kit de campanhas LinkedIn e acervo de conteúdos.
            </p>
          </div>
        </div>

        {currentTab && 'path' in currentTab && currentTab.path && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIframeKey((k) => k + 1)}
              className="px-3 py-1.5 text-xs font-medium bg-soft text-ink hover:bg-soft-hover rounded-xl border border-line flex items-center gap-1.5 transition-colors"
              title="Recarregar tela"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Recarregar
            </button>
            <a
              href={currentTab.path}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-xs font-medium bg-brand text-white hover:bg-brand-hover rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Abrir em Nova Aba
            </a>
          </div>
        )}
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

      {/* Main View Area */}
      <div className="flex-1 min-h-[650px] bg-card rounded-2xl border border-line overflow-hidden shadow-sm flex flex-col">
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
            <div>
              <h2 className="text-base font-bold text-ink">Acervo de Posts para LinkedIn (Semanas 1 a 5)</h2>
              <p className="text-xs text-ink-2">Textos estratégicos e copys para engajamento outbound/inbound em gerenciamento de risco logístico.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { semana: 'Semana 1', tema: 'Operação reativa vs. governável', desc: 'Conceito chave sobre maturidade em GR' },
                { semana: 'Semana 2', tema: 'Tecnologia útil vs. cosmética', desc: 'Como identificar soluções reais no mercado' },
                { semana: 'Semana 3', tema: 'Segurança como performance', desc: 'Redução de perdas gerando margem de lucro' },
                { semana: 'Semana 4', tema: 'Risco antes do sinistro', desc: 'Prevenção proativa e auditoria de perfil' },
                { semana: 'Semana 5', tema: 'Improviso vs. processo escalável', desc: 'Estruturação de processos comerciais em GR' },
              ].map((item, idx) => (
                <div key={idx} className="p-4 bg-soft/40 rounded-xl border border-line flex flex-col justify-between space-y-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-brand/10 text-brand">
                        {item.semana}
                      </span>
                      <Layers className="w-4 h-4 text-ink-2" />
                    </div>
                    <h3 className="text-sm font-bold text-ink pt-1">{item.tema}</h3>
                    <p className="text-xs text-ink-2">{item.desc}</p>
                  </div>
                  <a
                    href={`/tools/social-selling/index.html`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-brand hover:underline pt-2"
                  >
                    Ver Conteúdo Completo <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSubTab === 'materiais' && (
          <div className="p-6 space-y-6 overflow-y-auto">
            <div>
              <h2 className="text-base font-bold text-ink">Materiais e Ativos Institucionais</h2>
              <p className="text-xs text-ink-2">Documentos oficiais de apresentação e guia de marca para o Social Selling.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-5 bg-soft/40 rounded-2xl border border-line space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-red-500/10 text-red-500 rounded-xl">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-ink">Manual de Identidade Visual Atlas</h3>
                    <p className="text-xs text-ink-2">Guia completo de aplicação da marca (PDF)</p>
                  </div>
                </div>
                <a
                  href="/tools/social-selling/Manual de Identidade Visual – Atlas_compressed (1).pdf"
                  target="_blank"
                  download
                  className="w-full py-2 px-4 bg-brand text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 hover:bg-brand-hover transition-colors"
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
                    <h3 className="text-sm font-bold text-ink">Apresentação Social Selling Atlas</h3>
                    <p className="text-xs text-ink-2">Deck comercial oficial de Social Selling (PPTX)</p>
                  </div>
                </div>
                <a
                  href="/tools/social-selling/Social Selling Atlas.pptx"
                  target="_blank"
                  download
                  className="w-full py-2 px-4 bg-brand text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 hover:bg-brand-hover transition-colors"
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
