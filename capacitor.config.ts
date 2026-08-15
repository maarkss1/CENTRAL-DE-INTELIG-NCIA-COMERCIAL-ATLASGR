import type { CapacitorConfig } from '@capacitor/cli';

// server.url faz o WebView carregar a aplicação diretamente do backend, em vez de servir só o
// bundle estático empacotado em `dist` (webDir). Isso é proposital, não um placeholder: a
// arquitetura de produção (docs/deploy/producao.md) é um monólito único no Render que serve API +
// frontend Vite no mesmo domínio. Com server.url apontando pra esse domínio, as chamadas relativas
// de src/lib/api.ts (`fetch('/api/...')`) e src/lib/auth-client.ts (`window.location.origin`)
// resolvem contra a própria origem carregada — sem precisar embutir uma VITE_API_URL absoluta no
// build nem lidar com CORS entre origens diferentes.
//
// ACHADO (Onda 8, Agente 09): este bloco `server` existia antes e foi apagado por engano no commit
// 5b06b80d ("feat(09): configure capacitor for android and ios wrapper"), que deixou as constantes
// e os comentários acima intactos mas removeu o campo `server` do objeto de config — o app
// empacotado carregava só o HTML/JS estático de `dist` a partir de `https://localhost` (esquema
// padrão do Capacitor no Android), origem onde não existe nenhum backend rodando. Resultado: todo
// fetch relativo (`/api/...`) ia para `https://localhost/api/...` e falhava — o app abria, mas
// nenhuma tela que depende de dados (dashboard, CRM, prospecção, Hub de IA etc.) funcionava.
// Restaurado aqui, com o domínio de produção real confirmado nesta onda (ver comentário abaixo).
//
// `app.atlasgr.com.br` (domínio final, usado em render.yaml/docs/deploy/producao.md como
// ALLOWED_ORIGINS/BETTER_AUTH_URL/PUBLIC_BASE_URL) ainda não resolve DNS — verificado nesta onda
// (`curl https://app.atlasgr.com.br` não conecta). O fallback documentado em
// docs/deploy/producao.md §8 ("até lá") é o hostname direto do Render, que respondeu 200 em
// /health/live nesta onda: usado como default abaixo. Troque para `https://app.atlasgr.com.br`
// (e rode `npx cap sync android`/`npx cap sync ios` de novo) assim que o domínio Cloudflare
// estiver ativo — ver docs/deploy/producao.md §3. Handoff aberto para 08/10 confirmando isso.
//
// Para apontar para um backend de desenvolvimento local (mesma rede Wi-Fi/LAN) durante testes no
// celular, exporte CAPACITOR_SERVER_URL=http://<ip-da-sua-maquina>:3005 antes de `npx cap sync
// android`. cleartext HTTP só liga automaticamente quando a URL não é https (IS_LOCAL_TEST_URL) —
// e mesmo assim só afeta build de debug, já que o manifest de release não declara
// usesCleartextTraffic (ver android/app/src/main/AndroidManifest.xml e
// android/app/src/debug/AndroidManifest.xml).
const PRODUCTION_URL = process.env.CAPACITOR_SERVER_URL || 'https://prospector-atlas.onrender.com';
const IS_LOCAL_TEST_URL = PRODUCTION_URL.startsWith('http://');

const config: CapacitorConfig = {
  appId: 'br.com.atlasgr.prospector',
  appName: 'AtlasGR Prospector',
  webDir: 'dist',
  server: {
    url: PRODUCTION_URL,
    cleartext: IS_LOCAL_TEST_URL,
    // Esquema custom de deep link (ver android/app/src/main/AndroidManifest.xml e
    // ios/App/App/Info.plist) — precisa estar em allowNavigation só se o link apontar pra um host
    // diferente do PRODUCTION_URL; como o deep link é resolvido nativamente (MainActivity.java /
    // SceneDelegate.swift) e só recarrega o WebView com uma URL do próprio PRODUCTION_URL, não é
    // necessário adicionar `atlasgr://` aqui.
  },
};

export default config;
