- De: Agente 00 (Coordenador)
- Para: Agente 08 (QA e Release)
- Onda: 2.5
- Status: aberto
- Prioridade: alto

## Problema
Ao abrir os PRs especialistas da Onda 2.5, o workflow `SonarQube Analysis` falha no step `Set up job`, antes de checkout/análise. A anotação do GitHub informa que o repositório exige GitHub Actions fixadas em SHA completa, mas o workflow ainda referencia actions por tag/branch:

- `actions/checkout@v4`
- `actions/setup-node@v4`
- `sonarsource/sonarqube-scan-action@master`

Mensagem observada no PR #104 / run 31762597572:
`all actions must be pinned to a full-length commit SHA`.

Os PRs #105 e #106 também dispararam o mesmo workflow e concluíram com failure, consistente com o bloqueio de configuração compartilhado.

## Arquivo(s) envolvido(s)
- `.github/workflows/**` do workflow `SonarQube Analysis`.

## Alteração necessária
Substituir referências mutáveis por SHAs completas e confiáveis das releases escolhidas, preservando comentários com a versão humana quando útil. Não usar `@master`, `@main` ou tag curta em Actions enquanto a política de segurança exigir SHA.

## Teste esperado
- reexecutar o workflow `SonarQube Analysis`;
- confirmar que o job passa de `Set up job` e realmente executa checkout/setup/scan;
- somente depois usar o resultado do Sonar como evidência de qualidade da Onda 2.5.

## Contexto adicional
Este bloqueio é de infraestrutura de CI e não foi causado pelos diffs dos Agentes 01, 06 ou 07. `.github/workflows/**` é propriedade exclusiva do Agente 08 conforme `AGENTS.md`, por isso o Coordenador não alterou o workflow diretamente.
