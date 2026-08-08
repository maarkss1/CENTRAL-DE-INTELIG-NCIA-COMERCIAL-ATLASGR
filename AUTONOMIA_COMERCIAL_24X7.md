# Piloto Automático Comercial 24/7 — AtlasGR

## Resultado desta evolução

A plataforma passa a operar com cinco papéis coordenados:

| Papel | Responsabilidade autônoma | Limite operacional |
|---|---|---|
| SDR | Qualificação, pesquisa no playbook/RAG e primeiro e-mail personalizado | Contato externo respeita opt-in, score e janela comercial |
| BDR | Fit outbound, hipótese de dor e estratégia de primeira abordagem | Não inventa dados e não marca reunião sem resposta real |
| Closer | Objeções, prova de valor, proteção de margem e próximo compromisso | Não marca negócio como ganho sem evidência do comprador |
| CRM | Risco de estagnação, higiene do funil e próxima ação | Recomendações ficam vinculadas ao lead |
| Ops | Atividades e notificações internas | Ferramentas mutáveis não são usadas pelo scanner analítico |

O scheduler continua acordado 24 horas por dia. Comunicação externa automática só é liberada na
janela comercial; análise, priorização e preparação continuam fora dela.

## Gatilhos monitorados

- mensagem de WhatsApp com alta intenção, urgência ou objeção de preço;
- proposta enviada sem avanço;
- follow-up vencido;
- lead com score alto e sem próxima ação;
- oportunidade estagnada;
- lead novo sem primeiro toque após o tempo de tolerância.

Os candidatos são deduplicados por lead e priorizados. Um cooldown impede recomendações repetidas,
e a chave de idempotência impede duplicação mesmo com retry/restart do BullMQ.

## Modos de autonomia

### `supervised` — padrão seguro

- agentes analisam continuamente;
- o SDR produz rascunhos com RAG;
- toda comunicação externa aguarda aprovação;
- recomendações aprovadas viram notas auditáveis no histórico do lead.

### `full` — primeiro contato autônomo

O primeiro e-mail pode ser enviado sem clique humano somente quando todos os critérios abaixo são
verdadeiros:

1. a organização está explicitamente autorizada;
2. o modo é `full`;
3. o lead tem e-mail;
4. o score alcança `SWARM_AUTONOMOUS_MIN_SCORE`;
5. o horário está dentro da janela comercial e não é fim de semana;
6. SMTP está configurado;
7. a ação ainda não existe para o lead.

Se SMTP estiver indisponível ou uma trava falhar, a ação não é fingida como concluída: permanece
registrada para tratamento supervisionado.

## Ativação em produção

Aplicar primeiro a migration do ledger:

```powershell
npx.cmd prisma migrate deploy
```

Configuração mínima:

```dotenv
REDIS_URL=redis://...
ENABLE_QUEUES=true

SWARM_SCHEDULER_ENABLED=true
SWARM_SCHEDULER_ORGANIZATIONS=<organization-id>
SWARM_SCHEDULER_MAX_LEADS_PER_RUN=5
SWARM_AUTONOMY_MODE=supervised
SWARM_AUTONOMOUS_MIN_SCORE=80

GROQ_API_KEY=...
# ou OPENAI_API_KEY / GEMINI_API_KEY / LITELLM_URL
```

Para liberar envio autônomo:

```dotenv
SWARM_AUTONOMY_MODE=full
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=...
```

A discagem autônoma continua separada e exige suas próprias duas travas:
`SDR_COLD_CALL_ENABLED=true` e `SDR_COLD_CALL_ORGANIZATIONS=<organization-id>`.

## Auditoria e observabilidade

Cada decisão em `AIPendingAction` registra:

- agente originador;
- nível de risco;
- confiança;
- chave de idempotência;
- aprovação e descarte;
- quantidade e instante das tentativas;
- execução, horário e erro;
- payload/evidência que ativou a decisão.

Consumo, custo e latência dos modelos continuam em `AILog`; memórias dos papéis ficam em
`AgentMemory`; chamadas de voz têm `ColdCallRun`; o BullMQ preserva retries e jobs falhos.

## Critério honesto de “Closer autônomo”

O Closer pode analisar proposta, estruturar concessões com contrapartida, responder objeções e
definir o próximo compromisso. A transição para `Negócios Ganhos` não deve ser decidida por texto
gerado: ela exige um evento verificável, como aceite, assinatura ou confirmação do CRM. Essa trava
protege forecast, comissão e sincronização do Kanban/Bitrix.

## Próximas integrações para autonomia de ciclo completo

- criar/enviar proposta versionada e colher assinatura eletrônica;
- agendar reunião diretamente no Google Calendar após disponibilidade confirmada;
- executar cadência multicanal com opt-out unificado para e-mail, WhatsApp e voz;
- incorporar reply tracking de e-mail ao classificador de intenção;
- usar eventos de aceite/pagamento para fechar o negócio de forma determinística;
- painel de SLO por agente: cobertura, conversão, custo, latência, erro e override humano.
