import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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
        primaryColor: '#FF5618',
        accentColor: '#FF6B10',
        badgeBg: 'bg-orange-100 text-orange-800 border-orange-200',
        badgeText: 'AtlasGR',
    },
    totaltrac: {
        id: 'totaltrac',
        name: 'TotalTrac',
        operatingSystemName: 'Fleet OS',
        slogan: 'Conectar para Cuidar',
        description: 'Telemetria CAN, videotelemetria com IA, controle de jornada, iscas RF e imobilizadores.',
        primaryColor: '#0088CC',
        accentColor: '#0284c7',
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
    const brandInfo = BRAND_CONFIGS[activeBrand];

    useEffect(() => {
        document.documentElement.style.setProperty('--brand-primary', brandInfo.primaryColor);
        document.documentElement.style.setProperty('--brand-accent', brandInfo.accentColor);
    }, [activeBrand, brandInfo]);

    return (
        <BrandContext.Provider value={{ activeBrand, setActiveBrand, brandInfo }}>
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

