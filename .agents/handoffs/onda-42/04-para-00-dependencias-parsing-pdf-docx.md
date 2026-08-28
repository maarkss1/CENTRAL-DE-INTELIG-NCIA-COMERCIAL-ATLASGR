- De: 04
- Para: 00
- Onda: 42
- Status: aberto
- Prioridade: bloqueador

## Problema

Dossiê CPI, DEC-10 (opção A): a Base de Conhecimento passa a suportar upload real de `.pdf`
(extração de texto). O código em `src/features/knowledge/knowledge.routes.ts` já importa
`pdf-parse` estaticamente e o pipeline de ingestão já está plugado (ver seção "Alteração
necessária" abaixo), mas `pdf-parse` **não está no `package.json`/lockfile**. Sem a dependência
instalada, `npm ci` num checkout limpo (e o build/CI) quebra com `Cannot find module 'pdf-parse'`.

`.docx` **já** era suportado antes desta onda — `mammoth@^1.12.0` já existe no `package.json` e não
precisa de nenhuma mudança. Este handoff é só sobre PDF.

## Arquivo(s) envolvido(s)

- `package.json` (dependency)
- `package-lock.json` (lockfile — não editado manualmente; deve ser regenerado por `npm install`)

## Alteração necessária

Adicionar como dependency (não devDependency — é usado em runtime, na rota de upload):

```json
"pdf-parse": "^1.1.4"
```

Comando sugerido (roda `npm install` e atualiza o lockfile automaticamente):

```bash
npm install pdf-parse@^1.1.4
```

Nenhum `@types/pdf-parse` é necessário: o repositório já tem `strict` moderado o bastante e o
código em `knowledge.routes.ts` só usa a forma `pdfParse(buffer, { max })` retornando
`{ text, numpages, ... }` — mas caso o `tsc` reclame de tipos implícitos ao instalar (a versão 1.x
do pacote não embute `.d.ts`), adicionar também:

```json
"@types/pdf-parse": "^1.1.5"
```

como devDependency (`npm install -D @types/pdf-parse@^1.1.5`).

### Por que `pdf-parse@1.x` e não a v2 (mais recente, `2.4.5`)

Avaliei as duas antes de escolher:

- **`pdf-parse` 2.x** é uma reescrita completa: depende de `pdfjs-dist@5.x` **e** de
  `@napi-rs/canvas` (binding nativo, com binários pré-compilados por plataforma/arch). Isso
  introduz risco real de instalação neste projeto — Docker multi-stage (`Dockerfile`), Android via
  Capacitor no mesmo monorepo, `engines` exigindo Node `>=20.16.0 <21 || >=22.3.0` (o `.nvmrc` deste
  repo fixa Node `20`, ponto — sem o patch mínimo `20.16` garantido) — para um caso de uso que é só
  "extrair texto de PDF", sem necessidade de renderizar página como imagem/canvas.
- **`pdf-parse` 1.x** (mantido até `1.1.4`, lançado em 2025-10-29 — não é um pacote abandonado)
  é puro JS, depende só de `node-ensure` (nenhum binário nativo), e expõe exatamente a API que o
  código já assume: `pdfParse(buffer, { max: N }) => Promise<{ text, numpages, info, metadata }>`.
  Mesmo perfil de risco que `mammoth` (já presente e puro JS). É a escolha certa para este caso de
  uso e este ambiente de build.

Se no futuro o produto precisar de algo que a v1 não oferece (ex.: render de página como
imagem/thumbnail), isso é uma decisão nova, com trade-off de binário nativo reavaliado então — não
um upgrade "de manutenção" desta dependência.

### Por que nenhuma dependência já existente resolve isso

Nenhuma lib já presente no projeto faz parsing de PDF/DOCX — são todas fora desse domínio:
`framer-motion` (animação), `recharts` (gráficos), `lucide-react` (ícones), `@dnd-kit`
(drag-and-drop), `three`/`@react-three/fiber` (3D), `zod` (validação), `mammoth` (só DOCX, já
presente e sem sobreposição com PDF), Prisma/pgvector (banco). Nenhuma faz extração de texto de
PDF. `pdf-parse` é a única adição real necessária.

### Por que não `.doc` (binário legado)

Deliberadamente fora de escopo desta mudança — ver o comentário em `extractText()` em
`knowledge.routes.ts` e em `ACCEPTED_EXTENSIONS` (`src/features/knowledge/knowledge.api.ts`).
Resumo: parsers Node maduros para `.doc` binário (pré-Office 2007, formato OLE Compound File) são
raros e normalmente exigem `child_process` para `antiword`/LibreOffice ou bindings nativos — custo
de infraestrutura desproporcional para um formato incomum em upload B2B moderno (a esmagadora
maioria dos uploads reais já é `.docx`). Se aparecer demanda real por `.doc`, é uma decisão nova a
ser tomada com o usuário, não uma correção deste handoff.

## Teste esperado

Depois de `npm install pdf-parse@^1.1.4` (e possivelmente `@types/pdf-parse` — ver acima):

```bash
npx tsc --noEmit
npm run lint
npm run test:unit -- tests/unit/features/knowledge
```

Os três devem passar limpos. Os testes novos desta onda
(`tests/unit/features/knowledge/knowledge.routes.extractText.test.ts`) mockam `pdf-parse` e
`mammoth`, então não dependem de rede/binário nenhum — só de o pacote estar resolvível pelo
`node_modules`.

## Contexto adicional

Nesta sessão (worktree isolado, sem push), rodei `npm install pdf-parse@^1.1.4
@types/pdf-parse@^1.1.5` localmente só para validar `tsc`/lint/test antes de entregar — e depois
revertei `package.json`/`package-lock.json` (`git checkout -- package.json package-lock.json`)
porque esses dois arquivos são de dono único (Agente 00), conforme instrução da tarefa. O
`node_modules` local deste worktree ficou com o pacote fisicamente instalado (não versionado,
`.gitignore` já cobre `node_modules/`), então a validação relatada no resumo desta tarefa é real,
mas o `package.json`/lockfile do commit **não** carrega a dependência — só este handoff a
documenta. Um `npm ci` limpo a partir do commit desta onda volta a falhar até este handoff ser
resolvido.

## Resolução
(preenchido pelo agente 00 ao resolver)
