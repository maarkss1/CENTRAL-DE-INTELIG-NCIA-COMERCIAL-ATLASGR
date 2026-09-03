# AGENTS.md — Integrações e Bitrix

## Dono
Agente 06 — Integrações e Bitrix

Este arquivo governa esta pasta e todas as subpastas.

## Pode alterar
- Bitrix, Extrações, Google, WhatsApp, 3CX, voz, status/retry de integrações.

## Não pode
- Não criar/editar migration.
- Não armazenar segredo em localStorage.
- Não afirmar sucesso sem confirmação.
- Não remover a "ABERTURA OBRIGATÓRIA" do roteiro de voz (`birth-voice/atlasProductPlaybook.ts`) —
  é a divulgação de que a Gessica é uma IA e de que a ligação pode ser gravada, base do
  consentimento detectado por `detectRecordingConsent`/`detectRecordingConsentFromRawTranscript`
  (`birthVoice.helpers.ts`) e consumido pela ponte para o Copiloto Comercial IA (Onda 7, item 2 —
  `src/shared/contracts/copilotoVoiceIngestion.contract.ts`, implementada em
  `copiloto-ia/infra/CopilotoVoiceIngestionAdapter.ts`). Sem essa abertura, toda ligação cai em
  consentimento `PENDING` e o conteúdo nunca é processado pelo Copiloto — decisão estrutural, não
  bug.

## Coordenação
- Schema -> 01. Navegação -> 02. IA -> 07. Deploy -> 08.

## Definição de pronto local
- health/status, retry, erros, Bitrix e voz têm testes e observabilidade.

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- testes relevantes ao domínio
- `npm run build`

Não registrar sucesso sem executar o teste correspondente.
