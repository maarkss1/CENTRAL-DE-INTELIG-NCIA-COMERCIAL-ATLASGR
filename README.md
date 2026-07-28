# PROSPECTOR-ATLAS

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
Variáveis requeridas:
- `GEMINI_API_KEY`: Chave de API para as funções de IA.
- `DATABASE_URL`: URL do banco PostgreSQL (Para o Prisma).

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
