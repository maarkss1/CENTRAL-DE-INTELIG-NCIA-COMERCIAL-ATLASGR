import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  Building2,
  Users,
  Activity,
  FileBarChart,
  Bot,
  Loader2,
} from 'lucide-react';
import type { TabType } from '../layout/tabMeta';
import { TAB_META } from '../layout/tabMeta';
import { api } from '../../lib/api';
import type { Company, Contact, PaginatedResponse } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import {
  OPEN_COMMAND_PALETTE_EVENT,
  OPEN_AI_CHAT_EVENT,
  type PaletteIntent,
} from '../../lib/paletteIntent';

type ResultItem = {
  id: string;
  group: 'Ações rápidas' | 'Navegar' | 'Empresas' | 'Decisores';
  label: string;
  sublabel?: string;
  icon: typeof Search;
  onSelect: () => void;
};

const DIACRITICS_PATTERN = new RegExp(
  `[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`,
  'g',
);

// Mesmo seletor/estratégia de trap de foco já usada em Drawer.tsx (não compartilhado entre os
// dois arquivos — cada primitivo de overlay já mantinha sua própria cópia antes desta correção).
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function normalize(value: string): string {
  return value.normalize('NFD').replace(DIACRITICS_PATTERN, '').toLowerCase();
}

const EXECUTIVE_TABS: TabType[] = [
  'social-selling',
  'treinamento-atlasgr',
  'proposta-comercial',
  'hub-inteligencia-marketing',
];

const MODULE_ORDER: TabType[] = [
  'dashboard',
  'prospect',
  'crm',
  'companies',
  'contacts',
  'activities',
  'cadence',
  'calendar',
  'intelligence',
  'chatbook',
  'roleplay',
  'qualification_matrix',
  'objections_matrix',
  'topic_training',
  'bitrix',
  'reports',
  'integrations',
  'knowledge',
  'analytics',
  'winloss',
  'sdr-diagnostic-joao',
  'commercial_intelligence',
  'copiloto_ia',
  'social-selling',
  'treinamento-atlasgr',
  'proposta-comercial',
  'hub-inteligencia-marketing',
  'notifications',
  'automations',
  'usage',
  'editor',
  'team',
  'settings',
];

