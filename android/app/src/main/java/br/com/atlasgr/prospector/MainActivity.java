package br.com.atlasgr.prospector;

import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * Ponto de entrada nativo do app AtlasGR Prospector (Capacitor).
 *
 * ACHADO (Onda 4/Roadmap v2, Agente 09): este arquivo nunca existiu no repositório, apesar de
 * `AndroidManifest.xml` declarar `android:name=".MainActivity"` como Activity launcher e de
 * `capacitor.config.ts`/comentários do manifest já descreverem, em prosa, um `handleDeepLink` que
 * supostamente vivia aqui (ver handoff antigo
 * `.agents/handoffs/onda-8/09-para-08-10-dominio-producao-e-verificacao-deep-link.md`, que
 * afirmava "implementei nesta onda"). `git log --all` para este caminho não retorna nenhum commit
 * — o arquivo nunca foi commitado. Sem ele, o Gradle não resolve `.MainActivity` e o app não
 * builda/instala de verdade: é exatamente o padrão de "config aspiracional nunca testada de fato"
 * que esta auditoria existe para achar. Implementado agora, cobrindo os dois usos já documentados
 * no manifest: bootstrap padrão do Capacitor (`BridgeActivity`) e resolução do deep link nativo.
 *
 * Deep link: dois intent-filters em AndroidManifest.xml apontam para esta Activity —
 * - esquema custom `atlasgr://<destino>` (sem autoVerify, sempre funciona sem depender de DNS);
 * - Android App Link `https://<host>/app/<destino>` (autoVerify="true", host espelha
 *   PRODUCTION_URL de capacitor.config.ts; verificação automática real depende de
 *   `/.well-known/assetlinks.json` publicado no domínio, fora deste escopo — até lá funciona como
 *   link comum).
 *
 * `<destino>` precisa ser um `TabType` válido do contrato de navegação do Agente 02
 * (`src/lib/navigationBus.ts`, `TAB_ROUTE_SET`) — VALID_TABS abaixo é um espelho manual dessa
 * lista (Java não importa TypeScript). Um destino desconhecido NUNCA carrega uma URL nem finge
 * sucesso: mostra um diálogo nativo de erro visível — o mesmo princípio do bloqueador "comando de
 * voz que afirma navegar sem realizar navegação" (`/AGENTS.md`) se aplica a deep link.
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "AtlasGRDeepLink";

    // Espelha TAB_ROUTE_SET de src/lib/navigationBus.ts. Mantenha sincronizado manualmente sempre
    // que o Agente 02 alterar o contrato de navegação — ver
    // .agents/handoffs/onda-8/09-para-02-navigationbus-rotas-ausentes.md para o bug que acontece
    // quando as duas listas divergem (deep link "abre e não faz nada").
    private static final Set<String> VALID_TABS = new HashSet<>(Arrays.asList(
        "dashboard", "companies", "contacts", "crm", "crm360", "mesa-tratamento", "activities",
        "cadence", "prospect", "intelligence", "market-intelligence", "propostas", "chatbook",
        "roleplay", "qualification_matrix", "objections_matrix", "topic_training", "bitrix",
        "reports", "integrations", "knowledge", "analytics", "winloss", "calendar",
        "notifications", "automations", "usage", "editor", "team", "settings",
        "commercial_intelligence"
    ));

    @Override
    public void onCreate(@Nullable Bundle savedInstanceState) {
        // ACHADO: `androidx.core:core-splashscreen` já era dependência declarada em
        // android/app/build.gradle e AppTheme.NoActionBarLaunch já herda de Theme.SplashScreen
        // (styles.xml), mas nada chamava installSplashScreen() — sem essa chamada (que precisa
        // vir antes de super.onCreate(), por exigência da própria API), o Android 12+ ignora o
        // tema customizado e mostra o splash padrão do sistema (ícone sobre fundo genérico) em vez
        // do splash.png de marca. Corrigido aqui; nenhuma dependência nova foi necessária.
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
        handleDeepLink(getIntent());
    }

    @Override
    public void onNewIntent(@NonNull Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleDeepLink(intent);
    }

    /**
     * Traduz o Intent VIEW recebido (esquema custom ou App Link https) num destino conhecido e
     * navega o WebView já carregado (server.url, ver capacitor.config.ts) até lá. Não duplica
     * lógica de rota: só monta a URL relativa que o React Router de src/App.tsx já interpreta.
     */
    private void handleDeepLink(@Nullable Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) {
            return;
        }

        Uri data = intent.getData();
        if (data == null) {
            return;
        }

        String tab = extractTab(data);
        if (tab == null) {
            Log.w(TAG, "Deep link com formato não reconhecido: " + data);
            showInvalidDeepLinkDialog(data.toString());
            return;
        }

        if (tab.isEmpty()) {
            tab = "dashboard";
        }

        if (!VALID_TABS.contains(tab)) {
            Log.w(TAG, "Deep link para destino desconhecido: " + data);
            showInvalidDeepLinkDialog(data.toString());
            return;
        }

        navigateTo(tab);
    }

    /**
     * Esquema custom `atlasgr://<destino>` → host da URI é o destino (ex.: "atlasgr://crm" tem
     * host="crm"; "atlasgr://" sem host retorna string vazia, tratado como dashboard).
     * App Link `https://<host>/app/<destino>[/...]` → primeiro segmento de path depois de "app".
     * Qualquer outro esquema/formato retorna null (deep link malformado, não um destino válido).
     */
    @Nullable
    private String extractTab(@NonNull Uri data) {
        String scheme = data.getScheme();

        if ("atlasgr".equals(scheme)) {
            String host = data.getHost();
            return host == null ? "" : host;
        }

        if ("https".equals(scheme) || "http".equals(scheme)) {
            String path = data.getPath();
            if (path == null || path.isEmpty()) {
                return "";
            }
            String[] segments = path.split("/");
            for (int i = 0; i < segments.length; i++) {
                if ("app".equals(segments[i])) {
                    return i + 1 < segments.length ? segments[i + 1] : "";
                }
            }
            return null;
        }

        return null;
    }

    private void navigateTo(@NonNull String tab) {
        String serverUrl = getBridge() != null ? getBridge().getServerUrl() : null;
        if (serverUrl == null) {
            Log.w(TAG, "server.url ausente (ver capacitor.config.ts) — não é possível navegar para " + tab);
            return;
        }

        String base = serverUrl.endsWith("/") ? serverUrl.substring(0, serverUrl.length() - 1) : serverUrl;
        String targetUrl = "dashboard".equals(tab) ? base + "/app" : base + "/app/" + tab;

        WebView webView = getBridge().getWebView();
        if (webView == null) {
            return;
        }
        webView.post(() -> webView.loadUrl(targetUrl));
    }

    private void showInvalidDeepLinkDialog(String uri) {
        runOnUiThread(() -> new AlertDialog.Builder(this)
            .setTitle(getString(R.string.deep_link_invalid_title))
            .setMessage(getString(R.string.deep_link_invalid_message, uri))
            .setPositiveButton(android.R.string.ok, null)
            .show());
    }
}
