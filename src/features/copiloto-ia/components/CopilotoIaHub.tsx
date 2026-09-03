import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { ConversationsTab } from './ConversationsTab';
import { BitrixMappingSettingsTab } from './BitrixMappingSettingsTab';

type TabId = 'conversas' | 'configuracoes';

const TABS: { id: TabId; label: string; managementOnly?: boolean }[] = [
  { id: 'conversas', label: 'Conversas' },
  { id: 'configuracoes', label: 'Configurações', managementOnly: true },
];

export function CopilotoIaHub() {
  const { currentUser } = useAuth();
  const canManage = !!currentUser && ['ADMIN', 'GESTOR'].includes(currentUser.role);
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = (searchParams.get('tab') as TabId) || 'conversas';
  const leadId = searchParams.get('leadId') || undefined;

  const visibleTabs = TABS.filter((t) => !t.managementOnly || canManage);

  const setTab = (next: TabId) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    setSearchParams(params);
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-display font-bold text-ink">Copiloto IA</h1>
        <p className="text-sm text-ink-2">
          Conversas, reuniões e ligações capturadas pelo Copiloto Comercial IA — resumo, deal
          health, coaching e sugestões de CRM já processados.
        </p>
      </div>

      <nav className="flex gap-1 border-b border-line" aria-label="Abas do Copiloto IA">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
              tab === t.id
                ? 'border-brand text-ink'
                : 'border-transparent text-ink-2 hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'conversas' && <ConversationsTab leadId={leadId} />}
      {tab === 'configuracoes' && canManage && <BitrixMappingSettingsTab />}
    </div>
  );
}
