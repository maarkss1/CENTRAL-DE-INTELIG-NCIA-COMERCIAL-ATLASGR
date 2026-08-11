- De: 10
- Para: 08
- Onda: E
- Status: aberto
- Prioridade: alto
## Problema
Foi solicitada a refatoração do Dockerfile de produção para ser seguro e leve, porém, de acordo com o AGENTS.md, a edição do Dockerfile na raiz é de propriedade exclusiva do Agente 08.
## Arquivo(s) envolvido(s)
Dockerfile
## Alteração necessária
Refatorar o Dockerfile de produção para garantir segurança (ex: rodar como non-root, remover pacotes desnecessários) e torná-lo mais leve (utilizando multi-stage build).
## Teste esperado
O build do Dockerfile ocorre com sucesso e a imagem final é reduzida, passando nos testes de linting e segurança.
## Contexto adicional
Solicitação da missão "Wave E (Empacotamento e Nuvem)".
