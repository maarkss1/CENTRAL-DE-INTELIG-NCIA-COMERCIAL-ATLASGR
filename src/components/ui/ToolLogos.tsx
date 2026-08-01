/* eslint-disable react-refresh/only-export-components */
import type { FC } from 'react';

const BRAND = {
    orange: '#FF5618',
    dark: '#333333',
    yellow: '#FFC500',
    lightOrange: '#FF8008',
    white: '#FFFFFF',
} as const;

// ─── Símbolo base (paralelogramo + triângulo) ───
function BrandSymbol({ x = 4, y = 8, scale = 0.5, fill = BRAND.orange }: { x?: number; y?: number; scale?: number; fill?: string }) {
    return (
        <g transform={`translate(${x}, ${y}) scale(${scale})`}>
            <polygon points="10,50 33,10 53,10 30,50" fill={fill} />
            <polygon points="35,50 46.5,30 58,50" fill={fill} />
        </g>
    );
}

// ─── Tipos ───
export type ToolKey =
    | 'prospect'
    | 'intelligence'
    | 'sales'
    | 'revenue'
    | 'growth'
    | 'prospect_ai'
    | 'sales_cloud'
    | 'lead_engine'
    | 'revenue_os'
    | 'commercial_os';

interface ToolLogoProps {
    tool: ToolKey;
    className?: string;
    variant?: 'default' | 'white' | 'compact';
}

// ─── Dados de cada ferramenta ───
export const TOOL_DATA: Record<ToolKey, { label: string; accent: string }> = {
    prospect:      { label: 'Prospect',       accent: BRAND.orange },
    intelligence:  { label: 'Intelligence',   accent: '#6366F1' },   // indigo
    sales:         { label: 'Sales',          accent: '#3B82F6' },   // blue
    revenue:       { label: 'Revenue',        accent: '#10B981' },   // emerald
    growth:        { label: 'Growth',         accent: '#22C55E' },   // green
    prospect_ai:   { label: 'Prospect AI',    accent: '#A855F7' },   // purple
    sales_cloud:   { label: 'Sales Cloud',    accent: '#3B82F6' },   // blue
    lead_engine:   { label: 'Lead Engine',    accent: '#6366F1' },   // indigo
    revenue_os:    { label: 'Revenue OS',     accent: BRAND.orange },
    commercial_os: { label: 'Commercial OS',  accent: '#D946EF' },   // fuchsia
};

// ─── SVG Individual por Ferramenta ───

export function ProspectLogo({ className = 'h-8' }: { className?: string }) {
    return (
        <svg viewBox="0 0 300 50" className={className} xmlns="http://www.w3.org/2000/svg">
            <BrandSymbol x={0} y={3} scale={0.7} />
            <text x="48" y="28" fontFamily="Montserrat, sans-serif" fontWeight="900" fontSize="22" fill={BRAND.dark} letterSpacing="-0.5">AtlasGR</text>
            <text x="160" y="28" fontFamily="Montserrat, sans-serif" fontWeight="700" fontSize="22" fill={BRAND.orange} letterSpacing="-0.5">Prospect</text>
        </svg>
    );
}

export function IntelligenceLogo({ className = 'h-8' }: { className?: string }) {
    return (
        <svg viewBox="0 0 340 50" className={className} xmlns="http://www.w3.org/2000/svg">
            <BrandSymbol x={0} y={3} scale={0.7} />
            <text x="48" y="28" fontFamily="Montserrat, sans-serif" fontWeight="900" fontSize="22" fill={BRAND.dark} letterSpacing="-0.5">AtlasGR</text>
            <text x="160" y="28" fontFamily="Montserrat, sans-serif" fontWeight="700" fontSize="22" fill="#6366F1" letterSpacing="-0.5">Intelligence</text>
        </svg>
    );
}

export function SalesLogo({ className = 'h-8' }: { className?: string }) {
    return (
        <svg viewBox="0 0 280 50" className={className} xmlns="http://www.w3.org/2000/svg">
            <BrandSymbol x={0} y={3} scale={0.7} />
            <text x="48" y="28" fontFamily="Montserrat, sans-serif" fontWeight="900" fontSize="22" fill={BRAND.dark} letterSpacing="-0.5">AtlasGR</text>
            <text x="160" y="28" fontFamily="Montserrat, sans-serif" fontWeight="700" fontSize="22" fill="#3B82F6" letterSpacing="-0.5">Sales</text>
        </svg>
    );
}

export function RevenueLogo({ className = 'h-8' }: { className?: string }) {
    return (
        <svg viewBox="0 0 310 50" className={className} xmlns="http://www.w3.org/2000/svg">
            <BrandSymbol x={0} y={3} scale={0.7} />
            <text x="48" y="28" fontFamily="Montserrat, sans-serif" fontWeight="900" fontSize="22" fill={BRAND.dark} letterSpacing="-0.5">AtlasGR</text>
            <text x="160" y="28" fontFamily="Montserrat, sans-serif" fontWeight="700" fontSize="22" fill="#10B981" letterSpacing="-0.5">Revenue</text>
        </svg>
    );
}

