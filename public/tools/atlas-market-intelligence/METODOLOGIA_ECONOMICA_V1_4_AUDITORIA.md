# Market Intelligence Atlas GR — Unit Economics v1.4

## Registro auditável de decisões econômicas territoriais

A v1.4 não altera o ranking territorial Core Evidence nem a matemática econômica da v1.2. Ela resolve um problema de governança: uma decisão econômica preenchida na interface não pode existir somente no estado temporário do navegador.

A partir desta versão, ADMIN e GESTOR podem registrar um snapshot econômico imutável e reproduzível.

## O que é persistido

Cada snapshot contém:

- território canônico publicado em `data/territorios.json`;
- versão da metodologia territorial;
- versão do modelo econômico;
- cenário comercial (`CONSERVADOR`, `BASE` ou `AGRESSIVO`);
- percentual de mercado ICP atendível;
- custos mensais do vendedor;
- investimento inicial;
- premissas de receita, funil e retenção;
- política de payback e ROI;
- calibração CRM verificada no servidor, somente quando efetivamente aplicada;
- indicação explícita de a calibração ter sido aplicada ou não;
- assessment econômico recalculado no servidor;
- recomendação resultante;
- hash SHA-256 determinístico;
- autor e data de criação.

## Regra central: o navegador não é fonte de verdade

O `POST /api/market-intelligence/economic-scenarios` recebe apenas as premissas e o `territoryId` como proposta de cenário.

O backend:

1. abre o ranking materializado publicado;
2. resolve o território pelo `territoryId`;
3. ignora qualquer tentativa do cliente de informar TAM, score, cidade, confiança ou veredito;
4. deriva o SAM a partir do TAM canônico e da parcela atendível;
5. recalcula `assessTerritoryEconomics` no servidor;
6. verifica a calibração CRM no backend quando houver selo CRM;
7. monta o snapshot final;
8. gera o hash determinístico;
9. persiste o resultado sob RLS.

Assim, mudar uma resposta no DevTools não transforma um cenário ruim em `RECOMENDADO` dentro da trilha auditável.

## Integridade da calibração CRM

Quando `calibration.applied = true`, o JSON de calibração enviado pelo navegador não é aceito como prova.

O servidor:

1. executa novamente `CommercialIntelligenceUseCases.historicalTrends()` para a organização autenticada;
2. usa o mês civil atual de Brasília como referência da janela de seis meses;
3. recalcula `calibrateSellerEconomicsFromHistory()`;
4. exige amostra elegível;
5. compara Ticket MRR, Win Rate e Sales Cycle do cenário com a calibração recalculada;
6. persiste no snapshot somente a calibração produzida pelo servidor.

Se qualquer um dos três valores divergir da leitura atual, a gravação é rejeitada e o usuário deve reaplicar os dados do CRM antes de salvar.

Isto impede um cliente alterado de fabricar simultaneamente o valor e um falso objeto `calibration.snapshot` que pareça justificá-lo.

Quando `calibration.applied = false`, qualquer snapshot CRM enviado junto é descartado antes do hash e da persistência. Uma sugestão não aplicada não altera a identidade matemática do cenário.

## Imutabilidade e idempotência

A API não expõe `PUT`, `PATCH` nem `DELETE` para cenários econômicos.

O banco possui chave única:

```text
organizationId + snapshotHash
```

Salvar o mesmo estado econômico novamente não cria uma cópia nova. O registro já existente é devolvido.

Alterar qualquer premissa relevante, a metodologia territorial, os dados canônicos do território ou uma calibração CRM efetivamente aplicada gera outro hash e, portanto, outra versão histórica.

O nome do snapshot não participa do hash. Ele funciona como rótulo humano, não como parte da decisão matemática.

## Isolamento e RBAC

A tabela `MarketIntelligenceEconomicScenario` possui:

- `organizationId` obrigatório;
- `ENABLE ROW LEVEL SECURITY`;
- `FORCE ROW LEVEL SECURITY`;
- policy baseada em `app.current_tenant_id`;
- filtro explícito por organização nas queries de serviço como defesa adicional.

Queries raw passam obrigatoriamente por `withRlsContext`, pois SQL cru não atravessa a extensão de modelo do Prisma.

A rota exige:

```text
ADMIN ou GESTOR
```

Custos, margem, política de investimento e histórico de decisão não são expostos a papéis operacionais nesta versão.

## Reabrir um snapshot

Reabrir restaura:

- território;
- mercado atendível;
- custos;
- receita e funil;
- investimento inicial;
- política;
- cenário comercial.

A v1.4 não marca automaticamente uma calibração CRM histórica como aplicada numa nova versão.

O snapshot antigo continua preservando sua proveniência original. Se o usuário quiser salvar uma nova versão com selo CRM, deve reaplicar conscientemente a calibração corrente.

Isto evita representar dados históricos como se fossem uma leitura atual do CRM.

## O que a v1.4 não faz

A v1.4 não:

- altera o Opportunity Score territorial;
- inventa custos;
- inventa margem;
- inventa churn;
- inventa produtividade;
- inventa conversão reunião → oportunidade;
- altera o ranking materializado;
- aprova contratação automaticamente fora da política configurada;
- transforma snapshot histórico em verdade atual;
- aceita proveniência CRM declarada pelo navegador sem revalidação no backend.

## Testes obrigatórios

A implementação deve manter verdes:

1. teste de integração real de persistência e idempotência;
2. teste de isolamento entre tenants;
3. descarte de CRM não aplicado da identidade do cenário;
4. rejeição de falsa proveniência CRM;
5. E2E de salvar, alterar o formulário e reabrir o estado histórico;
6. Market Intelligence Quality Gate;
7. Code Quality;
8. SonarQube;
9. Playwright;
10. CI completo com migrations e integração real.

## Evolução posterior

A trilha criada aqui permite, em versões futuras:

- comparar duas decisões históricas;
- exigir aprovação executiva sobre um snapshot específico;
- registrar `APROVADO`, `REJEITADO` ou `ADIADO` sem alterar o snapshot econômico original;
- medir posteriormente resultado realizado versus hipótese original;
- calibrar o modelo com decisões e resultados reais sem apagar o histórico.
