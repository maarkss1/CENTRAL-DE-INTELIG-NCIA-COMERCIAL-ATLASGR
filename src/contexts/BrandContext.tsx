/* eslint-disable react-refresh/only-export-components */
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
        name: 'Total Trac',
        operatingSystemName: 'Fleet OS',
        slogan: 'Conectar para Cuidar',
        description: 'Telemetria CAN, videotelemetria com IA, controle de jornada, iscas RF e imobilizadores.',
        primaryColor: '#374898',
        accentColor: '#008FCE',
        badgeBg: 'bg-blue-100 text-blue-900 border-blue-200',
        badgeText: 'Total Trac',
    }
};

interface BrandContextType {
    activeBrand: Brand;
    setActiveBrand: (brand: Brand) => void;
    brandInfo: BrandInfo;
}

const BrandContext = createContext<BrandContextType | undefined>(undefined);

function getInitialBrand(): Brand {
    if (typeof window === 'undefined') return 'atlasgr';
    return window.localStorage.getItem('selectedBrand') === 'totaltrac' ? 'totaltrac' : 'atlasgr';
}

export function BrandProvider({ children }: { children: ReactNode }) {
    const [activeBrand, setActiveBrand] = useState<Brand>(getInitialBrand);
    const brandInfo = BRAND_CONFIGS[activeBrand];

    useEffect(() => {
        document.documentElement.style.setProperty('--brand-primary', brandInfo.primaryColor);
        document.documentElement.style.setProperty('--brand-accent', brandInfo.accentColor);
        // --brand/--brand-2 são as variáveis que os tokens de design (bg-brand, text-brand,
        // border-brand etc.) realmente consomem via --color-brand: var(--brand) no globals.css.
        // Ficaram de fora da troca de marca acima (só --brand-primary/--brand-accent eram
        // atualizadas), então qualquer componente migrado pros novos tokens ficava sempre laranja
        // (cor da AtlasGR) mesmo com a TotalTrac selecionada.
        document.documentElement.style.setProperty('--brand', brandInfo.primaryColor);
        document.documentElement.style.setProperty('--brand-2', brandInfo.accentColor);
        document.documentElement.dataset.brand = activeBrand;
        window.localStorage.setItem('selectedBrand', activeBrand);
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

