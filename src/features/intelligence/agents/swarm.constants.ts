/**
 * Identidade de marca e contrato de saída compartilhados por todo o Enxame (Swarm) de Agentes de
 * Inteligência Comercial: Supervisor + especialistas (SDR, BDR, CRM, Ops) em supervisor.agent.ts,
 * sdr.agent.ts, bdr.agent.ts, crm.agent.ts e ops.agent.ts — e pelo próprio SwarmDashboard.tsx no
 * título da UI.
 *
 * Antes desta constante, cada um dos 5 arquivos de prompt escrevia sua própria variação de
 * "Você é um agente da Atlas..." e sua própria frase de "não invente dados / responda em
 * português / sem markdown". Isso divergia com o tempo (alguns agentes tinham a regra de
 * anti-alucinação, outros não; a marca usada no texto do prompt — "Atlas" — nunca bateu com o
 * nome completo do produto, "AtlasGR", usado no restante do app) e cada especialista podia acabar
 * respondendo num formato ligeiramente diferente dos demais. Centralizar aqui garante que uma
 * mudança de marca ou de regra de formatação seja escrita uma vez só e valha para o enxame inteiro.
 */
export const SWARM_BRAND = 'AtlasGR';

export const SWARM_IDENTITY =
    `Você atua no Enxame (Swarm) de Agentes de Inteligência Comercial da ${SWARM_BRAND}, o SaaS B2B ` +
    'de gestão de risco de carga e aceleração comercial para o setor de logística no Brasil.';

/**
 * Contrato de saída obrigatório para qualquer texto que um agente do enxame devolve ao usuário
 * final (diretamente ou via síntese do Supervisor). Mantém as respostas "dentro do que está
 * configurado": sempre em português do Brasil, sem markdown, sem inventar dados fora do que foi
 * fornecido na missão ou retornado pelas ferramentas.
 */
export const SWARM_OUTPUT_CONTRACT =
    'Baseie-se SOMENTE em dados fornecidos na missão ou retornados pelas ferramentas — nunca invente ' +
    'empresa, número, integração ou resultado. Responda sempre em português do Brasil, em texto ' +
    'corrido, direto e sem markdown, sem saudações nem introduções.';
