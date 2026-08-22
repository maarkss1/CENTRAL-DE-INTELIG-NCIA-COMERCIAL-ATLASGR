// ---------------------------------------------------------------------------
// v26 — Portal com senha única por navegador ("acesso restrito", pedido
// explícito do usuário). NÃO é segurança forte: a senha só é comparada como
// hash SHA-256 (nunca em texto puro) contra o que a pessoa digita, mas quem
// abrir o código-fonte pode tentar quebrar o hash por força bruta. Serve pra
// afastar acesso casual de quem não tem o link/senha — não para proteger
// dados sensíveis de verdade (não há dados sensíveis persistidos aqui além
// do que já é público no Bitrix da própria empresa).
//
// v27 — portal multi-empresa (AtlasGR + Total Trac), cada uma com sua própria
// senha e seu próprio flag de desbloqueio (senão, destravar com a senha da
// AtlasGR também destravaria as páginas da Total Trac, já que antes era um
// único flag global). A empresa vem do `data-empresa` do próprio `<html>` da
// página (não de `marcaAtiva()`/`config.js`, que ainda não carregou neste
// ponto — auth.js é sempre o primeiro <script> de cada página).
//
// Como trocar a senha: gere o hash SHA-256 da nova senha (ex.: no console do
// navegador, `await crypto.subtle.digest("SHA-256", new
// TextEncoder().encode("nova-senha"))` e converta pra hex, ou qualquer
// gerador de SHA-256 online) e troque o valor correspondente em SENHAS_HASH
// abaixo. As senhas atuais de cada empresa não ficam documentadas aqui em
// texto puro (este repositório é público) — combine com quem já as tem.
// ---------------------------------------------------------------------------
(function () {
  const SENHAS_HASH = {
    atlasgr: "971b5af4a5fda505e27419910527bf48b52b754ca55cc34592a3ea6c4f466d7a",
    totaltrac: "d2f14884650339d997e82d0cde51942573bf7c1c0400a9714112eca7f5a0c2e6"
  };
  const empresa = document.documentElement.getAttribute("data-empresa") || "atlasgr";
  const SENHA_HASH = SENHAS_HASH[empresa] || SENHAS_HASH.atlasgr;
  const CHAVE_DESBLOQUEIO = "atlas-portal-auth-ok" + (empresa !== "atlasgr" ? "__" + empresa : "");
  const gate = document.getElementById("loginGate");
  if (!gate) return; // pagina sem gate (nao deveria acontecer em nenhuma pagina do portal)

  function desbloquear() {
    document.body.classList.remove("aguardando-login");
    gate.classList.add("oculto");
  }

  let jaDesbloqueado = false;
  try { jaDesbloqueado = localStorage.getItem(CHAVE_DESBLOQUEIO) === "1"; } catch (e) {}
  if (jaDesbloqueado) { desbloquear(); return; }

  async function sha256Hex(texto) {
    const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
    return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  const form = document.getElementById("loginGateForm");
  const input = document.getElementById("loginGateSenha");
  const erro = document.getElementById("loginGateErro");
  if (!form || !input) return;

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    let hash;
    try {
      hash = await sha256Hex(input.value.trim());
    } catch (e) {
      erro.textContent = "Este navegador não suporta a verificação de senha (Web Crypto indisponível).";
      erro.classList.remove("oculto");
      return;
    }
    if (hash === SENHA_HASH) {
      try { localStorage.setItem(CHAVE_DESBLOQUEIO, "1"); } catch (e) {}
      desbloquear();
    } else {
      erro.textContent = "Senha incorreta. Tente novamente.";
      erro.classList.remove("oculto");
      input.value = "";
      input.focus();
    }
  });

  setTimeout(() => input.focus(), 60);
})();

// Link "🔒 Sair" na navegação — limpa o desbloqueio deste navegador e recarrega,
// voltando a pedir a senha. v27: cada empresa tem seu próprio flag (ver
// CHAVE_DESBLOQUEIO acima) — sai só da empresa da página atual.
function sairDoPortal() {
  const empresa = document.documentElement.getAttribute("data-empresa") || "atlasgr";
  const chave = "atlas-portal-auth-ok" + (empresa !== "atlasgr" ? "__" + empresa : "");
  try { localStorage.removeItem(chave); } catch (e) {}
  location.reload();
}
