import { useState } from 'react';
import { LineChart } from 'lucide-react';
import { Skeleton } from '../components/ui/Skeleton';

export function MarketIntelligence() {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Nunca existiu um componente `ui/PageHeader` no repositório — este import quebrava o
          build de produção e o type-check desde a criação deste arquivo (PR #99). Cabeçalho
          reconstruído inline seguindo o vocabulário visual já usado em outras telas
          (text-ink/text-ink-2/border-line, ver CompanyDetail.tsx). */}
      <div className="flex items-center gap-3 border-b border-line px-6 py-4">
        <span className="rounded-lg bg-brand/10 p-2"><LineChart size={24} className="text-brand" /></span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-ink tracking-tight">Market Intelligence</h1>
          <p className="text-sm text-ink-2">Mapeamento geográfico de demanda e oportunidades (RNTRC, ICP e MDF-e)</p>
        </div>
      </div>
      <div className="flex-1 relative p-6 pt-0">
        <div className="w-full h-full bg-white rounded-3xl border border-line shadow-sm overflow-hidden relative">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex flex-col p-6">
              <Skeleton className="h-16 w-full mb-4 rounded-xl" />
              <div className="flex-1 flex gap-4">
                <Skeleton className="h-full w-full rounded-xl" />
                <Skeleton className="h-full w-80 rounded-xl hidden md:block" />
              </div>
            </div>
          )}
          <iframe 
            src="/tools/atlas-market-intelligence/index.html?in_app=true" 
            className="w-full h-full border-0 absolute inset-0 z-20"
            title="Atlas Market Intelligence"
            onLoad={() => setIsLoading(false)}
            style={{ opacity: isLoading ? 0 : 1, transition: 'opacity 0.4s ease' }}
          />
        </div>
      </div>
    </div>
  );
}
