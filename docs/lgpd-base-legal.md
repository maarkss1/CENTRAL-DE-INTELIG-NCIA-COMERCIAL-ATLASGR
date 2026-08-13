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
- **Sanitização para LLMs**: Filtros de PII no módulo `src/lib/security/piiSanitizer.ts` para evitar vazamento de e-mails/telefones para provedores externos.
- **Trilha de Auditoria**: Registro de ações no modelo `AuditLog` com IP, usuário, ação e data/hora.
