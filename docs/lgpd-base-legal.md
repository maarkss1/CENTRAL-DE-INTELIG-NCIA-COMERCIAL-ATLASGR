# Mapeamento de Bases Legais (LGPD - Lei 13.709/2018)

Este documento mapeia o tratamento de dados pessoais no **AtlasGR / Central de Inteligência Comercial**, especificando a finalidade, a base legal aplicável e o ciclo de vida dos dados.

---

## 1. Mapeamento de Categorias de Dados

| Categoria de Dado | Exemplos de Campos | Finalidade | Base Legal (Art. 7º LGPD) | Retenção / Eliminação |
|-------------------|--------------------|------------|---------------------------|----------------------|
| **Identificação do Prospect** | Nome, E-mail profissional, Cargo, LinkedIn | Prospecção B2B ativa e qualificação comercial | Legítimo Interesse (Art. 7º, IX) | Anonimização após 90 dias sem interação se desqualificado |
| **Contato Direto** | Telefone fixo, WhatsApp corporativo | Comunicação operacional e agendamento de reuniões | Legítimo Interesse (Art. 7º, IX) | Exclusão imediata via Opt-Out ou requisição do titular |
| **Registros de Interação** | Transcrições de voz, histórico de mensagens, notas | Auditoria de atendimento e treinamento de IA | Execução de Contrato / Legítimo Interesse | Anonimização/mascaramento de PII |
| **Dados do Usuário do Sistema** | Nome, E-mail corporativo, Hash de senha | Autenticação, controle de acesso e auditoria | Execução de Contrato (Art. 7º, V) / Cumprimento de Obrigação Legal | Duração do vínculo contratual |

---

## 2. Direitos do Titular (Art. 18)

A plataforma provê suporte técnico automatizado para atendimento aos direitos dos titulares:
- **Exclusão / Anonimização**: Endpoint `DELETE /api/lgpd/titular/:contactId` e função `eraseDataSubject()`.
- **Portabilidade**: Endpoint `GET /api/lgpd/titular/:contactId/export` que gera payload JSON dos dados associados ao titular.
- **Opt-out de Comunicação**: Reconhecimento automático da palavra-chave `SAIR` em mensagens de WhatsApp e opt-out de chamadas telefônicas.

---

## 3. Segurança e Governança

- **Isolamento de Tenants (Multi-Tenancy)**: RLS (Row Level Security) via PostgreSQL + contextos isolados.
- **Minimização para LLMs**: `src/features/intelligence/services/guardrails.service.ts` (`minimizePii`/`rehydratePii`) troca valores de PII conhecidos (ex.: nome do contato) por um token reversível antes de o texto sair para um provedor de IA externo, e restaura o valor real só na resposta final entregue ao usuário humano.
  (`src/lib/security/piiSanitizer.ts` existiu em paralelo, nunca foi integrado a nenhum caminho real e foi removido na Onda 7 — ver decisão registrada no handoff/relatório do Agente 13.)
- **Base legal / consentimento antes do envio a provedor externo**: `guardrails.service.ts` (`hasPiiExternalConsent`/`assertPiiExternalConsent`) é o ponto único que verifica, antes de qualquer chamada com dado de um titular real, se a organização está autorizada (`AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS`, fail-closed) — distinto da minimização acima: decide *se* o dado pode ser tratado por IA externa, não apenas *o quê* sai no texto.
- **Trilha de Auditoria**: Registro de ações no modelo `AuditLog` com IP, usuário, ação e data/hora.