export function CommandPalette() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [entityLoading, setEntityLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setCompanies([]);
    setContacts([]);
    setActiveIndex(0);
  }, []);

  // Atalho global ⌘K/Ctrl+K + evento disparado pela busca do topbar.
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    const handleOpenEvent = () => setIsOpen(true);
    window.addEventListener('keydown', handleKeydown);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, handleOpenEvent);
    return () => {
      window.removeEventListener('keydown', handleKeydown);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, handleOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      previouslyFocused.current = document.activeElement as HTMLElement | null;
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      document.body.style.overflow = '';
      previouslyFocused.current?.focus();
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Trap de foco (bug real de acessibilidade corrigido, Onda 3/Agente 03): o painel já tinha
  // role="dialog"/aria-modal="true", mas nada impedia Tab de sair dele para o conteúdo por trás
  // do backdrop — quem navega só por teclado conseguia "perder" o foco atrás de uma camada
  // visualmente inacessível. Mesma estratégia (Tab/Shift+Tab cíclico dentro do painel) já usada
  // em Drawer.tsx.
  useEffect(() => {
    if (!isOpen) return;

    const handleTabTrap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleTabTrap);
    return () => document.removeEventListener('keydown', handleTabTrap);
  }, [isOpen]);

  // Busca real de empresas/decisores (debounced) — usa o mesmo endpoint que Empresas/Contatos.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setCompanies([]);
      setContacts([]);
      setEntityLoading(false);
      return;
    }
    setEntityLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const [companyRes, contactRes] = await Promise.all([
          api.get<PaginatedResponse<Company>>(
            `/api/companies?q=${encodeURIComponent(trimmed)}&limit=5`,
          ),
          api.get<PaginatedResponse<Contact>>(
            `/api/contacts?q=${encodeURIComponent(trimmed)}&limit=5`,
          ),
        ]);
        setCompanies(companyRes.data ?? []);
        setContacts(contactRes.data ?? []);
      } catch {
        setCompanies([]);
        setContacts([]);
      } finally {
        setEntityLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const navigateAndClose = useCallback(
    (tab: TabType, intent?: PaletteIntent) => {
      navigate(`/app/${tab}`, intent ? { state: intent } : undefined);
      close();
    },
    [navigate, close],
  );

  const items = useMemo<ResultItem[]>(() => {
    const q = normalize(query.trim());
    const result: ResultItem[] = [];

    const quickActions: ResultItem[] = [
      {
        id: 'qa-activity',
        group: 'Ações rápidas',
        label: 'Criar nova atividade',
        icon: Activity,
        onSelect: () => navigateAndClose('activities', { type: 'open-create' }),
      },
      {
        id: 'qa-prospect',
        group: 'Ações rápidas',
        label: 'Iniciar prospecção',
        icon: Search,
        onSelect: () => navigateAndClose('prospect'),
      },
      {
        id: 'qa-report',
        group: 'Ações rápidas',
        label: 'Abrir Relatórios de IA',
        icon: FileBarChart,
        onSelect: () => navigateAndClose('reports'),
      },
      {
        id: 'qa-ai',
        group: 'Ações rápidas',
        label: 'Chamar copiloto de IA',
        icon: Bot,
        onSelect: () => {
          window.dispatchEvent(new Event(OPEN_AI_CHAT_EVENT));
          close();
        },
      },
      {
        id: 'qa-company',
        group: 'Ações rápidas',
        label: 'Nova empresa',
        icon: Building2,
        onSelect: () => navigateAndClose('companies', { type: 'open-create' }),
      },
      {
        id: 'qa-contact',
        group: 'Ações rápidas',
        label: 'Novo contato',
        icon: Users,
        onSelect: () => navigateAndClose('contacts', { type: 'open-create' }),
      },
      {
        id: 'qa-opportunity',
        group: 'Ações rápidas',
        label: 'Nova oportunidade',
        icon: Activity,
        onSelect: () => navigateAndClose('crm', { type: 'open-create' }),
      },
    ];
    result.push(...quickActions.filter((a) => !q || normalize(a.label).includes(q)));

    const isMarcelo =
      !!currentUser &&
      currentUser.email.toLowerCase().trim() === 'marcelo.nascimento@atlasgr.com.br';
    const visibleModuleOrder = isMarcelo
      ? MODULE_ORDER
      : MODULE_ORDER.filter((t) => !EXECUTIVE_TABS.includes(t));

    const moduleItems: ResultItem[] = visibleModuleOrder
      .filter((tab) => !q || normalize(TAB_META[tab].label).includes(q))
      .map((tab) => ({
        id: `mod-${tab}`,
        group: 'Navegar',
        label: TAB_META[tab].label,
        icon: TAB_META[tab].icon,
        onSelect: () => navigateAndClose(tab),
      }));
    result.push(...(q ? moduleItems : moduleItems.slice(0, 8)));

    if (q.length >= 2) {
      result.push(
        ...companies.map((c) => ({
          id: `company-${c.id}`,
          group: 'Empresas' as const,
          label: c.tradeName || c.legalName,
          sublabel: c.city ? `${c.city}${c.state ? `/${c.state}` : ''}` : undefined,
          icon: Building2,
          onSelect: () =>
            navigateAndClose('companies', {
              type: 'prefill-search',
              value: c.tradeName || c.legalName,
            }),
        })),
      );
      result.push(
        ...contacts.map((c) => ({
          id: `contact-${c.id}`,
          group: 'Decisores' as const,
          label: c.name,
          sublabel: c.role || c.company?.tradeName,
          icon: Users,
          onSelect: () => navigateAndClose('contacts', { type: 'prefill-search', value: c.name }),
        })),
      );
    }

    return result;
  }, [query, companies, contacts, navigateAndClose, close]);

  useEffect(() => {
    setActiveIndex(0);
  }, [items.length, query]);

  const handleInputKeydown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      items[activeIndex]?.onSelect();
    }
  };

  if (!isOpen) return null;

  let groupCursor = '';

  return (
    // role="dialog" é um papel de "janela", não de controle interativo — o jsx-a11y sinaliza
    // qualquer onClick/onKeyDown aqui como se fosse indevido num elemento não-interativo, mas o
    // uso real é o padrão "clicar fora fecha" (só dispara quando e.target === e.currentTarget,
    // nunca em clique nos itens internos) + Escape já tratado abaixo — equivalente de teclado já
    // existe, não falta suporte.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className="fixed inset-0 z-[1000] flex items-start justify-center bg-black/50 sm:px-4 sm:pt-[12vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') close();
      }}
    >
      <div
        ref={panelRef}
        className="w-full h-full sm:h-auto sm:max-w-xl overflow-hidden sm:rounded-2xl border-0 sm:border border-line bg-surface shadow-2xl flex flex-col"
      >
        <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
          <Search className="h-5 w-5 shrink-0 text-ink-2" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeydown}
            placeholder="Buscar empresa, decisor ou comando…"
            className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-2"
          />
          {entityLoading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ink-2" />}
          <kbd className="hidden shrink-0 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-ink-2 sm:block">
            ESC
          </kbd>
        </div>

        <div className="flex-1 sm:max-h-[60vh] overflow-y-auto p-2">
          {items.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-ink-2">
              Nenhum resultado para &quot;{query}&quot;.
            </p>
          )}
          {items.map((item, idx) => {
            const showHeader = item.group !== groupCursor;
            groupCursor = item.group;
            const Icon = item.icon;
            return (
              <div key={item.id}>
                {showHeader && (
                  <p className="px-3 pb-1 pt-3 text-[10px] font-black uppercase tracking-widest text-ink-2 first:pt-1">
                    {item.group}
                  </p>
                )}
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={item.onSelect}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${idx === activeIndex ? 'bg-brand/15 text-ink' : 'text-ink-2 hover:bg-surface-2'}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate font-medium">{item.label}</span>
                  {item.sublabel && (
                    <span className="shrink-0 truncate text-xs text-ink-2">{item.sublabel}</span>
                  )}
                  {idx === activeIndex && <CornerDownLeft className="h-3.5 w-3.5 shrink-0" />}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-2">
          <span className="flex items-center gap-1">
            <ArrowUp className="h-3 w-3" />
            <ArrowDown className="h-3 w-3" /> Navegar
          </span>
          <span className="flex items-center gap-1">
            <CornerDownLeft className="h-3 w-3" /> Selecionar
          </span>
        </div>
      </div>
    </div>
  );
}
