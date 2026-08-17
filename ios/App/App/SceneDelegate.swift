import UIKit
import Capacitor

// Resolve o deep link de esquema custom "atlasgr://<destino>" (ver CFBundleURLTypes em
// Info.plist) traduzindo o destino recebido pra uma navegação real dentro do WebView que o
// Capacitor já carregou (server.url, ver capacitor.config.ts) — contraparte iOS de
// android/app/src/main/java/br/com/atlasgr/prospector/MainActivity.java (mesma lista de destinos
// válidos, mesmo comportamento de erro visível para destino desconhecido; ver comentários lá para
// o raciocínio completo, incluindo o handoff aberto pro Agente 02 sobre a lista duplicada e sobre
// "enrich"/"prompts" não terem rota correspondente em src/App.tsx).
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    // Espelha o default de PRODUCTION_URL em capacitor.config.ts — mantenha os dois em sincronia.
    private static let serverURL = "https://prospector-atlas.onrender.com"

    private static let validTabs: Set<String> = [
        "dashboard", "companies", "contacts", "crm", "activities", "prospect", "enrich",
        "intelligence", "market-intelligence", "prompts", "chatbook", "roleplay",
        "qualification_matrix", "objections_matrix", "topic_training", "bitrix", "reports",
        "integrations", "knowledge", "analytics", "winloss", "calendar", "notifications",
        "automations", "usage", "editor", "team", "settings", "commercial_intelligence", "crm360"
    ]

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)

        if let url = connectionOptions.urlContexts.first?.url {
            handleDeepLink(url)
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
        if let url = URLContexts.first?.url {
            handleDeepLink(url)
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    private func handleDeepLink(_ url: URL) {
        guard url.scheme == "atlasgr" else { return }
        let tab = url.host ?? ""

        if tab.isEmpty || tab == "dashboard" {
            navigateWebView(to: "/app")
            return
        }
        if SceneDelegate.validTabs.contains(tab) {
            navigateWebView(to: "/app/\(tab)")
        } else {
            showInvalidDeepLinkError(tab: tab)
        }
    }

    private func navigateWebView(to path: String) {
        guard let bridgeVC = window?.rootViewController as? CAPBridgeViewController,
              let webView = bridgeVC.webView,
              let targetURL = URL(string: SceneDelegate.serverURL + path) else { return }
        DispatchQueue.main.async {
            webView.load(URLRequest(url: targetURL))
        }
    }

    // Bloqueador de design deste repositório (AGENTS.md do Agente 09): "deep link para destino
    // inexistente deve falhar de forma visível, nunca abrir tela em branco".
    private func showInvalidDeepLinkError(tab: String) {
        guard let presenter = window?.rootViewController else { return }
        DispatchQueue.main.async {
            let alert = UIAlertController(
                title: "Link inválido",
                message: "O destino \"\(tab)\" não existe no AtlasGR Prospector. Verifique o link e tente novamente.",
                preferredStyle: .alert
            )
            alert.addAction(UIAlertAction(title: "OK", style: .default))
            presenter.present(alert, animated: true)
        }
    }
}
