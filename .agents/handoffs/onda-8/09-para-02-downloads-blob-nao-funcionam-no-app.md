- De: Agente 09 (Mobile — Capacitor/Android/iOS)
- Para: Agente 02 (Produto e UX)
- Onda: 8
- Status: aberto
- Prioridade: alto

## Problema

Vários componentes exportam arquivo gerado no cliente (CSV/XLSX/texto) via `URL.createObjectURL`
de um `Blob` + um `<a download>` sintético (padrão comum de "exportar" no navegador):
`src/components/CrmBoard.tsx`, `src/features/intelligence/components/AutomationGuide.tsx`,
`src/features/intelligence/components/RobustScriptGenerator.tsx`,
`src/features/intelligence/components/SuperagentCreator.tsx`,
`src/features/prospecting/components/ProspectingHub.tsx`.

Verifiquei o código-fonte do `BridgeWebViewClient`/`Bridge` do Capacitor Android
(`node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/`) — nenhum
`WebView.setDownloadListener(...)` é configurado por padrão. Isso tem duas consequências:

1. Para downloads via URL http(s) normal, o WebView chamaria `DownloadListener.onDownloadStart`,
   mas sem um listener registrado, **o clique simplesmente não faz nada visível** (nem erro, nem
   download).
2. Para o padrão usado neste projeto (`blob:` URL gerada inteiramente no JS, sem round-trip de
   rede), a situação é pior: um `DownloadListener` nativo nem teria acesso ao conteúdo do blob —
   ele vive só na realm JS do WebView. Não existe caminho nativo simples de interceptar isso sem
   uma ponte JS↔nativo explícita.

Ou seja: hoje, tocar em "Exportar CSV"/"Exportar" nessas telas dentro do app Android/iOS
empacotado muito provavelmente não produz nenhum arquivo e não mostra nenhum erro ao usuário — o
botão parece funcionar (não trava, não quebra a tela) mas silenciosamente não entrega o arquivo.
Não confirmei isso num dispositivo real (ambiente sem SDK Android/Xcode disponível nesta sessão —
ver relatório da onda), mas o comportamento é bem documentado para Capacitor/WebView em geral e a
ausência de `DownloadListener` no bridge confirma a lacuna estruturalmente.

## Arquivo(s) envolvido(s)

- `src/components/CrmBoard.tsx`
- `src/features/intelligence/components/AutomationGuide.tsx`
- `src/features/intelligence/components/RobustScriptGenerator.tsx`
- `src/features/intelligence/components/SuperagentCreator.tsx`
- `src/features/prospecting/components/ProspectingHub.tsx`
- `package.json` (plugins novos precisariam de aprovação do Coordenador)

## Alteração necessária

Não implementável dentro do escopo do Agente 09 sozinho — a geração do Blob e o gatilho de download
moram em `src/**`. Caminho recomendado (padrão oficial Capacitor para esse cenário):

1. Instalar `@capacitor/filesystem` (grava o conteúdo do Blob, convertido para base64, num
   diretório acessível do app) + `@capacitor/share` (abre a folha de compartilhamento nativa, que
   no Android/iOS inclui "salvar em Arquivos"/"salvar no Drive"/etc.) — ambos exigem aprovação do
   Coordenador para `package.json`.
2. Nos componentes listados acima, detectar `Capacitor.isNativePlatform()` e, nesse caso, usar
   `Filesystem.writeFile` + `Share.share` em vez do padrão `URL.createObjectURL` + `<a download>`
   — sem duplicar a lógica de geração do CSV/XLSX em si (a função que monta o conteúdo continua
   igual), só o mecanismo de entrega ao usuário.
3. Dentro do escopo do Agente 09: uma vez que esse plugin for aprovado e o código em `src/**`
   existir, adiciono a configuração nativa necessária (permissões de storage se aplicável — no
   Android moderno, `@capacitor/filesystem` usando o diretório do próprio app normalmente não
   precisa de `WRITE_EXTERNAL_STORAGE`, mas isso deve ser confirmado na implementação real).

## Teste esperado

Dentro do app Android/iOS empacotado, tocar em "Exportar" nessas telas deve produzir um arquivo
real acessível pelo usuário (via folha de compartilhamento nativa ou app de arquivos) — hoje, o
clique não produz nada visível.

## Contexto adicional

Achado durante o inventário de paridade web × mobile da Onda 8, ao ler o código-fonte do bridge
Android do Capacitor (`@capacitor/android@8.5.0`, instalado via `npm ci` nesta sessão) em busca de
tratamento de download. Documentado aqui em vez de implementado às pressas com uma ponte
JS↔nativo improvisada, que eu não teria como validar num dispositivo real nesta sessão (sem SDK
Android/Xcode disponíveis) — risco de "parecer que funciona" sem funcionar de fato, o que o prompt
do Agente 09 proíbe explicitamente.
