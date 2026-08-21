- De: Agente 09 (Mobile — Capacitor/Android/iOS)
- Para: Agente 08 (QA e Release) / Agente 10 (Infraestrutura, Observabilidade e SRE)
- Onda: 8
- Status: resolvido
- Prioridade: normal

## Observação de Go-Live (Onda 38)
Rebaixado de 'bloqueador' para 'normal' por aprovação do usuário. O aplicativo funciona sobre o hostname do Render. O Universal/App Link será configurado pós-release quando o DNS propagar.

## Problema

Achei e corrigi um bug crítico em `capacitor.config.ts` (meu escopo exclusivo): o bloco `server`
(que faz o WebView do app empacotado carregar a aplicação a partir do backend real, em vez de só um
bundle estático sem API) tinha sido apagado por engano num commit anterior
(`5b06b80d`, "feat(09): configure capacitor for android and ios wrapper") — os comentários e
constantes ao redor ficaram, mas o campo `server` do objeto de config sumiu. Resultado: o app
Android/iOS empacotado carregava só HTML/JS estático a partir de `https://localhost` (esquema
padrão do Capacitor), origem sem nenhum backend — **toda chamada de API relativa
(`fetch('/api/...')` em `src/lib/api.ts`) falhava**. Ou seja: o app abria, mas nenhuma tela que
depende de dado (dashboard, CRM, prospecção, Hub de IA, tudo) funcionava. Restaurei o bloco nesta
onda.

Ao escolher o valor default de `PRODUCTION_URL`, testei os dois domínios candidatos:

```
curl https://app.atlasgr.com.br/health/live      → não resolve DNS (domínio final, ver
                                                     docs/deploy/producao.md §3, ainda não está no ar)
curl https://prospector-atlas.onrender.com/health/live → 200 { status: "ok" } (backend real, ativo)
```

Usei `https://prospector-atlas.onrender.com` como default (documentado em
`docs/deploy/producao.md` §8 como o fallback "até lá"). Isso deixa o app mobile **funcional hoje**,
mas cria uma dependência de coordenação: quando `app.atlasgr.com.br` entrar no ar (Cloudflare
DNS + certificado, `docs/deploy/producao.md` §3), alguém precisa:

1. Atualizar `PRODUCTION_URL` em `capacitor.config.ts` (meu escopo — eu faço, mas preciso ser
   avisado quando o domínio estiver ativo);
2. Atualizar os hosts espelhados no Android App Link
   (`android/app/src/main/AndroidManifest.xml`, `data android:host=`) e no deep link
   nativo (`SERVER_URL` em `MainActivity.java`/`SceneDelegate.swift`) — mesmo escopo, mesma
   dependência;
3. Rodar `npx cap sync android`/`npx cap sync ios` de novo e gerar um novo build de release.

## Arquivo(s) envolvido(s)

- `capacitor.config.ts` (meu escopo, já corrigido nesta onda)
- `docs/deploy/producao.md` (domínio/infra, escopo de 08/18)
- Infra de DNS/Cloudflare (fora de qualquer repositório, escopo operacional de 10)

## Alteração necessária

1. **Confirmar prioridade de release**: o app mobile, do jeito que está agora (apontando pro
   hostname direto do Render), já é funcional para uso real — não é preciso esperar o domínio
   final para o app funcionar, só para o Android App Link ficar "verificado" (ver item 2).
2. **Android App Link / iOS Universal Link verificados de verdade** (não implementado nesta onda,
   documentado como próximo passo): exige publicar `/.well-known/assetlinks.json` (Android,
   assinado com o SHA-256 do keystore de release) e `/.well-known/apple-app-site-association`
   (iOS) no domínio de produção — isso é servido pelo backend/CDN (`server.ts`/Cloudflare), fora
   do meu escopo (`android/**`/`ios/**`/`capacitor.config.ts`). Sem esses dois arquivos, os
   intent-filters `autoVerify="true"` que adicionei em
   `android/app/src/main/AndroidManifest.xml` continuam funcionando como link comum (o Android
   mostra o seletor "abrir com" na primeira vez), só não pulam direto pro app.
3. Me avisar (handoff de volta) quando (a) `app.atlasgr.com.br` estiver resolvendo e servindo a
   aplicação, e (b) o keystore de release para gerar o SHA-256 do `assetlinks.json` existir — para
   eu atualizar os 3 arquivos listados acima.

## Teste esperado

- `curl https://app.atlasgr.com.br/health/live` retornando `200` confirma que o domínio final está
  pronto para eu migrar `capacitor.config.ts`.
- Depois de publicado `assetlinks.json`, `https://app.atlasgr.com.br/app/crm` aberto em qualquer
  app (WhatsApp, e-mail, navegador) deve abrir direto o AtlasGR Prospector na tela de CRM, sem
  seletor de app.

## Contexto adicional

Este handoff também serve de evidência para o item "resultado real do build" do meu relatório da
Onda 8: o ambiente de execução desta sessão não tem JDK/Android SDK nem Xcode instalados (Windows,
sem Docker Desktop disponível nesta onda) — não consegui rodar `./gradlew assembleDebug` nem build
iOS real. Validei estaticamente: `npx tsc --noEmit`, `npm run lint`, `npm run build` e `npx cap
sync android` (que valida `capacitor.config.ts` e gera `android/app/src/main/assets/
capacitor.config.json` corretamente, confirmado manualmente) passaram limpos. Recomendo que 08
rode o build Android real (`android-build.yml` já existe e roda `./gradlew assembleDebug` em CI —
`.github/workflows/android-build.yml`, meu escopo não inclui editar esse workflow) num push desta
branch para confirmar compilação real antes do go-live.

## Resolução
O usuário já aprovou a utilização do domínio Render como fallback imediato para manter o app vivo. A configuração final de DNS, manifestos de assinatura e Universal Links será efetuada no processo operacional do deploy.
