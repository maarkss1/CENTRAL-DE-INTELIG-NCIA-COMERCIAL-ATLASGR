import { useBrand } from '../contexts/BrandContext';

/**
 * Classes Tailwind condicionadas à marca ativa (AtlasGR = laranja, TotalTrac = azul).
 * Usado pelas ferramentas dentro de IntelligenceHub que antes tinham cores roxo/rosa
 * fixas (herdadas de um nome de produto antigo, "Nexus") sem nenhuma relação com a
 * identidade visual de nenhuma das duas empresas.
 */
export function useBrandAccent() {
    const { activeBrand } = useBrand();
    const isAtlas = activeBrand === 'atlasgr';

    return {
        isAtlas,
        brandName: isAtlas ? 'Atlas' : 'TotalTrac',
        text: isAtlas ? 'text-atlas-orange' : 'text-totaltrack-blue',
        textSoft: isAtlas ? 'text-orange-300' : 'text-sky-300',
        bg: isAtlas ? 'bg-atlas-orange' : 'bg-totaltrack-blue',
        bgSoft: isAtlas ? 'bg-atlas-orange/15' : 'bg-totaltrack-blue/15',
        bgSofter: isAtlas ? 'bg-atlas-orange/10' : 'bg-totaltrack-blue/10',
        border: isAtlas ? 'border-atlas-orange' : 'border-totaltrack-blue',
        borderSoft: isAtlas ? 'border-atlas-orange/30' : 'border-totaltrack-blue/30',
        hoverBorder: isAtlas ? 'hover:border-atlas-orange/50' : 'hover:border-totaltrack-blue/50',
        hoverBg: isAtlas ? 'hover:bg-atlas-orange/30' : 'hover:bg-totaltrack-blue/30',
        selectedBg: isAtlas ? 'bg-atlas-orange/30 border-atlas-orange' : 'bg-totaltrack-blue/30 border-totaltrack-blue',
        solidBg: isAtlas ? 'bg-atlas-orange' : 'bg-totaltrack-blue',
        gradient: isAtlas ? 'from-atlas-orange to-orange-400' : 'from-totaltrack-blue to-sky-400',
        gradientVia: isAtlas ? 'from-atlas-orange via-orange-500 to-amber-500' : 'from-totaltrack-blue via-sky-500 to-blue-600',
        glow: isAtlas ? 'shadow-[0_0_40px_rgba(255,86,24,0.4)] hover:shadow-[0_0_60px_rgba(255,86,24,0.6)]' : 'shadow-[0_0_40px_rgba(0,136,204,0.4)] hover:shadow-[0_0_60px_rgba(0,136,204,0.6)]',
        blobA: isAtlas ? 'bg-atlas-orange/15' : 'bg-totaltrack-blue/15',
        blobB: isAtlas ? 'bg-amber-500/15' : 'bg-sky-400/15',
    };
}
