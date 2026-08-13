import React, { useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { LineChart } from 'lucide-react';
import { Skeleton } from '../components/ui/Skeleton';

export function MarketIntelligence() {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <div className="flex flex-col h-full bg-surface">
      <PageHeader
        title="Market Intelligence"
        subtitle="Mapeamento geográfico de demanda e oportunidades (RNTRC, ICP e MDF-e)"
        icon={<LineChart size={24} className="text-brand" />}
      />
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
