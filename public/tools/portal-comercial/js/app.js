// ---------------------------------------------------------------------------
// Boot comum a todas as páginas do portal (index.html, cockpit.html,
// extracao.html, forecast.html, sdr.html — e o antigo "Relatorios AtlasGR.html",
// mantido como redirect). Todas as páginas carregam os mesmos js/*.js, nesta
// mesma ordem, sem nenhuma lógica duplicada entre elas — só o HTML de cada
// página muda, e cada função de inicialização abaixo só roda se os elementos
// de que ela depende existem no DOM daquela página específica. Cada página
// ainda pode ter um pequeno <script> inline próprio, depois deste arquivo, só
// para tratar parâmetros de URL ou pré-seleções específicas dela (ver, por
// exemplo, o script inline de extracao.html que lê "?relatorio=chave").
// ---------------------------------------------------------------------------
iniciar(); // seguro em qualquer página: só popula #entidade/#relatorio se ambos existirem (ver js/ui.js)
iniciarExperienciaV7(); // seguro em qualquer página: cada passo interno já é protegido por checagem de elemento
if (document.getElementById("central-inteligencia-v10")) iniciarCentralInteligenciaV10();
if (document.getElementById("ferramentasFlutuantes")) iniciarFerramentasFlutuantes();
// cockpit.html tem o painel completo (#cockpit-executivo); index.html só tem o
// ticker ao vivo (#cockpitTicker) — iniciarCockpitExecutivo() é seguro nos dois
// casos (cada passo interno já é protegido por checagem de elemento).
if (document.getElementById("cockpit-executivo") || document.getElementById("cockpitTicker")) iniciarCockpitExecutivo();
