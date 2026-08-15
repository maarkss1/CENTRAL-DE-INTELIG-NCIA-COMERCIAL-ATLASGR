import { useState } from 'react';
import { Layers, CheckCircle2, Clock, Workflow, ShieldCheck, Table2 } from 'lucide-react';
import { useBrand } from '../../../contexts/BrandContext';
import { useBrandAccent } from '../../../hooks/useBrandAccent';
import { LEAD_STATUS } from '../../../lib/zod';
import { BITRIX_FIELD_MAP } from '../../integrations/bitrix/bitrixFieldMap';
import { STAGE_AGING_CRITICAL_DAYS } from '../../commercial-intelligence/application/pipelineEligibility';

// Funil real usado pelo Kanban/CRM (mesma fonte de verdade de `src/lib/zod.ts` → `LEAD_STATUS`,
// consumida hoje pelo Kanban do CRM e pelo Comercial Inteligente) — não uma lista redigida à
// parte para esta tela. Divisão em "Funil Lead" x "Funil Negócio" segue o ponto de virada real do
// produto: `funnel: 'Negocio'` começa em "Nova Oportunidade" (ver `Lead.funnel` em
// `src/types/index.ts`).
const LEAD_FUNNEL_STAGES = LEAD_STATUS.slice(0, 6);
const DEAL_FUNNEL_STAGES = LEAD_STATUS.slice(6);

const FIELD_TARGET_LABEL: Record<string, string> = {
  lead: 'Lead (coluna)',
  qualification: 'Qualificação (SDR)',
  contact: 'Contato',
};

