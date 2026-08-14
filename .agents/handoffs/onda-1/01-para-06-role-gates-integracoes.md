- De: Agente 01 (Plataforma, Segurança e Dados)
- Para: Agente 06 (Integrações e Bitrix)
- Onda: 1
- Status: resolvido
- Prioridade: normal

## Problema

Mesma auditoria descrita em `01-para-04-role-gates-crm.md`: ao fechar o bloqueador prioritário #2
do AGENTS.md, os endpoints de integrações estavam abertos a qualquer papel autenticado, inclusive
`VISUALIZADOR`. Isso incluía coisas com efeito real fora do sistema (enviar WhatsApp, discar
ligação real, desconectar uma integração de produção, importar leads/negócios em massa do Bitrix).

Também encontrei e corrigi um problema mais sério, separado do anterior: `PUT
/api/intelligence/ai-settings` (arquivo do Agente 07, ver handoff próprio) não tinha
`organizationId` NENHUM no schema — é configuração global de IA compartilhada por todos os
tenants, e qualquer usuário autenticado de qualquer organização podia sobrescrevê-la. Só cito aqui
porque é o exemplo mais grave do padrão que motivou esta auditoria inteira.

Apliquei `requireRole` diretamente nesses arquivos (fora do meu escopo de propriedade), pelo mesmo
motivo do handoff anterior: é bloqueador de onda, não item de backlog.

## Arquivo(s) envolvido(s)
- `src/features/integrations/whatsapp/whatsapp.routes.ts` — `POST /send` → VENDEDOR+ (uso do dia a
  dia); `POST /connect`, `POST /disconnect` → GESTOR+ (gestão da sessão/integração).
- `src/features/integrations/threecx/threecx.routes.ts` — `POST /call` → VENDEDOR+; `POST /connect`,
  `POST /connections/:id/test`, `POST /disconnect/:id` → GESTOR+.
- `src/features/integrations/google/google.routes.ts` — `POST /disconnect` → GESTOR+ (`/auth-url` e
  `/callback` continuam abertos a qualquer autenticado — é o próprio usuário conectando sua conta).
- `src/features/integrations/bitrix/bitrix.routes.ts` — `POST /connect`, `POST
  /connections/:id/test`, `POST /disconnect/:id`, `POST /leads/import`, `POST /deals/import`, `POST
  PUT DELETE /sync-rules*` → GESTOR+ (gestão de integração + importação em massa).
- `src/features/integrations/birth-voice/birthVoice.routes.ts` — `POST /call/:leadId` → VENDEDOR+
  (discagem do dia a dia); `POST /suppressions` → GESTOR+ (registro de opt-out é sensível para
  compliance de discagem).

## Alteração necessária
Revisar os limiares — em particular, se `POST /suppressions` (bloqueio manual de número) deveria
ser mais aberto (qualquer vendedor que atende um pedido de opt-out por telefone/e-mail deveria
poder registrar na hora, sem precisar de um GESTOR por perto). Coloquei GESTOR+ por ser
compliance-sensível, mas pode estar restritivo demais pro fluxo real de atendimento.

## Teste esperado
Testes de matriz de acesso para os endpoints acima quando você tocar nesses arquivos na Onda 1/2.
Nenhum teste automatizado cobre esses limiares específicos ainda (diferente do `ai-settings`, que
já tem teste — ver handoff para o Agente 07).

## Contexto adicional
Ver também `.agents/handoffs/onda-1/01-para-06-teste-integrations-ambiguo.md` (já existente,
aberto antes deste) — falha real em `tests/unit/features/integrations/components/Integrations.test.tsx`
encontrada ao rodar o gate da Onda 1, não relacionada a esta auditoria de autorização.

## Resolução
Já corrigido em um ciclo anterior do Agente 06 (commit `c700ff2f fix(06): permitir opt-out imediato
ao vendedor`) — este handoff só nunca teve o `Status` atualizado. `POST /suppressions` em
`src/features/integrations/birth-voice/birthVoice.routes.ts` está hoje em
`requireRole(['ADMIN', 'GESTOR', 'VENDEDOR'])`, com o comentário no próprio código explicando o
raciocínio: opt-out é uma obrigação imediata do atendimento (LGPD/compliance de discagem) e não
deve depender da disponibilidade de um GESTOR — o risco real de deixar isso restrito a GESTOR+ era
um número continuar sendo discado por mais tempo do que deveria enquanto se espera alguém com
cargo mais alto registrar o bloqueio. `VISUALIZADOR` continua de fora (somente leitura). Revisado
nesta rodada (Agente 06, item de revisão leve/opcional da missão de remediação) — concordo com o
limiar atual, nenhuma mudança adicional necessária.
