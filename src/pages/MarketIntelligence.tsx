import { useState } from 'react';
import { Bot, Building2, MapPinned } from 'lucide-react';

import { LdrAccountIntelligence } from '../features/market-intelligence/components/LdrAccountIntelligence';
import { MarketIntelligenceApp } from '../features/market-intelligence/components/MarketIntelligenceApp';
import { MarketIntelligenceCompanies } from '../features/market-intelligence/components/MarketIntelligenceCompanies';

type MarketIntelligenceView = 'territories' | 'companies' | 'ldr';

export function MarketIntelligence() {
  const [view, setView] = useState<MarketIntelligenceView>('territories');

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 md:px-6">
        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1" role="group" aria-label="Visão do Market Intelligence">
          <button
            type="button"
            onClick={() => setView('territories')}
            aria-pressed={view === 'territories'}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-black transition ${view === 'territories' ? 'bg-white text-[#C43E0E] shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            <MapPinned className="h-4 w-4" /> Territorial
          </button>
          <button
            type="button"
            onClick={() => setView('companies')}
            aria-pressed={view === 'companies'}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-black transition ${view === 'companies' ? 'bg-white text-[#C43E0E] shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            <Building2 className="h-4 w-4" /> Empresas
          </button>
          <button
            type="button"
            onClick={() => setView('ldr')}
            aria-pressed={view === 'ldr'}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-black transition ${view === 'ldr' ? 'bg-white text-[#C43E0E] shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            <Bot className="h-4 w-4" /> LDR · Account 360
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {view === 'territories' && <MarketIntelligenceApp />}
        {view === 'companies' && <MarketIntelligenceCompanies />}
        {view === 'ldr' && <LdrAccountIntelligence />}
      </div>
    </div>
  );
}
