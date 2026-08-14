// Façade estável do gateway de IA.
//
// O núcleo continua em gateway-core.ts. A persistência de consumo foi isolada em usage-log.ts
// porque AILog tem uma regra RLS especial para telemetria interna sem tenant. Manter essa exceção
// fora do gateway principal deixa o corredor auditável e evita qualquer bypass global de RLS.
export * from './gateway-core.js';
export { logAiUsage } from './usage-log.js';