export function GrowthLogo({ className = 'h-8' }: { className?: string }) {
    return (
        <svg viewBox="0 0 290 50" className={className} xmlns="http://www.w3.org/2000/svg">
            <BrandSymbol x={0} y={3} scale={0.7} />
            <text x="48" y="28" fontFamily="Montserrat, sans-serif" fontWeight="900" fontSize="22" fill={BRAND.dark} letterSpacing="-0.5">AtlasGR</text>
            <text x="160" y="28" fontFamily="Montserrat, sans-serif" fontWeight="700" fontSize="22" fill="#22C55E" letterSpacing="-0.5">Growth</text>
        </svg>
    );
}

export function ProspectAILogo({ className = 'h-8' }: { className?: string }) {
    return (
        <svg viewBox="0 0 340 50" className={className} xmlns="http://www.w3.org/2000/svg">
            <BrandSymbol x={0} y={3} scale={0.7} />
            <text x="48" y="28" fontFamily="Montserrat, sans-serif" fontWeight="900" fontSize="22" fill={BRAND.dark} letterSpacing="-0.5">AtlasGR</text>
            <text x="160" y="28" fontFamily="Montserrat, sans-serif" fontWeight="700" fontSize="22" fill="#A855F7" letterSpacing="-0.5">Prospect AI</text>
        </svg>
    );
}

export function SalesCloudLogo({ className = 'h-8' }: { className?: string }) {
    return (
        <svg viewBox="0 0 360 50" className={className} xmlns="http://www.w3.org/2000/svg">
            <BrandSymbol x={0} y={3} scale={0.7} />
            <text x="48" y="28" fontFamily="Montserrat, sans-serif" fontWeight="900" fontSize="22" fill={BRAND.dark} letterSpacing="-0.5">AtlasGR</text>
            <text x="160" y="28" fontFamily="Montserrat, sans-serif" fontWeight="700" fontSize="22" fill="#3B82F6" letterSpacing="-0.5">Sales Cloud</text>
        </svg>
    );
}

export function LeadEngineLogo({ className = 'h-8' }: { className?: string }) {
    return (
        <svg viewBox="0 0 360 50" className={className} xmlns="http://www.w3.org/2000/svg">
            <BrandSymbol x={0} y={3} scale={0.7} />
            <text x="48" y="28" fontFamily="Montserrat, sans-serif" fontWeight="900" fontSize="22" fill={BRAND.dark} letterSpacing="-0.5">AtlasGR</text>
            <text x="160" y="28" fontFamily="Montserrat, sans-serif" fontWeight="700" fontSize="22" fill="#6366F1" letterSpacing="-0.5">Lead Engine</text>
        </svg>
    );
}

export function RevenueOSLogo({ className = 'h-8' }: { className?: string }) {
    return (
        <svg viewBox="0 0 350 50" className={className} xmlns="http://www.w3.org/2000/svg">
            <BrandSymbol x={0} y={3} scale={0.7} />
            <text x="48" y="28" fontFamily="Montserrat, sans-serif" fontWeight="900" fontSize="22" fill={BRAND.dark} letterSpacing="-0.5">AtlasGR</text>
            <text x="160" y="28" fontFamily="Montserrat, sans-serif" fontWeight="700" fontSize="22" fill={BRAND.orange} letterSpacing="-0.5">Revenue OS</text>
        </svg>
    );
}

export function CommercialOSLogo({ className = 'h-8' }: { className?: string }) {
    return (
        <svg viewBox="0 0 380 50" className={className} xmlns="http://www.w3.org/2000/svg">
            <BrandSymbol x={0} y={3} scale={0.7} />
            <text x="48" y="28" fontFamily="Montserrat, sans-serif" fontWeight="900" fontSize="22" fill={BRAND.dark} letterSpacing="-0.5">AtlasGR</text>
            <text x="160" y="28" fontFamily="Montserrat, sans-serif" fontWeight="700" fontSize="22" fill="#D946EF" letterSpacing="-0.5">Commercial OS</text>
        </svg>
    );
}

// ─── Componente Dinâmico (seleciona pelo key) ───
const LOGO_MAP: Record<ToolKey, FC<{ className?: string }>> = {
    prospect: ProspectLogo,
    intelligence: IntelligenceLogo,
    sales: SalesLogo,
    revenue: RevenueLogo,
    growth: GrowthLogo,
    prospect_ai: ProspectAILogo,
    sales_cloud: SalesCloudLogo,
    lead_engine: LeadEngineLogo,
    revenue_os: RevenueOSLogo,
    commercial_os: CommercialOSLogo,
};

export function ToolLogo({ tool, className = 'h-8' }: ToolLogoProps) {
    const LogoComponent = LOGO_MAP[tool];
    return <LogoComponent className={className} />;
}
