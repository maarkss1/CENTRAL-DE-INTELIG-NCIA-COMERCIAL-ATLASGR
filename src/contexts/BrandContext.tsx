import { createContext, useContext, useState, ReactNode } from 'react';

export type BrandMode = 'atlasgr' | 'totaltrack';

interface BrandContextType {
    brand: BrandMode;
    setBrand: (brand: BrandMode) => void;
    toggleBrand: () => void;
    brandName: string;
    brandSubtitle: string;
    brandColor: string;
}

const BrandContext = createContext<BrandContextType | undefined>(undefined);

export function BrandProvider({ children }: { children: ReactNode }) {
    const [brand, setBrand] = useState<BrandMode>('atlasgr');

    const toggleBrand = () => {
        setBrand(prev => (prev === 'atlasgr' ? 'totaltrack' : 'atlasgr'));
    };

    const value: BrandContextType = {
        brand,
        setBrand,
        toggleBrand,
        brandName: brand === 'atlasgr' ? 'AtlasGR' : 'TotalTrack',
        brandSubtitle: brand === 'atlasgr' ? 'Commercial OS • Revenue Intelligence' : 'Fleet OS • Telemetria & Rastreamento',
        brandColor: brand === 'atlasgr' ? 'orange' : 'blue',
    };

    return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand() {
    const context = useContext(BrandContext);
    if (!context) {
        throw new Error('useBrand deve ser usado dentro de um BrandProvider');
    }
    return context;
}
