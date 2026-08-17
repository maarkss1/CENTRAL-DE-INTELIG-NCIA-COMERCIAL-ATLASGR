package br.com.atlasgr.prospector;

import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Resolve deep links (esquema custom "atlasgr://<destino>" e Android App Link
 * "https://<host>/app/<destino>", ver AndroidManifest.xml) traduzindo o destino recebido pra uma
 * navegação real dentro do WebView que o Capacitor já carregou (server.url, ver
 * capacitor.config.ts).
 *
 * Não duplica lógica de negócio: só decide "qual URL carregar no WebView". Quem decide o que cada
 * tela faz continua sendo o React Router (src/App.tsx) — a mesma URL que este código monta aqui é
 * a mesma que o menu lateral e o comando de voz já navegam dentro do app (ver
 * src/lib/navigationBus.ts, contrato de navegação do Agente 02).
 *
 * VALID_TABS espelha manualmente TAB_ROUTE_SET de src/lib/navigationBus.ts — TypeScript não expõe
 * esse union type em runtime pra um consumidor nativo Java ler, então a lista precisa ser mantida
 * sincronizada à mão entre os dois arquivos. Handoff aberto pro Agente 02 (Onda 8) sugerindo expor
 * essa lista como um JSON gerado no build (ex.: public/valid-tabs.json) pra eliminar essa
 * duplicação manual nas próximas ondas.
 *
 * ACHADO relacionado (fora do escopo deste agente, handoff aberto pro Agente 02): dois valores de
 * TAB_ROUTE_SET ("enrich" e "prompts") não têm nenhuma <Route> correspondente em src/App.tsx — uma
 * navegação real pra esses destinos (via menu, comando de voz OU este deep link) bate no
 * <Route path="*" element={<Navigate to="/app" replace />}> de App.tsx e volta pro dashboard
 * silenciosamente. Este código não tenta contornar esse bug removendo os dois da lista — a lista
 * aqui é o contrato oficial de navegação, e divergir dela silenciosamente esconderia o problema em
 * vez de expor pro dono certo corrigir.
 */
public class MainActivity extends BridgeActivity {

    // Espelha o valor default de PRODUCTION_URL em capacitor.config.ts — mantenha os dois em
    // sincronia ao trocar de domínio (ex.: quando app.atlasgr.com.br entrar no ar, ver comentário
    // lá). Se o build usou CAPACITOR_SERVER_URL para apontar pra outro host (teste local/LAN), um
    // deep link recebido nesse build específico vai montar a URL contra este host de produção em
    // vez do host de teste — não afeta o carregamento normal do WebView (que sempre usa o
    // server.url real do build), só o destino calculado por um deep link recebido enquanto testa
    // localmente. Aceitável: deep link não é um fluxo tipicamente exercitado em build de teste LAN.
    private static final String SERVER_URL = "https://prospector-atlas.onrender.com";

    private static final Set<String> VALID_TABS = new HashSet<>(Arrays.asList(
        "dashboard", "companies", "contacts", "crm", "activities", "prospect", "enrich",
        "intelligence", "market-intelligence", "prompts", "chatbook", "roleplay",
        "qualification_matrix", "objections_matrix", "topic_training", "bitrix", "reports",
        "integrations", "knowledge", "analytics", "winloss", "calendar", "notifications",
        "automations", "usage", "editor", "team", "settings", "commercial_intelligence", "crm360"
    ));

    // BridgeActivity.onCreate() já chama this.onNewIntent(getIntent()) internamente depois de
    // criar a bridge (ver Bridge.java/BridgeActivity.java em node_modules/@capacitor/android) —
    // por isso não é preciso sobrescrever onCreate aqui também: tanto o lançamento inicial do app
    // (incluindo quando ele é aberto a partir de um deep link) quanto uma nova intent recebida com
    // o app já em memória passam por este mesmo método. launchMode="singleTask"
    // (AndroidManifest.xml) garante que uma Activity já em memória recebe o Intent novo aqui em vez
    // de criar uma segunda instância.
    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleDeepLink(intent);
    }

    private void handleDeepLink(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return;
        Uri data = intent.getData();
        if (data == null) return;

        String tab = extractTab(data);
        if (tab == null) return; // esquema/host não reconhecido — não é um deep link nosso, ignora

        if (tab.isEmpty() || "dashboard".equals(tab)) {
            navigateWebViewTo("/app");
            return;
        }
        if (VALID_TABS.contains(tab)) {
            navigateWebViewTo("/app/" + tab);
        } else {
            showInvalidDeepLinkError(tab);
        }
    }

    /**
     * atlasgr://<tab> — host da URI é o destino.
     * https://<qualquer-host>/app/<tab> — primeiro segmento de path depois de "app" é o destino;
     * "https://<host>/app" (sem destino) mapeia pro dashboard.
     * Retorna null quando a URI não é nenhum dos dois formatos (deep link de outro app / esquema
     * desconhecido, não deveria acontecer dado o AndroidManifest, mas não assume).
     */
    private String extractTab(Uri data) {
        String scheme = data.getScheme();
        if ("atlasgr".equals(scheme)) {
            String host = data.getHost();
            return host == null ? "" : host;
        }
        if ("https".equals(scheme) || "http".equals(scheme)) {
            List<String> segments = data.getPathSegments();
            int appIndex = segments.indexOf("app");
            if (appIndex < 0) return null;
            if (segments.size() > appIndex + 1) return segments.get(appIndex + 1);
            return "";
        }
        return null;
    }

    private void navigateWebViewTo(String path) {
        if (getBridge() == null) return;
        WebView webView = getBridge().getWebView();
        if (webView == null) return;
        webView.post(() -> webView.loadUrl(SERVER_URL + path));
    }

    /**
     * Bloqueador de design deste repositório (AGENTS.md do Agente 09): "deep link para destino
     * inexistente deve falhar de forma visível, nunca abrir tela em branco". Em vez de carregar uma
     * URL que o React Router acabaria silenciosamente redirecionando pro dashboard, mostra um erro
     * nativo visível e não navega o WebView.
     */
    private void showInvalidDeepLinkError(String tab) {
        runOnUiThread(() -> new AlertDialog.Builder(this)
            .setTitle("Link inválido")
            .setMessage("O destino \"" + tab + "\" não existe no AtlasGR Prospector. Verifique o link e tente novamente.")
            .setPositiveButton("OK", null)
            .show());
    }
}
