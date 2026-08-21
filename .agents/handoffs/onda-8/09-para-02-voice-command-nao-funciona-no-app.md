- De: Agente 09 (Mobile — Capacitor/Android/iOS)
- Para: Agente 02 (Produto e UX)
- Onda: 8
- Status: resolvido
- Prioridade: alto

## Problema

`src/components/ui/VoiceCommandWidget.tsx` (comando de voz, presente em `MainLayout`, visível em
toda tela autenticada) depende inteiramente da Web Speech API do navegador
(`window.SpeechRecognition || window.webkitSpeechRecognition`, linha 20). Essa API **não é
implementada pelo WebView do Android nem pelo `WKWebView` do iOS** — é um recurso só de navegador
completo (Chrome/Safari "de verdade"), documentado como não suportado no Chromium WebView usado
por apps empacotados. Não existe workaround via CSS/JS puro: sem um plugin nativo, o construtor
simplesmente não existe nesse ambiente.

O código já trata a ausência de forma segura — `toggleListening()` mostra
`alert('Seu navegador não suporta reconhecimento de voz...')` quando `recognition` é `null` — então
isso **não é** uma repetição do bloqueador #7 (não afirma sucesso sem navegar); é uma feature
inteira que fica invisível/inoperante dentro do app empacotado, sem nenhuma indicação de que existe
um caminho para funcionar lá.

## Arquivo(s) envolvido(s)

- `src/components/ui/VoiceCommandWidget.tsx`
- `src/types/speech-recognition.d.ts` (tipos ambient da Web Speech API)
- `package.json` (plugin novo precisaria de aprovação do Coordenador — ver abaixo)

## Alteração necessária

Não implementável dentro do escopo do Agente 09 (`android/**`/`capacitor.config.ts`/`ios/**`
sozinhos) porque a lógica de reconhecimento de voz mora em `src/**`. Caminho recomendado:

1. Instalar `@capacitor-community/speech-recognition` (plugin real que usa `SFSpeechRecognizer`
   no iOS e `SpeechRecognizer` nativo no Android) — requer aprovação explícita do Coordenador para
   `package.json` (`AGENTS.md`: "package.json e lockfile: alteração exige aprovação explícita do
   Agente 00").
2. Em `VoiceCommandWidget.tsx`, detectar `Capacitor.isNativePlatform()` (já disponível via
   `@capacitor/core`, que já é dependência do projeto) e usar o plugin nativo nesse caso, mantendo
   a Web Speech API como caminho para a versão web/desktop — sem duplicar a lógica de interpretação
   de comando (`textLower.includes(...)`/`navigateOrReportFailure`), só a fonte do texto
   transcrito.
3. No Android, o plugin declara `RECORD_AUDIO` no manifest dele — dentro do escopo do Agente 09,
   caso o plugin seja aprovado, a declaração de permissão em
   `android/app/src/main/AndroidManifest.xml` (ou a que o plugin injeta via merge) só se torna
   "permissão sem uso funcional" (proibida pelo `AGENTS.md` do Agente 09) se este item não for
   implementado — ou seja, a permissão só pode ser declarada junto com o código funcional que a
   usa, não antes.

## Teste esperado

Dentro do app Android/iOS empacotado (não no navegador), tocar no botão de microfone deve realmente
capturar áudio e transcrever, disparando os mesmos comandos já mapeados (CRM, Prospector,
Inteligência, Contatos, Empresas, troca de marca) — hoje, no app empacotado, o botão sempre mostra
o alerta de "não suportado".

## Contexto adicional

Confirmado durante o inventário de paridade web × mobile da Onda 8. `alert()` nativo do WebView
funciona (não é o problema), mas o recurso anunciado na UI ("Comando por Voz") simplesmente não
existe hoje dentro do app empacotado — trata-se de paridade real quebrada por limitação de
plataforma, documentada aqui em vez de fingir suporte (regra do prompt do Agente 09,
`.agents/prompts/09-mobile.md`: "não implementar workaround que finge suportar um recurso sem de
fato funcionar no dispositivo").

## Resolução
(Coordenador): O comportamento está documentado e mapeado como limitação do WebView em iOS/Android. Adicionar \@capacitor-community/speech-recognition\ e as permissões pertinentes se enquadra como nova Feature de Paridade Mobile. Em respeito ao Freeze de escopo (RC1 Go-Live), não faremos a injeção do plugin agora. Fica resolvido (postponed para Sprint pós-13).
