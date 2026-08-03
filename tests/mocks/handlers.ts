// Ponto único de entrada para os handlers MSW (TEST-004). Os handlers em si vivem em
// `tests/mocks/handlers/*.ts`, organizados por feature/domínio — este arquivo só reexporta a
// lista combinada para manter um caminho de import estável (`tests/mocks/handlers`).
export { handlers } from './handlers/index';
export { ok, fail } from './handlers/http';
