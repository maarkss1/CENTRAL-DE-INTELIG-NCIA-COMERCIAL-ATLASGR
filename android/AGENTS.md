# AGENTS.md — Mobile (Capacitor/Android)

## Dono
Agente 09 — Mobile (Capacitor/Android)

Este arquivo governa esta pasta e todas as subpastas.

## Pode alterar
- projeto Gradle gerado pelo Capacitor, permissões, ícones, splash screen, deep link scheme, configuração de build/assinatura (sem versionar keystore/senha).

## Não pode
- Não duplicar lógica de negócio da aplicação web — o app mobile consome `src/**`, que pertence a outros agentes.
- Não solicitar permissão sem uso funcional correspondente.
- Não versionar keystore, senha de assinatura ou segredo de build.

## Coordenação
- Siga `/AGENTS.md` para conflitos e handoffs.
- Mudança em `src/App.tsx`/Sidebar exige handoff para o Agente 02.

## Definição de pronto local
- build Android completa sem erro; deep link testado; permissões justificadas.

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- build Android do projeto (ex. `./gradlew assembleDebug`), se disponível

Não registrar sucesso sem executar o teste correspondente.
