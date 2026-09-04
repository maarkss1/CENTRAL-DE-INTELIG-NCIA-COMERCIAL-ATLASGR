import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Building2,
  MapPin,
  Users,
  FileText,
  Activity,
  Star,
  Sparkles,
  Loader2,
  Wrench,
  Tag,
  Globe,
  Phone,
  ShieldCheck,
  AlertTriangle,
  Clock,
  DollarSign,
} from 'lucide-react';
import { LinkedinIcon as Linkedin } from '../../../components/ui/icons/LinkedinIcon';
import type { Company } from '../../../types';
import { api } from '../../../lib/api';
import { formatCnpj } from '../../../lib/cnpj';
import { TechToolLogo, type TechToolInfo } from '../../../components/ui/TechToolLogo';
import { ToolTechPopover } from '../../../components/ui/ToolTechPopover';
import { ContextualTip } from '../../../components/ui/ContextualTip';
import { clientLogger } from '../../../lib/clientLogger';
import { useActiveRecord } from '../../../contexts/ActiveRecordContext';
import { toast } from '../../../lib/toast';

interface CompanyDetailProps {
  companyId: string;
  onBack: () => void;
}

function formatEstimatedRevenue(amount: number): string {
  return amount.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

export function CompanyDetail({ companyId, onBack }: CompanyDetailProps) {
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [activeToolPopover, setActiveToolPopover] = useState<TechToolInfo | null>(null);

  const fetchCompany = useCallback(async () => {
    try {
      const data = await api.get<Company>(`/api/companies/${companyId}`);
      setCompany(data);
    } catch (error) {
      clientLogger.error({ err: error }, 'Error fetching company details');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchCompany();
  }, [fetchCompany]);

  // Torna o copiloto de IA global ciente de qual empresa está aberta na tela.
  const { setActiveRecord, clearActiveRecord } = useActiveRecord();
  useEffect(() => {
    if (!company) return;
    setActiveRecord({
      type: 'company',
      id: company.id,
      label: company.tradeName || company.legalName,
      summary: [company.segment, company.city].filter(Boolean).join(' — ') || undefined,
    });
    return () => clearActiveRecord(company.id);
  }, [company, setActiveRecord, clearActiveRecord]);

  const handleEnrich = async () => {
    setEnriching(true);
    try {
      // Mesma cadeia de chamadas externas do enriquecimento de lead (CNPJ, domínio/e-mail,
      // Google Places, icebreaker por IA) — precisa de mais que os 15s padrão do api client.
      await api.post(`/api/companies/${companyId}/enrich`, undefined, { timeoutMs: 60_000 });
      await fetchCompany();
      toast.success('Empresa enriquecida com sucesso.');
    } catch (error) {
      clientLogger.error({ err: error }, 'Error enriching company');
      toast.error(error instanceof Error ? error.message : 'Falha ao enriquecer a empresa.');
    } finally {
      setEnriching(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-brand dark:border-brand-2 border-t-transparent rounded-full animate-spin" />
          <p className="text-ink-2 font-medium text-sm">Carregando inteligência da empresa...</p>
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-bg p-8 gap-4 min-h-screen">
        <p className="text-ink-2 text-lg">🔍 Empresa não encontrada.</p>
        <button
          onClick={onBack}
          className="px-5 py-2.5 bg-surface-2 border border-line rounded-2xl hover:bg-surface transition-all text-ink font-bold flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para Empresas
        </button>
      </div>
    );
  }

  const technologiesList = company.technologies ?? [];
  const hasDetectedTechnologies = technologiesList.length > 0;

  return (
    <div className="flex-1 overflow-y-auto bg-bg text-ink p-6 md:p-8 space-y-6">
      {/* Popover de Tecnologia */}
      <ToolTechPopover info={activeToolPopover} onClose={() => setActiveToolPopover(null)} />

      <div className="max-w-6xl mx-auto space-y-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-ink-2 hover:text-ink transition-colors group cursor-pointer"
        >
          <div className="p-2 rounded-xl bg-surface-2 border border-line group-hover:bg-surface transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </div>
          <span className="font-bold text-sm">Voltar para carteira de empresas</span>
        </button>

        {/* Banner de Dica para Qualificação da Empresa */}
        <ContextualTip
          id="tip-company-detail"
          title="Inteligência de Vendas Atlas"
          description={`Empresa analisada: ${company.tradeName || company.legalName}. Utilize o mapa de tecnologias e contatos qualificados para criar abordagens altamente alinhadas às dores operacionais.`}
        />

        {/* Header Card da Empresa */}
        <div className="bg-surface p-6 md:p-8 rounded-3xl border border-line shadow-xl backdrop-blur-xl flex flex-col md:flex-row items-start gap-6 relative overflow-hidden">
          <div className="w-24 h-24 rounded-3xl bg-soft border border-brand/30 flex items-center justify-center text-brand shrink-0 overflow-hidden shadow-inner">
            {company.logoUrl ? (
              <img src={company.logoUrl} alt="" className="w-full h-full object-contain p-2" />
            ) : (
              <Building2 className="w-12 h-12" />
            )}
          </div>

          <div className="flex-1 space-y-3 w-full">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h1 className="text-3xl font-extrabold text-ink tracking-tight">
                  {company.tradeName || company.legalName}
                </h1>
                <p className="text-ink-2 text-sm mt-0.5 font-medium">{company.legalName}</p>
              </div>

              <div className="flex items-center gap-3">
                {/* Âmbar é a cor categórica de "ação de enriquecimento por IA" já estabelecida e
                    auditada em CompanyList.tsx (individual + em massa) — reaproveitada aqui em vez
                    do gradiente amber/orange/yellow-300 sem contraste verificado que existia antes. */}
                <button
                  onClick={handleEnrich}
                  disabled={enriching}
                  className="flex items-center gap-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-700 dark:text-amber-400 px-5 py-2.5 rounded-2xl font-black text-sm transition-all disabled:opacity-60 cursor-pointer"
                >
                  {enriching ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {enriching ? 'Enriquecendo Lead...' : '✨ Enriquecer com IA'}
                </button>
                <span
                  className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold border ${
                    company.status === 'Ativo'
                      ? 'bg-success/10 text-emerald-700 dark:text-success border-success/20'
                      : 'bg-surface-2 text-ink/70 dark:text-ink-2 border-line'
                  }`}
                >
                  {company.status === 'Ativo' ? '✅' : '⛔'} {company.status}
                </span>
              </div>
            </div>

            {/* Metadados rápidos */}
            <div className="flex flex-wrap gap-4 pt-2 text-xs text-ink-2">
              {company.cnpj && (
                <div className="flex items-center gap-1.5 bg-surface-2 px-3 py-1.5 rounded-xl border border-line">
                  <FileText className="w-3.5 h-3.5 text-ink/70 dark:text-ink-2" />
                  <span>{formatCnpj(company.cnpj)}</span>
                </div>
              )}
              {(company.city || company.state) && (
                <div className="flex items-center gap-1.5 bg-surface-2 px-3 py-1.5 rounded-xl border border-line">
                  <MapPin className="w-3.5 h-3.5 text-ink/70 dark:text-ink-2" />
                  <span>
                    {company.city}
                    {company.state ? `, ${company.state}` : ''}
                  </span>
                </div>
              )}
              {company.segment && (
                <div className="flex items-center gap-1.5 bg-surface-2 px-3 py-1.5 rounded-xl border border-line">
                  <Activity className="w-3.5 h-3.5 text-ink/70 dark:text-ink-2" />
                  <span>{company.segment}</span>
                </div>
              )}
              {company.website && (
                <a
                  href={company.website}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 bg-info/10 hover:bg-info/20 text-info-active dark:text-info px-3 py-1.5 rounded-xl border border-info/20 transition-colors font-medium"
                >
                  <Globe className="w-3.5 h-3.5" /> Site oficial
                </a>
              )}
              {company.linkedin && (
                <a
                  href={company.linkedin}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 bg-info/10 hover:bg-info/20 text-info-active dark:text-info px-3 py-1.5 rounded-xl border border-info/20 transition-colors font-medium"
                >
                  <Linkedin className="w-3.5 h-3.5" /> LinkedIn
                </a>
              )}
            </div>
          </div>
        </div>

        {/* SEÇÃO PRINCIPAL: LOGOS DAS FERRAMENTAS DA EMPRESA */}
        <div className="bg-surface p-6 md:p-8 rounded-3xl border border-line shadow-xl space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-brand/10 border border-brand/20 text-brand-active dark:text-brand-2">
                <Wrench className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-ink tracking-tight">
                  Logos das Ferramentas & Tecnologias da Empresa
                </h2>
                <p className="text-xs text-ink-2">
                  Ecossistema de softwares e firmographics detectados no prospect
                </p>
              </div>
            </div>
            <span
              className={`text-xs px-3 py-1 rounded-full border font-mono ${
                hasDetectedTechnologies
                  ? 'bg-surface-2 text-ink/70 dark:text-ink-2 border-line'
                  : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
              }`}
            >
              {hasDetectedTechnologies
                ? `${technologiesList.length} Ferramentas`
                : 'Sem detecção real'}
            </span>
          </div>

          <div className="bg-surface-2 p-6 rounded-2xl border border-line flex flex-wrap gap-3 items-center">
            {hasDetectedTechnologies ? (
              technologiesList.map((tech, i) => (
                <TechToolLogo
                  key={i}
                  techName={tech}
                  showCategory={true}
                  size="lg"
                  onClick={(info) => setActiveToolPopover(info)}
                />
              ))
            ) : (
              <div className="w-full rounded-2xl border border-warning/30 bg-warning/10 p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-warning-active dark:text-warning shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-black text-warning-active dark:text-warning">
                    Tecnologias ainda não detectadas para esta empresa.
                  </p>
                  <p className="text-xs leading-relaxed text-ink-2">
                    Este painel só exibe ferramentas confirmadas pelo cadastro ou por
                    enriquecimento. Nenhum logo demonstrativo foi usado para evitar confundir
                    exemplo visual com dado real.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Grid 2 colunas: Contatos e Firmographics detalhado */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            {/* Lista de Contatos */}
            <div className="bg-surface p-6 rounded-3xl border border-line shadow-xl space-y-4">
              <h2 className="text-lg font-bold text-ink flex items-center gap-2">
                <Users className="w-5 h-5 text-ink/70 dark:text-ink-2" />👥 Decisores & Contatos
                Mapeados ({company.contacts?.length || 0})
              </h2>
              {company.contacts && company.contacts.length > 0 ? (
                <div className="space-y-3">
                  {company.contacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="p-4 bg-surface-2 border border-line rounded-2xl hover:border-brand/40 transition-colors flex justify-between items-center"
                    >
                      <div>
                        <p className="font-bold text-ink">{contact.name}</p>
                        <p className="text-xs text-ink-2">
                          {contact.role || 'Cargo não especificado'} ·{' '}
                          {contact.email || contact.phone || 'Sem contato'}
                        </p>
                      </div>
                      {contact.phone && (
                        <a
                          href={`tel:${contact.phone}`}
                          className="p-2 bg-info/10 hover:bg-info/20 text-info-active dark:text-info rounded-xl transition-colors"
                          title="Ligar"
                          aria-label={`Ligar para ${contact.name}`}
                        >
                          <Phone className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-ink/70 dark:text-ink-2 italic text-sm p-4 bg-surface-2 rounded-2xl border border-line">
                  Nenhum contato diretamente vinculado. Execute o Enriquecimento com IA para
                  importar decisores via Apollo.
                </p>
              )}
            </div>

            {/* Palavras-chave da empresa */}
            {company.keywords && company.keywords.length > 0 && (
              <div className="bg-surface p-6 rounded-3xl border border-line shadow-xl space-y-3">
                <h2 className="text-sm font-bold text-ink-2 uppercase tracking-wider flex items-center gap-2">
                  <Tag className="w-4 h-4 text-ink-2" />
                  Palavras-Chave de Atuação
                </h2>
                <div className="flex flex-wrap gap-2">
                  {company.keywords.map((k, i) => (
                    <span
                      key={i}
                      className="bg-surface-2 border border-line text-ink-2 px-3 py-1 rounded-xl text-xs font-medium"
                    >
                      #{k}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar lateral com Google Rating e Detalhes */}
          <div className="space-y-6">
            {(company.googleRating != null || company.businessHours) && (
              <div className="bg-surface p-6 rounded-3xl border border-line shadow-xl space-y-3">
                <h2 className="text-xs font-bold text-ink-2 uppercase tracking-wider flex items-center gap-1.5">
                  <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                  Google Meu Negócio
                </h2>
                <div className="space-y-3">
                  {company.googleRating != null && (
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-black text-ink">
                        {company.googleRating.toFixed(1)}
                      </span>
                      <div className="flex text-amber-400">
                        {'★'.repeat(Math.round(company.googleRating))}
                      </div>
                      <span className="text-xs text-ink-2">
                        ({company.googleReviewsCount ?? 0} avaliações)
                      </span>
                    </div>
                  )}
                  {/* businessHours.openNow/weekdayDescriptions já vinham na resposta da API mas
                      nunca eram renderizados — só a existência do objeto era checada para decidir
                      se este card aparecia (achado do Piloto 014). */}
                  {company.businessHours?.openNow != null && (
                    <div
                      className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg w-fit ${
                        company.businessHours.openNow
                          ? 'bg-success/10 text-emerald-700 dark:text-success'
                          : 'bg-surface-2 text-ink/70 dark:text-ink-2'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      {company.businessHours.openNow ? 'Aberto agora' : 'Fechado agora'}
                    </div>
                  )}
                  {company.businessHours?.weekdayDescriptions &&
                    company.businessHours.weekdayDescriptions.length > 0 && (
                      <ul className="text-[11px] text-ink-2 space-y-0.5 pt-1 border-t border-line">
                        {company.businessHours.weekdayDescriptions.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    )}
                </div>
              </div>
            )}

            <div className="bg-surface p-6 rounded-3xl border border-line shadow-xl space-y-3">
              <h2 className="text-xs font-bold text-ink-2 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-ink/70 dark:text-ink-2" />
                Dados Cadastrais
              </h2>
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-ink-2">CNAE:</span>
                  <p className="font-bold text-ink mt-0.5">{company.cnae || 'Não informado'}</p>
                </div>
                <div>
                  <span className="text-ink-2">Porte da Empresa:</span>
                  <p className="font-bold text-ink mt-0.5">{company.size || 'Não informado'}</p>
                </div>
                {/* employeeCount/estimatedRevenue já existiam no schema e na resposta da API,
                    mas nenhuma tela do módulo Companies os mostrava — só apareciam indiretamente
                    via a empresa vinculada a um Lead (LeadDetailDrawer), nunca no perfil da
                    própria empresa (achado do Piloto 014). */}
                {company.employeeCount != null && (
                  <div>
                    <span className="text-ink-2 flex items-center gap-1">
                      <Users className="w-3 h-3" /> Funcionários (estimado):
                    </span>
                    <p className="font-bold text-ink mt-0.5">{company.employeeCount}</p>
                  </div>
                )}
                {company.estimatedRevenue != null && (
                  <div>
                    <span className="text-ink-2 flex items-center gap-1">
                      <DollarSign className="w-3 h-3" /> Faturamento estimado:
                    </span>
                    <p className="font-bold text-ink mt-0.5">
                      {formatEstimatedRevenue(company.estimatedRevenue)}
                    </p>
                  </div>
                )}
                {company.address && (
                  <div>
                    <span className="text-ink-2">Endereço:</span>
                    <p className="font-bold text-ink mt-0.5">{company.address}</p>
                  </div>
                )}
              </div>
            </div>

            {company.observations && (
              <div className="bg-warning/10 p-6 rounded-3xl border border-warning/20 space-y-2">
                <h3 className="text-xs font-bold text-warning-active dark:text-warning uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" />
                  Observações da IA Atlas
                </h3>
                <p className="text-xs text-ink-2 leading-relaxed whitespace-pre-wrap">
                  {company.observations}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
