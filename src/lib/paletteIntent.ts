/** Nome do evento global disparado para abrir o Command Palette (⌘K/Ctrl+K ou clique na busca do topbar). */
export const OPEN_COMMAND_PALETTE_EVENT = 'atlas:open-command-palette';

/** Nome do evento global disparado para abrir o copiloto de IA flutuante a partir de qualquer tela. */
export const OPEN_AI_CHAT_EVENT = 'atlas:open-ai-chat';

/**
 * Intenção que o Command Palette carrega pro módulo de destino (ex.: "abra o formulário de criar"
 * ou "já busca por este termo"). Antes da migração pra rotas reais (App.tsx) isso vivia num
 * singleton mutável fora do React, porque não havia como anexar dado à navegação; agora viaja como
 * `location.state` do `navigate()` — ver `CommandPalette.tsx` (produtor) e `ContactList`/
 * `CompanyList`/`ActivityList` (consumidores, via `useLocation().state`).
 */
export type PaletteIntent =
    | { type: 'prefill-search'; value: string }
    | { type: 'open-create' };
