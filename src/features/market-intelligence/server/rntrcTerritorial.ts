/**
 * Onda 42 (DEC-15): a implementação real vive em `src/shared/services/rntrcTerritorialRisk.service.ts`
 * — movida para `src/shared/` porque `src/features/prospecting/` também precisa deste indicador
 * territorial RNTRC/ANTT, e um import direto de feature para feature viola a regra
 * `no-cross-feature-imports` do dependency-cruiser (`.dependency-cruiser.cjs`). Este arquivo
 * permanece só como reexport, para não obrigar `marketIntelligence.service.ts` (dono original deste
 * módulo) a mudar seu caminho de import.
 */
export {
    rntrcRiskByUf,
    rntrcTerritorialSnapshot,
    type RntrcTerritorialRow,
    type RntrcTerritorialSnapshot,
    type RntrcRiskTier,
    type RntrcUfRisk,
} from '../../../shared/services/rntrcTerritorialRisk.service.js';
