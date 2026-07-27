import { createContext, useContext, useState, ReactNode } from 'react';

export type Brand = 'atlasgr' | 'totaltrac';

export interface BrandInfo {
    id: Brand;
    name: string;
    operatingSystemName: string;
    slogan: string;
    description: string;
    primaryColor: string;
    accentColor: string;
    badgeBg: string;
    badgeText: string;
}

export const BRAND_CONFIGS: Record<Brand, BrandInfo> = {
    atlasgr: {
        id: 'atlasgr',
        name: 'AtlasGR',
        operatingSystemName: 'Revenue OS',
        slogan: 'Inteligência & Aceleração Comercial B2B',
        description: 'Gestão de risco de carga, scoring inteligente e motor de prospecção preditiva.',
        primaryColor: '#f97316', // atlas-orange
        accentColor: 'from-amber-500 to-orange-600',
        badgeBg: 'bg-orange-100 text-orange-800 border-orange-200',
        badgeText: 'AtlasGR',
    },
    totaltrac: {
        id: 'totaltrac',
        name: 'TotalTrac',
        operatingSystemName: 'Fleet OS',
        slogan: 'Conectar para Cuidar',
        description: 'Telemetria CAN, videotelemetria com IA, controle de jornada, iscas RF e imobilizadores.',
        primaryColor: '#0284c7', // sky-600 / blue
        accentColor: 'from-blue-600 to-cyan-500',
        badgeBg: 'bg-sky-100 text-sky-800 border-sky-200',
        badgeText: 'TotalTrac',
    }
};

interface BrandContextType {
    activeBrand: Brand;
    setActiveBrand: (brand: Brand) => void;
    brandInfo: BrandInfo;
}

const BrandContext = createContext<BrandContextType | undefined>(undefined);

export function BrandProvider({ children }: { children: ReactNode }) {
    const [activeBrand, setActiveBrand] = useState<Brand>('atlasgr');

    return (
        <BrandContext.Provider value={{ activeBrand, setActiveBrand, brandInfo: BRAND_CONFIGS[activeBrand] }}>
            {children}
        </BrandContext.Provider>
    );
}

export function useBrand() {
    const context = useContext(BrandContext);
    if (context === undefined) {
        throw new Error('useBrand must be used within a BrandProvider');
    }
    return context;
}

