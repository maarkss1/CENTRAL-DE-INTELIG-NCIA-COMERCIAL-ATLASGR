- De: 10
- Para: 00
- Onda: 13
- Status: aberto
- Prioridade: bloqueador
## Problema
Integração de telemetria necessita ser iniciada no primeiro momento de execução do servidor.

## Arquivo(s) envolvido(s)
server.ts

## Alteração necessária
Adicionar a seguinte importação como a PRIMEIRA linha do arquivo:
import './lib/telemetry/otel';

## Teste esperado
A aplicação deve compilar e os logs de telemetria devem iniciar sem falhas no boot.

## Contexto adicional
Conforme as regras do repositório, o Agente 10 não pode editar server.ts diretamente. O import do otel precisa ser a primeira coisa a rodar.