const FIELD_TYPE_LABEL: Record<string, string> = {
  string: 'Texto',
  enumeration: 'Lista (enum)',
  double: 'Número',
  date: 'Data',
  boolean_sim_nao: 'Sim/Não',
  url: 'Link',
};

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
    <div className="bg-surface/95 backdrop-blur-3xl p-8 rounded-[3rem] border border-line/90 shadow-2xl space-y-6 text-ink">
      <div className="flex items-center justify-between border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-2xl ${accent.bgSoft} ${accent.text} border ${accent.borderSoft}`}>
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight">{accent.brandName} + Bitrix24 Mastery & Boas Práticas CRM</h2>
            <p className="text-xs text-ink-2 font-medium">Guia oficial de uso, automação, mapeamento de campos e regras do Bitrix24</p>
          </div>
        </div>
        <span className={`px-3 py-1 ${accent.bgSofter} ${accent.text} text-xs font-black rounded-full border ${accent.borderSoft}`}>
          Bitrix24 Certified Standard
        </span>
      </div>

      {/* Tabs Internas */}
      <div className="flex flex-wrap gap-2 border-b border-line pb-2">
        <button
          onClick={() => setActiveTab('practices')}
          className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
            activeTab === 'practices' ? `${accent.solidBg} text-white shadow-md` : 'bg-surface-2 text-ink-2 hover:bg-surface-2'
          }`}
        >
          Boas Práticas de Operação
        </button>
        <button
          onClick={() => setActiveTab('pipeline')}
          className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
            activeTab === 'pipeline' ? `${accent.solidBg} text-white shadow-md` : 'bg-surface-2 text-ink-2 hover:bg-surface-2'
          }`}
        >
          Regras de Estágios de Funil
        </button>
        <button
          onClick={() => setActiveTab('field_mapping')}
          className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
            activeTab === 'field_mapping' ? `${accent.solidBg} text-white shadow-md` : 'bg-surface-2 text-ink-2 hover:bg-surface-2'
          }`}
        >
          Mapeamento de Campos
        </button>
        <button
          onClick={() => setActiveTab('tutorials')}
          className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
            activeTab === 'tutorials' ? `${accent.solidBg} text-white shadow-md` : 'bg-surface-2 text-ink-2 hover:bg-surface-2'
          }`}
        >
          Tutoriais em Vídeo & Guias
        </button>
      </div>

      {/* Conteúdo da Aba */}
      {activeTab === 'practices' && (
        <div className="space-y-4">
          {practices.map((p, idx) => (
            <div key={idx} className="p-5 rounded-2xl bg-surface-2 border border-line flex items-start gap-4">
              <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700 shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-extrabold text-xs text-ink">{p.title}</h4>
                <p className="text-xs text-ink-2 mt-1 font-medium leading-relaxed">{p.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'pipeline' && (
        <div className="space-y-5">
          <div>
            <h3 className="text-[11px] font-black text-ink-2 uppercase tracking-wide mb-2 flex items-center gap-2">
              <Workflow className="w-3.5 h-3.5" /> Funil Lead (Qualificação)
            </h3>
            <ol className="flex flex-wrap gap-2">
              {LEAD_FUNNEL_STAGES.map((stage, idx) => (
                <li key={stage} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-2 border border-line text-xs font-bold text-ink">
                  <span className={`${accent.text} font-black`}>{idx + 1}.</span> {stage}
                </li>
              ))}
            </ol>
          </div>

          <div>
            <h3 className="text-[11px] font-black text-ink-2 uppercase tracking-wide mb-2 flex items-center gap-2">
              <Workflow className="w-3.5 h-3.5" /> Funil Negócio (Fechamento)
            </h3>
            <ol className="flex flex-wrap gap-2">
              {DEAL_FUNNEL_STAGES.map((stage, idx) => (
                <li key={stage} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-2 border border-line text-xs font-bold text-ink">
                  <span className={`${accent.text} font-black`}>{idx + 1}.</span> {stage}
                </li>
              ))}
            </ol>
          </div>

          <div className="p-5 rounded-2xl bg-surface-2 border border-line flex items-start gap-4">
            <div className={`p-2.5 rounded-xl shrink-0 ${accent.bgSoft} ${accent.text} border ${accent.borderSoft}`}>
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-extrabold text-xs text-ink">Regra real de elegibilidade de pipeline (Comercial Inteligente)</h4>
              <p className="text-xs text-ink-2 mt-1 font-medium leading-relaxed">
                Um negócio só entra no forecast do Comercial Inteligente quando, no Bitrix24, ele tem:
                negócio aberto (não ganho/perdido), valor preenchido (maior que zero), data prevista de
                fechamento, responsável definido e próxima ação registrada — e quando o tempo na etapa
                atual não ultrapassa o limite de aging crítico ({STAGE_AGING_CRITICAL_DAYS} dias).
                Negócio fora desses critérios some do forecast até ser corrigido, mas continua visível
                no funil normalmente.
              </p>
              <p className="text-[10px] text-ink-2 mt-2 font-medium opacity-80">
                Hoje não existe SLA configurado por etapa individual (só este limite único de aging) —
                se isso for necessário, é uma configuração de produto ainda pendente, não algo já em
                vigor.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'field_mapping' && (
        <div className="space-y-3">
          <p className="text-xs text-ink-2 font-medium leading-relaxed">
            Mapeamento real usado pela sincronização automática com o Bitrix24 (mesmos códigos
            consumidos em produção pela importação/exportação de Leads e Negócios) — não é uma lista
            ilustrativa.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface-2 text-ink-2 text-left">
                  <th scope="col" className="px-3 py-2 font-black">Campo</th>
                  <th scope="col" className="px-3 py-2 font-black">Tipo</th>
                  <th scope="col" className="px-3 py-2 font-black">Onde mora</th>
                  <th scope="col" className="px-3 py-2 font-black">Código no Lead</th>
                  <th scope="col" className="px-3 py-2 font-black">Código no Negócio</th>
                </tr>
              </thead>
              <tbody>
                {BITRIX_FIELD_MAP.map((field) => (
                  <tr key={field.label} className="border-t border-line">
                    <td className="px-3 py-2 font-bold text-ink whitespace-nowrap">{field.label}</td>
                    <td className="px-3 py-2 text-ink-2">{FIELD_TYPE_LABEL[field.type] ?? field.type}</td>
                    <td className="px-3 py-2 text-ink-2 whitespace-nowrap">{FIELD_TARGET_LABEL[field.target.kind] ?? field.target.kind}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-ink-2">{field.leadCode ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-ink-2">{field.dealCode ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-ink-2 font-medium opacity-80">
            <Table2 className="w-3.5 h-3.5 shrink-0" />
            <span>Se um campo custom for reconfigurado no admin do Bitrix24, este mapa precisa ser atualizado manualmente pela equipe de Integrações — os códigos não são descobertos automaticamente por nome.</span>
          </div>
        </div>
      )}

      {activeTab === 'tutorials' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Estes vídeos ainda não existem — o roteiro (título, duração e nível estimados) está
              pronto, mas gravar/publicar cada um é trabalho pendente de outro time. Antes disto,
              o card tinha um botão "Assistir Tutorial" que não tocava nada (nenhum vídeo estava
              linkado). Preservamos o roteiro (conteúdo real, não decorativo — CLAUDE.md seção 6)
              e trocamos só o CTA por um estado honesto de "em produção", sem fingir um play que
              não funciona. */}
          {tutorials.map((t, idx) => (
            <div key={idx} className="p-5 rounded-3xl bg-surface border border-line shadow-sm space-y-3 flex flex-col justify-between">
              <div>
                <span className={`text-[10px] font-black ${accent.text} ${accent.bgSofter} px-2.5 py-1 rounded-full border ${accent.borderSoft}`}>
                  {t.level} • {t.duration}
                </span>
                <h4 className="font-extrabold text-xs text-ink mt-3">{t.title}</h4>
              </div>
              <div
                className="w-full bg-surface-2 text-ink-2 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 border border-line border-dashed"
                aria-label={`${t.title} — vídeo em produção, ainda não disponível`}
              >
                <Clock className="w-3.5 h-3.5" /> <span>Em produção — em breve</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
