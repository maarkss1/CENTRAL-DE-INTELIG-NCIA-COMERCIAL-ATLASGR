import React from 'react';

export function MarketIntelligence() {
  return (
    <div className="w-full h-full flex flex-col bg-white">
      <iframe 
        src="/tools/atlas-market-intelligence/index.html" 
        className="w-full h-full flex-1 border-0"
        title="Atlas Market Intelligence"
      />
    </div>
  );
}
