# Contribuição ao Censo Competitivo GR — 29/08/2026

**Status:** `PESQUISA_PARCIAL`. Não solicita nem libera `CENSO_COMPLETO` em nenhum município.
**Protocolo:** `competition-census-v1`, validado via `etl_concorrencia_censo.py` (0 linhas não-casadas).

## O que isto é

Uma rodada de pesquisa dedicada à categoria de maior peso do índice de Pressão Concorrencial (`GERENCIADORA_GR`, peso-base 1,00 — ver `METODOLOGIA_WHITESPACE.md`), motivada pela pergunta central da plataforma: *onde a Atlas GR deve contratar o próximo vendedor consultor externo*.

Duas fontes primárias foram a base de tudo:
- Lista de gerenciadoras de risco credenciadas pela **AXA** (PDF institucional, cidade/UF por empresa) — reextraída diretamente com `pdftotext`, não resumida por terceiros.
- Lista de gerenciadoras/rastreadoras credenciadas pela **Porto Seguro** (duas versões comparadas: jan/2024 e uma mais recente, jun/2026 — o vazio nos estados sem GR persiste nas duas, o que descarta a hipótese de lista desatualizada).

## O que foi adicionado

### `concorrencia_seed_verificada.csv` — 16 presenças novas
GRs com sede/unidade confirmada em Campo Grande/MS, Fortaleza/CE, Maceió/AL, Recife/PE, Araguaína/TO (único registro de GR sediada em toda a Região Norte além do Tocantins em si), Cascavel/PR, Curitiba/PR (2), Maringá/PR, Porto Alegre/RS, Osasco/SP, São Paulo/SP (2), Rondonópolis/MT (posto avançado, evidência mais fraca — vaga de emprego, não sede), Rio de Janeiro/RJ, Uberlândia/MG.

**Nota:** a lista credenciada da AXA também cita **"Atlas GR (Ribeirão Preto/SP)"** — quase certamente a própria Atlas, não um concorrente. Excluído deliberadamente do censo competitivo por esse motivo.

**Nota 2:** duas empresas apareceram em fontes com atribuição de cidade conflitante entre esta pesquisa e o seed já existente (Gertran: Belo Horizonte nesta pesquisa vs. Uberlândia já registrado; Angellira/Angel Lira: Concórdia nesta pesquisa vs. Chapecó já registrado) — **não adicionadas**, para não introduzir uma duplicata contraditória sem verificação adicional. Ambas podem genuinamente ter mais de uma unidade; vale confirmar antes de mesclar.

### `concorrencia_censo_cobertura.csv` — 11 municípios com evidência negativa registrada
Salvador/BA, Feira de Santana/BA, Belém/PA, Vitória/ES, São Luís/MA, Aracaju/SE, Teresina/PI, Natal/RN, João Pessoa/PB, Brasília/DF, Manaus/AM — busca dedicada não encontrou nenhuma GR sediada em nenhum desses municípios. `maps_search` ficou `false` em todos (não foi feita busca dedicada em mapas) e `business_registry_search` ficou `false` em Belém e Manaus (Econodata não foi consultado especificamente para PA e AM nesta rodada) — por isso `confidence=MEDIO`, e nenhuma linha solicita `CENSO_COMPLETO`.

Terceira fonte usada para corroborar (não incluída no CSV por não ter o schema de presença/cobertura): **Econodata**, base de CNPJs filtrada por setor "Gerenciadora de Risco" — retornou 0 empresas em BA, MA, PI, RN, PB, SE, ES, DF, e 2 em MS como controle de que o filtro captura empresas reais.

## Ranking de oportunidade resultante (fit ICP × vazio de GR confirmado)

| UF | RNTRC ativo (fit estrutural confirmado) | Status GR |
|---|---:|---|
| BA | 10.743 | vazio confirmado |
| ES | 5.885 | vazio confirmado |
| PA | 4.908 | vazio confirmado |
| MA | 3.167 | vazio confirmado |
| RO | 2.662 | vazio confirmado |
| DF | 1.507 | vazio confirmado |
| SE | 1.465 | vazio confirmado |
| PI | 1.425 | vazio confirmado |
| RN | 1.311 | vazio confirmado |
| PB | 1.284 | vazio confirmado |
| AM | 1.186 | vazio confirmado |

Fonte da coluna de demanda: contagem direta dos relatórios municipais `FIT_ESTRUTURAL_CONFIRMADO` (RNTRC ativo), gerados por `scripts/market_intelligence/generate_municipality_fit_reports.py` — a mesma rodada em que a rotulagem `wave1`/"Fit confirmado" foi corrigida em 29/08/2026 (ver commit separado, ainda não integrado à `main`).

## O que isto NÃO prova

- Não vira `CENSO_COMPLETO` em nenhum município — falta o protocolo integral (`maps_search` nunca foi feito; `business_registry_search` faltou em 2 dos 11 municípios de evidência negativa).
- "Sede confirmada" reflete cadastro junto à seguradora, não alcance operacional real — algumas GRs atendem remotamente sem escritório local.
- Cobertura de credenciamento é só AXA e Porto Seguro. As outras 12 grandes seguradoras do ramo (Tokio Marine, Allianz, Bradesco Seguros, Mapfre, Chubb, SURA, HDI, Liberty, Sompo, Zurich, Akad/Argo, Fairfax) **não publicam lista de GR credenciada** — usam PGR negociado caso a caso, monitoramento próprio, ou portal de corretor fechado. Isso não é uma lacuna desta pesquisa: é a arquitetura real do setor, e significa que uma GR pequena credenciada só por uma dessas seguradoras passaria batido por este censo.
- GRISTEC (associação do setor) permanece impossível de raspar — só grade de logos, sem nome/cidade pesquisável.

## Material de apoio

`lacuna-gr-hub.html` — página estática nesta mesma pasta com o ranking visual completo (demanda por UF, mapa de oferta por região, ressalvas e fontes), na identidade visual oficial Atlas. Referência de leitura, não substitui a feature nativa React em `src/features/market-intelligence/`.

## Recomendação de próximo passo

Antes de qualquer decisão de contratação de vendedor externo com base nisso: (1) rodar `maps_search` real para os 11 municípios de evidência negativa; (2) tentar Econodata para Belém e Manaus especificamente; (3) contato direto com transportadoras/sindicatos locais em Bahia e Espírito Santo (as duas maiores oportunidades por volume) antes de comprometer investimento.
