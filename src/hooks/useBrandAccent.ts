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
        brandName: isAtlas ? 'Atlas' : 'Total Trac',
        text: isAtlas ? 'text-atlas-orange' : 'text-totaltrack-blue',
        textSoft: isAtlas ? 'text-orange-300' : 'text-totaltrac-light',
        // bg/solidBg usam a versão -active (mais escura): todo consumidor que as usa emparelha
        // com texto branco em cima (Calendar "hoje", filtro de período do Billing, abas do
        // BitrixGuideHub/AutomationGuide/SuperagentCreator) — bg-atlas-orange/bg-totaltrack-blue
        // crus com texto branco caem abaixo de 4.5:1 (achado do axe-core, ver comentário em
        // globals.css). As demais variantes (bgSoft, border etc.) não têm texto branco em cima e
        // continuam com a cor crua.
        bg: isAtlas ? 'bg-atlas-orange-active' : 'bg-totaltrack-blue-active',
        bgSoft: isAtlas ? 'bg-atlas-orange/15' : 'bg-totaltrack-blue/15',
        bgSofter: isAtlas ? 'bg-atlas-orange/10' : 'bg-totaltrack-blue/10',
        border: isAtlas ? 'border-atlas-orange' : 'border-totaltrack-blue',
        borderSoft: isAtlas ? 'border-atlas-orange/30' : 'border-totaltrack-blue/30',
        hoverBorder: isAtlas ? 'hover:border-atlas-orange/50' : 'hover:border-totaltrack-blue/50',
        hoverBg: isAtlas ? 'hover:bg-atlas-orange/30' : 'hover:bg-totaltrack-blue/30',
        selectedBg: isAtlas ? 'bg-atlas-orange/30 border-atlas-orange' : 'bg-totaltrack-blue/30 border-totaltrack-blue',
        solidBg: isAtlas ? 'bg-atlas-orange-active' : 'bg-totaltrack-blue-active',
        gradient: isAtlas ? 'from-atlas-orange to-orange-400' : 'from-totaltrac-navy to-totaltrack-blue',
        gradientVia: isAtlas ? 'from-atlas-orange via-orange-500 to-amber-500' : 'from-totaltrac-deep via-totaltrac-navy to-totaltrack-blue',
        glow: isAtlas ? 'shadow-[0_0_40px_rgba(255,86,24,0.4)] hover:shadow-[0_0_60px_rgba(255,86,24,0.6)]' : 'shadow-[0_0_40px_rgba(0,143,206,0.4)] hover:shadow-[0_0_60px_rgba(0,143,206,0.6)]',
        blobA: isAtlas ? 'bg-atlas-orange/15' : 'bg-totaltrack-blue/15',
        blobB: isAtlas ? 'bg-amber-500/15' : 'bg-totaltrac-light/15',
    };
}
