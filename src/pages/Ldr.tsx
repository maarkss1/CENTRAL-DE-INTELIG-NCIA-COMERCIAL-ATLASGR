import { LdrAccountIntelligence } from '../features/market-intelligence/components/LdrAccountIntelligence';

export function Ldr() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="min-h-0 flex-1 overflow-auto">
        <LdrAccountIntelligence />
      </div>
    </div>
  );
}
