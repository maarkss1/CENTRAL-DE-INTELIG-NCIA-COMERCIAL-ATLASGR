import { useState } from 'react';
import { Layers, CheckCircle2, ExternalLink } from 'lucide-react';
import { useBrand } from '../../../contexts/BrandContext';
import { useBrandAccent } from '../../../hooks/useBrandAccent';

export function BitrixGuideHub() {
  const { activeBrand } = useBrand();
  const accent = useBrandAccent();
  const [activeTab, setActiveTab] = useState<'practices' | 'pipeline' | 'field_mapping' | 'tutorials'>('practices');
  const isAtlas = activeBrand === 'atlasgr';

  const practices = isAtlas ? [
    { title: 'Preenchimento Obrigatório do CNPJ e Inscrição Estadual', detail: 'Evite duplicidade na base do Bitrix24 exigindo que todo Lead criado contenha o CNPJ validado no Prospector Atlas.' },
    { title: 'Vincular Persona do Decisor na Negociação', detail: 'No campo de Contato do Bitrix24, selecione a tag da persona (ex: CFO, Gerente de GR, Diretor de Logística) para disparar cadências customizadas.' },
    { title: 'Mover Negociação com Score de Qualificação', detail: 'Somente passe negociações para o estágio "Proposta Apresentada" se o score BANT/MEDDPICC for superior a 70 pontos.' }
  ] : [
    { title: 'Preenchimento Obrigatório de Placa e Chip M2M', detail: 'Evite duplicidade na base do Bitrix24 exigindo que todo Lead criado contenha placa do veículo e operadora do chip validados.' },
    { title: 'Vincular Persona do Decisor na Negociação', detail: 'No campo de Contato do Bitrix24, selecione a tag da persona (ex: Diretor de Operações, Gerente de Frota) para disparar cadências customizadas.' },
    { title: 'Mover Negociação com Score de Qualificação', detail: 'Somente passe negociações para o estágio "Proposta Apresentada" se o score de fit de frota for superior a 70 pontos.' }
  ];

  const tutorials = isAtlas ? [
    { title: 'Como Integrar Lead do Prospector Atlas no Bitrix24 em 1 Clique', duration: '3 min', level: 'Iniciante' },
    { title: 'Configuração de Automação de E-mail via SMTP no Bitrix24', duration: '5 min', level: 'Intermediário' },
    { title: 'Sincronizando Apólices e Histórico de Gerenciamento de Risco no CRM', duration: '7 min', level: 'Avançado' }
  ] : [
    { title: 'Como Integrar Lead do TotalTrac Radar no Bitrix24 em 1 Clique', duration: '3 min', level: 'Iniciante' },
    { title: 'Configuração de Automação de E-mail via SMTP no Bitrix24', duration: '5 min', level: 'Intermediário' },
    { title: 'Sincronização de Frotas e Chips M2M da TotalTrac no CRM', duration: '7 min', level: 'Avançado' }
  ];

  return (
    <div className="bg-white/95 backdrop-blur-3xl p-8 rounded-[3rem] border border-white/90 shadow-2xl space-y-6 text-gray-900">
      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-2xl ${accent.bgSoft} ${accent.text} border ${accent.borderSoft}`}>
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight">{accent.brandName} + Bitrix24 Mastery & Boas Práticas CRM</h2>
            <p className="text-xs text-gray-500 font-medium">Guia oficial de uso, automação, mapeamento de campos e regras do Bitrix24</p>
          </div>
        </div>
        <span className={`px-3 py-1 ${accent.bgSofter} ${accent.text} text-xs font-black rounded-full border ${accent.borderSoft}`}>
          Bitrix24 Certified Standard
        </span>
      </div>

      {/* Tabs Internas */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
        <button
          onClick={() => setActiveTab('practices')}
          className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
            activeTab === 'practices' ? `${accent.solidBg} text-white shadow-md` : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Boas Práticas de Operação
        </button>
        <button
          onClick={() => setActiveTab('pipeline')}
          className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
            activeTab === 'pipeline' ? `${accent.solidBg} text-white shadow-md` : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Regras de Estágios de Funil
        </button>
        <button
          onClick={() => setActiveTab('field_mapping')}
          className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
            activeTab === 'field_mapping' ? `${accent.solidBg} text-white shadow-md` : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Mapeamento de Campos
        </button>
        <button
          onClick={() => setActiveTab('tutorials')}
          className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
            activeTab === 'tutorials' ? `${accent.solidBg} text-white shadow-md` : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Tutoriais em Vídeo & Guias
        </button>
      </div>

      {/* Conteúdo da Aba */}
      {activeTab === 'practices' && (
        <div className="space-y-4">
          {practices.map((p, idx) => (
            <div key={idx} className="p-5 rounded-2xl bg-gray-50 border border-gray-200 flex items-start gap-4">
              <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700 shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-extrabold text-xs text-gray-900">{p.title}</h4>
                <p className="text-xs text-gray-600 mt-1 font-medium leading-relaxed">{p.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'tutorials' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {tutorials.map((t, idx) => (
            <div key={idx} className="p-5 rounded-3xl bg-white border border-gray-200 shadow-sm space-y-3 flex flex-col justify-between">
              <div>
                <span className={`text-[10px] font-black ${accent.text} ${accent.bgSofter} px-2.5 py-1 rounded-full border ${accent.borderSoft}`}>
                  {t.level} • {t.duration}
                </span>
                <h4 className="font-extrabold text-xs text-gray-900 mt-3">{t.title}</h4>
              </div>
              <button className={`w-full ${accent.solidBg} text-white py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer`}>
                <span>Assistir Tutorial</span> <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
