import React from 'react';
import { Users, Crown, Briefcase, UserCheck, Phone, Mail } from 'lucide-react';
import { LinkedinIcon as Linkedin } from '../../../components/ui/icons/LinkedinIcon';

export interface DecisionMakerItem {
  id?: string;
  name: string;
  role?: string | null;
  seniority?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  linkedin?: string | null;
  source?: string | null;
  emailStatus?: string | null;
}

interface VisualOrgChartProps {
  contacts: DecisionMakerItem[];
  companyName?: string;
  onSelectContact?: (contact: DecisionMakerItem) => void;
}

type HierarchyLevel = 'clevel' | 'directors' | 'managers' | 'operational';

interface LevelConfig {
  id: HierarchyLevel;
  title: string;
  icon: any;
  colorBadge: string;
  borderAccent: string;
  bgAccent: string;
}

const HIERARCHY_LEVELS: LevelConfig[] = [
  {
    id: 'clevel',
    title: 'C-Level, Sócios & Presidência',
    icon: Crown,
    colorBadge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    borderAccent: 'border-amber-500/30',
    bgAccent: 'bg-amber-50/40 dark:bg-amber-950/10',
  },
  {
    id: 'directors',
    title: 'Diretoria & VPs',
    icon: Briefcase,
    colorBadge: 'bg-brand/10 text-brand-active dark:text-brand-2 border-brand/20',
    borderAccent: 'border-brand/30',
    bgAccent: 'bg-brand/5',
  },
  {
    id: 'managers',
    title: 'Gerência & Coordenação (Frota/Logística)',
    icon: UserCheck,
    colorBadge: 'bg-info/10 text-info-active dark:text-info border-info/20',
    borderAccent: 'border-info/30',
    bgAccent: 'bg-info/5',
  },
  {
    id: 'operational',
    title: 'Supervisão, PGR & Operação',
    icon: Users,
    colorBadge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    borderAccent: 'border-emerald-500/30',
    bgAccent: 'bg-emerald-50/40 dark:bg-emerald-950/10',
  },
];

function classifyLevel(roleStr?: string | null, seniority?: string | null): HierarchyLevel {
  const r = (roleStr || '').toLowerCase();
  const s = (seniority || '').toLowerCase();

  if (
    s.includes('c_suite') ||
    s.includes('owner') ||
    s.includes('founder') ||
    s.includes('partner') ||
    r.includes('ceo') ||
    r.includes('sócio') ||
    r.includes('socio') ||
    r.includes('presidente') ||
    r.includes('cfo') ||
    r.includes('coo') ||
    r.includes('diretor presidente') ||
    r.includes('diretor executivo') ||
    r.includes('administrador')
  ) {
    return 'clevel';
  }

  if (
    s.includes('vp') ||
    s.includes('director') ||
    r.includes('diretor') ||
    r.includes('diretora') ||
    r.includes('vice-presidente') ||
    r.includes('head')
  ) {
    return 'directors';
  }

  if (
    s.includes('manager') ||
    r.includes('gerente') ||
    r.includes('coordenador') ||
    r.includes('coordenadora') ||
    r.includes('gestor') ||
    r.includes('gestora')
  ) {
    return 'managers';
  }

  return 'operational';
}

export function VisualOrgChart({ contacts, companyName, onSelectContact }: VisualOrgChartProps) {
  const grouped = React.useMemo(() => {
    const map: Record<HierarchyLevel, DecisionMakerItem[]> = {
      clevel: [],
      directors: [],
      managers: [],
      operational: [],
    };

    for (const c of contacts) {
      const level = classifyLevel(c.role, c.seniority);
      map[level].push(c);
    }

    return map;
  }, [contacts]);

  const totalContacts = contacts.length;

  if (totalContacts === 0) {
    return (
      <div className="p-8 rounded-3xl border border-line bg-surface/50 text-center space-y-3">
        <Users className="mx-auto w-10 h-10 text-ink-2" />
        <h4 className="text-sm font-bold text-ink">Nenhum decisor mapeado ainda</h4>
        <p className="text-xs text-ink-2 max-w-md mx-auto">
          Use o enriquecimento em cascata (Apollo/Hunter) para descobrir os tomadores de decisão e
          cargos executivos desta conta.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-black text-ink flex items-center gap-2">
            <Users className="w-5 h-5 text-brand" /> Organograma Hierárquico
          </h3>
          <p className="text-xs text-ink-2">
            {totalContacts} tomador{totalContacts !== 1 ? 'es' : ''} de decisão mapeado
            {totalContacts !== 1 ? 's' : ''} em {companyName || 'esta conta'}
          </p>
        </div>
      </div>

      <div className="space-y-6 relative before:absolute before:left-5 before:top-6 before:bottom-6 before:w-0.5 before:bg-line/70">
        {HIERARCHY_LEVELS.map((lvl) => {
          const items = grouped[lvl.id];
          if (items.length === 0) return null;

          const Icon = lvl.icon;

          return (
            <div key={lvl.id} className="relative pl-12 space-y-3">
              <div className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full border ${lvl.colorBadge} flex items-center justify-center -ml-12 bg-surface shadow-xs`}
                >
                  <Icon size={16} />
                </div>
                <span className="text-xs font-black uppercase tracking-wider text-ink">
                  {lvl.title} ({items.length})
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {items.map((contact, idx) => {
                  const phone = contact.whatsapp || contact.phone;

                  return (
                    <div
                      key={contact.id || `${contact.name}-${idx}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectContact?.(contact)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectContact?.(contact);
                        }
                      }}
                      className={`p-4 rounded-2xl border ${lvl.borderAccent} ${lvl.bgAccent} hover:shadow-md transition-all space-y-2.5 cursor-pointer`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-bold text-ink hover:text-brand transition-colors">
                            {contact.name}
                          </h4>
                          <p className="text-[11px] font-semibold text-ink-2">
                            {contact.role || 'Cargo não especificado'}
                          </p>
                        </div>
                        {contact.source && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-surface/80 border border-line font-bold text-ink-2">
                            {contact.source}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-line/50 text-xs">
                        {contact.email && (
                          <a
                            href={`mailto:${contact.email}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-2 hover:text-brand hover:underline"
                          >
                            <Mail size={12} className="text-brand shrink-0" />
                            <span className="truncate max-w-[140px]">{contact.email}</span>
                          </a>
                        )}

                        {phone && (
                          <a
                            href={`https://wa.me/55${phone.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 hover:underline"
                          >
                            <Phone size={12} className="shrink-0" />
                            <span>{phone}</span>
                          </a>
                        )}

                        {contact.linkedin && (
                          <a
                            href={
                              contact.linkedin.startsWith('http')
                                ? contact.linkedin
                                : `https://${contact.linkedin}`
                            }
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:underline"
                          >
                            <Linkedin size={12} className="shrink-0" />
                            <span>LinkedIn</span>
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
