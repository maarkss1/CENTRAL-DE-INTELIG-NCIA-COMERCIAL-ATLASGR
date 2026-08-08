# PROSPECTOR-ATLAS

> Operação autônoma: consulte [AUTONOMIA_COMERCIAL_24X7.md](./AUTONOMIA_COMERCIAL_24X7.md) para ativação, políticas, gatilhos e observabilidade de SDR/BDR/Closer.

Prospector-Atlas é uma plataforma de inteligência logística focada em prospecção e gestão de leads no setor B2B, atuando como um CRM inteligente impulsionado por IA.

## Estrutura da Aplicação
O repositório foi reestruturado para ser modular, escalável e de fácil manutenção, preparando a base para o desenvolvimento das próximas fases.

A estrutura atual conta com:
- `src/components`: Componentes reutilizáveis de interface (`ui` e `layout`).
- `src/features`: Módulos da aplicação (ex: CRM, Prospector).
- `src/hooks`: Custom hooks.
- `src/lib`: Bibliotecas e integrações de terceiros (como o cliente do Prisma).
- `src/services`: Camada de serviços (ex: chamadas de API).
- `src/types`: Definições de tipagem e interfaces TypeScript.
- `src/utils`: Funções utilitárias globais (ex: formatadores, classes de Erro).
- `src/styles`: Arquivos de estilos globais.

## Tecnologias e Configuração
- React 19 + Vite 6
- Tailwind CSS v4 para estilização com classes utilitárias
- Prisma 7.8 com adapter `PrismaPg` via driver `pg` para melhor pooling e resiliência
- Express para API local e fallback SSR/SPA.
- ESLint (Flat Config) e Prettier para padronização.
- Vitest para testes de unidade e integração
- Github Actions configurado para CI (Type Check, Lint, e Build).

## Instalação

```bash
npm install
```

## Execução

Execute o servidor de desenvolvimento:
```bash
npm run dev
```

## Variáveis de Ambiente
Crie um arquivo `.env` na raiz do projeto com base no `.env.example`.
Variáveis principais:
- `DATABASE_URL`: URL do banco PostgreSQL (Prisma).
- `GROQ_API_KEY`: contingência direta dos motores de texto quando o LiteLLM estiver indisponível.
- `LITELLM_URL` e `LITELLM_KEY`: gateway principal para roteamento dos modelos.
- `GEMINI_API_KEY`: opcional, usada pelo caminho legado de embeddings Gemini.
- `PROSPECTING_PROVIDER_MODE`: use `hybrid` para liberar provedores pagos configurados por chave.
- `GOOGLE_MAPS_API_KEY`, `APOLLO_API_KEY` e `HUNTER_API_KEY`: chaves de prospecção usadas somente quando o modo está em `hybrid`.
- `BITRIX24_WEBHOOK_URL`: webhook de entrada do Bitrix24 usado como conexão padrão quando não houver conexão salva.
- `AI_GATEWAY_TIMEOUT_MS`, `AI_FALLBACK_TIMEOUT_MS` e `AI_EMBEDDING_TIMEOUT_MS`: limites configuráveis das solicitações de IA.

## Deploy no Render

O blueprint `render.yaml` declara o serviço web, o banco PostgreSQL e as variáveis necessárias para produção. Valores sensíveis ficam com `sync: false` e devem ser preenchidos diretamente no dashboard do Render. Consulte `docs/deploy/render.md` para o checklist das chaves Apollo, Google Maps/Places, Hunter, Groq e Bitrix24.

## Scripts Disponíveis
- `npm run dev`: Inicia o servidor backend (que injeta o Vite para HMR/middleware).
- `npm run build`: Compila tanto a parte de client (Vite) quanto o server (esbuild).
- `npm run lint`: Roda o ESLint validando toda a pasta `src/`.
- `npm run start`: Inicia o servidor compilado.

## Convenções Adotadas
- Imports utilizando paths relativos/alias padronizados.
- Tipagens fortes usando TypeScript estrito.
- Tratamento de erro global implementado em `server.ts` e classes em `src/utils`.
Para a documentação completa, consulte o [Índice da Documentação](docs/README.md).
