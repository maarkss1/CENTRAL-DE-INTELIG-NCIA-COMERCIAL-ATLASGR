# Onda 37 — fechamento DATA-006/007/008 + Golden Dataset scoring

Data: 2026-08-20

## Escopo
- Reconciliar CYC pendente em referências antigas.
- Fechar DATA-006/007/008.
- Implementar harness automático do Golden Dataset, thresholds e LLM judge.
- Corrigir bloqueadores de CI encontrados na main durante a integração.

## Resultado
- CYC: sem mudanças funcionais; CYC-002/003/004/005/006/007/009 já estavam concluídos.
- DATA-006: calendário BRT canônico e regressões de fronteira UTC/BRT.
- DATA-007: previsor sem implementação duplicada frontend/backend.
- DATA-008: OpenAPI de Lead travado por contract test contra Zod.
- AI evaluation: scorer por categoria, LLM judge, runner live e CLI.
- Integração: Sidebar corrigido e credencial padrão removida do deploy OCI.

## Validação
Typecheck, testes focados e build são executados sobre a branch já mesclada localmente com a main atual antes do push.