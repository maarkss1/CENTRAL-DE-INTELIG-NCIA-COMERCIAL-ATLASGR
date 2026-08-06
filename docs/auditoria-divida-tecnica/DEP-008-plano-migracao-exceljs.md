# DEP-008 — Plano de migração `xlsx` → `exceljs`

## Por quê

`xlsx` (SheetJS, `^0.18.5`) tem duas CVEs de severidade alta sem correção publicada pelo mantenedor
na branch do npm:

- **Prototype Pollution** — [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6)
- **ReDoS (Regular Expression Denial of Service)** — [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9)

`npm audit` confirma: `fix available` não existe para nenhuma delas — só existem versões que o registry npm
não distribui (o SheetJS parou de publicar patches no npm depois da v0.18.5, movendo o desenvolvimento
para o próprio site deles). Não dá pra "esperar o fix" — a correção real é trocar de biblioteca.

## Escopo real (levantado em 2026-08-06)

Só existe **um único ponto de uso** de `xlsx` em todo o repositório:

- [`src/features/prospecting/components/ProspectingHub.tsx:244-264`](../../src/features/prospecting/components/ProspectingHub.tsx) —
  função `exportToExcel`, que gera e baixa uma planilha `.xlsx` com a lista de prospects
  encontrados (nome, razão social, CNPJ, telefone, e-mail, LinkedIn, decisores).

`xlsx` é carregado via `import('xlsx')` dinâmico (code-split, só entra no bundle quando o botão de
exportar é clicado) — hoje esse chunk pesa **429,53 kB minificado** (~143 kB gzip), o maior chunk
"de terceiros" do build depois de `vendor-react`.

Nenhum outro arquivo (frontend ou backend) importa `xlsx`, direta ou indiretamente — não há parsing
de planilhas enviadas por usuário nem geração de relatório no servidor usando essa lib. O raio de
impacto da migração é **um componente, uma função**.

## Comparação de API (o que muda)

| Operação | `xlsx` (atual) | `exceljs` (alvo) |
|---|---|---|
| Criar workbook | `XLSX.utils.book_new()` | `new ExcelJS.Workbook()` |
| Criar planilha a partir de array de objetos | `XLSX.utils.json_to_sheet(data)` | `worksheet.columns = [...]` + `worksheet.addRows(data)` |
| Anexar planilha ao workbook | `XLSX.utils.book_append_sheet(wb, ws, nome)` | `workbook.addWorksheet(nome)` (a planilha já nasce anexada) |
| Gerar e baixar arquivo no navegador | `XLSX.writeFile(wb, nome)` (detecta browser sozinho e dispara o download) | `await workbook.xlsx.writeBuffer()` → `new Blob([...])` → `URL.createObjectURL` + `<a download>` (exceljs não tem equivalente a `writeFile` no navegador; precisa desses ~6 linhas de glue) |

## Passos

1. `npm install exceljs` (e `npm uninstall xlsx` ao final, depois de validar).
2. Em `ProspectingHub.tsx`, trocar `exportToExcel` pela versão baseada em `ExcelJS.Workbook` +
   `writeBuffer()` + download via Blob (ver tabela acima).
3. Conferir manualmente no navegador: clicar em "Exportar" na tela de Prospecção com uma lista de
   candidatos carregada, confirmar que o `.xlsx` baixado abre no Excel/LibreOffice/Google Sheets com
   as mesmas 8 colunas e os mesmos dados de hoje (nome, razão social, CNPJ, telefone, e-mail,
   endereço, LinkedIn, decisores).
4. Comparar o tamanho do chunk gerado (`npm run build`, olhar `dist/assets/*.js` — hoje
   `xlsx-*.js` = 429,53 kB) — `exceljs` tende a ser um pouco maior por padrão (suporta estilos,
   imagens, fórmulas), então vale checar se compensa importar só o necessário ou aceitar o
   aumento em troca de eliminar as duas CVEs sem fix.
5. Rodar `npm audit` e confirmar que as duas CVEs do xlsx desaparecem da lista.
6. Remover `xlsx` de `package.json`/`package-lock.json` depois que `exceljs` estiver em produção
   por um tempo razoável (não no mesmo PR, para poder reverter rápido se o Excel exportado por
   `exceljs` tiver alguma incompatibilidade sutil de formato que só apareça em uso real).

## Por que isto ficou como plano, não como execução nesta sessão

Trocar a implementação exige validar visualmente que o arquivo baixado abre corretamente numa
planilha real (Excel/Sheets) — o tipo de verificação que precisa de um navegador com o app rodando
e dados de prospecção carregados, não só `tsc`/`vitest`. Fica registrado aqui como próximo passo
imediato e de escopo pequeno (proporção 1 componente : 1 função, ao contrário da estimativa original
de Esforço L, que não sabia ainda que o uso era tão concentrado).
