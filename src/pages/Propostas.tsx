import { useState } from 'react';
import { FileSignature } from 'lucide-react';
import { Skeleton } from '../components/ui/Skeleton';

export function Propostas() {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <div className="flex flex-col h-full bg-surface">
      <div className="flex items-center gap-3 border-b border-line px-6 py-4">
        <span className="rounded-lg bg-brand/10 p-2"><FileSignature size={24} className="text-brand" /></span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-ink tracking-tight">Propostas</h1>
          <p className="text-sm text-ink-2">Gere, preencha e envie propostas comerciais</p>
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
            src="/tools/propostas/index.html?in_app=true"
            className="w-full h-full border-0 absolute inset-0 z-20"
            title="Propostas Comerciais"
            onLoad={() => setIsLoading(false)}
            style={{ opacity: isLoading ? 0 : 1, transition: 'opacity 0.4s ease' }}
          />
        </div>
      </div>
    </div>
  );
}
