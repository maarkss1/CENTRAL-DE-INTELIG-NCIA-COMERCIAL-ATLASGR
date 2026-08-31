# Plano de ação — backoffice para o próximo vendedor externo

**Território recomendado:** Paranaguá/PR (score White Space 94,1 — ver `RANKING_OPORTUNIDADE_GR_2026_08.md`)
**Objetivo deste documento:** garantir que, no primeiro dia, o vendedor contratado já tenha uma carteira de contas mapeadas e priorizadas — não uma cidade em branco.

---

## 1. O que já está pronto antes da contratação

| Entregável | Status | Onde está |
|---|---|---|
| Território priorizado e justificado | ✅ Pronto | `RANKING_OPORTUNIDADE_GR_2026_08.md` |
| Metodologia auditável do porquê desse território | ✅ Pronto | `METODOLOGIA_RANKING_EXPLICADO.md` |
| Mapa de concorrência local (quem já atua lá) | ✅ Pronto | `data/concorrentes_gr_receita_federal.csv` (filtrar `municipio=PARANAGUA`) |
| Lista de contas-alvo (empresas ICP tier A/B/C sediadas no território) | ✅ Pronto — 2.295 contas tier A (matriz, porte médio/grande) | `data/contas_alvo_paranagua_pr.csv` |
| Canal de relacionamento setorial local | ✅ Identificado | SETCEPAR (sindicato patronal de transporte de cargas do PR) tem escritório regional em Paranaguá |

## 2. Contas-alvo (ICP) em Paranaguá/PR

Gerado pelo pipeline oficial já existente no repositório (`cnpj_company_pipeline.py`, função `build_company_snapshot`), filtrado para `uf=PR`, `municipioIbge=4118204` — **o mesmo mecanismo que já produziu o seed de Ribeirão Preto/SP no repositório central de inteligência comercial**, agora aplicado ao território recomendado por este ranking.

**Resultado:** 19.873 estabelecimentos ativos em Paranaguá, classificados por tier ICP (`icp_taxonomy.v1.json`) — **2.809 tier A** (logística/transporte direto), dos quais **2.295 são matriz de porte médio/grande** (código de porte "DEMAIS", não micro/pequena empresa). É essa lista de 2.295 que vai para o vendedor no dia 1, em `data/contas_alvo_paranagua_pr.csv` (razão social, nome fantasia, CNAE, porte, capital social, telefone, e-mail, bairro — tudo cadastral público da Receita Federal).

**Amostra real (10 primeiras, ordenadas por porte):**

| Razão social | Atividade (CNAE principal) |
|---|---|
| FERTHUB LTDA | Fabricação de adubos e fertilizantes |
| WM-COMERCIO DE COMBUSTIVEIS LTDA | Comércio varejista de combustíveis |
| INTERMODAL SLAVIERO S/A | Terminais rodoviários e ferroviários |
| INTERFERTIL FERTILIZANTES LTDA | Fabricação de adubos e fertilizantes |
| MULTITRANS - TRANSPORTES E ARMAZENS GERAIS LTDA. | Transporte rodoviário de produtos perigosos |
| MONTAGENS E EQUIPAMENTOS PARANAGUA LTDA | Operação/fornecimento de equipamento para transporte e elevação de cargas |
| DEPOSITO FRANCO PARAGUAIO EM PARANAGUA | Depósito de mercadorias para terceiros |
| TRANSPORTADORA PRIMOLA LTDA | Transporte rodoviário de carga, intermunicipal/interestadual/internacional |
| CEU AZUL - ASSESSORIA DE ADMINISTRACAO E COMERCIO EXTERIOR LTDA. | Atividades do Operador Portuário |
| CONSORCIO REDRAM - TRANSBRASA | Carga e descarga |

O perfil confirma a leitura do score: fertilizantes, produtos perigosos, operador portuário, armazenagem — exatamente o tipo de carga de alto valor/alto risco que justifica contratar GR, concentrado ao redor do porto.

**Contexto do território (dados do White Space):**

| Sinal | Valor | Leitura |
|---|---|---|
| Percentil ICP | 89,4 | Massa de empresas aderentes ao perfil de cliente Atlas GR está entre os 11% mais fortes do país |
| Percentil RNTRC | 87,4 | Densidade de transportadoras ativas também no topo nacional |
| Percentil fluxo de carga | 99,8 | 2º maior fluxo do país — é porto, corredor logístico de entrada/saída relevante |
| Concorrentes GR mapeados | 2 | Praticamente sem concorrência instalada |

## 3. Priorização de contas — critério para o vendedor no dia 1

Ordem de abordagem (mesmo critério de tier já usado pelo `icp_taxonomy.v1.json`):

1. **Tier A, matriz, porte médio/grande** — logística e transporte diretamente expostos (CNAEs de transporte rodoviário de cargas, armazenagem, apoio/agenciamento de cargas). Maior aderência e maior ticket potencial.
2. **Tier A, filial** — mesma aderência setorial, decisão pode depender de matriz fora do município (registrar isso na abordagem).
3. **Tier B** — indústria/embarcadores de alta exposição logística (agro, alimentos, químico, metalurgia) sediados no porto — cliente que move carga própria, não só quem transporta.
4. **Tier C** — mercados adjacentes (atacado/distribuição, agro) — fila de prospecção secundária.

## 4. Canal de relacionamento local — SETCEPAR

- **O que é:** Sindicato das Empresas de Transportes de Cargas no Estado do Paraná, criado em 1943, representa ~12 mil empresas em 265 municípios paranaenses, com escritório regional em Paranaguá além da sede em Curitiba.
- **O que NÃO temos:** lista pública de empresas associadas — não é publicada.
- **O que fazer:** contato remoto (telefone/e-mail, sem necessidade de visita) com o escritório regional de Paranaguá para (a) apresentar a Atlas GR, (b) pedir indicação/apresentação a transportadoras associadas relevantes, (c) checar se o sindicato promove eventos/reuniões locais onde a Atlas possa se apresentar.
- **Fonte:** [setcepar.com.br](https://setcepar.com.br/) — página institucional e de associação.
- Isso é um **acelerador de prospecção**, não uma dependência — a carteira ICP do item 2 já é suficiente para o vendedor começar a trabalhar independentemente do retorno do sindicato.

## 5. Checklist de ativação — primeiros 30 dias

- [ ] Backoffice entrega a carteira de contas-alvo (CSV, tier A primeiro) no dia 1
- [ ] Backoffice entrega a lista de 2 concorrentes já mapeados em Paranaguá, para o vendedor saber contra quem está competindo
- [ ] Contato remoto com SETCEPAR regional Paranaguá na primeira semana
- [ ] Meta de primeiras 20 abordagens: 100% tier A matriz/filial (lista pronta, sem necessidade de prospecção fria de descoberta)
- [ ] Revisão de território em 60 dias: comparar contas efetivamente abordadas x carteira ICP total, para calibrar se o volume de tier A sozinho sustenta a operação ou se é hora de abrir tier B

## 6. Como manter esta carteira viva

O `.github/workflows` do repositório central de inteligência comercial já roda mensalmente (dia 10) uma atualização do seed empresarial a partir da Receita Federal. O mesmo mecanismo pode ser apontado para qualquer novo território assim que um novo vendedor for contratado — o comando é o mesmo usado aqui, só troca `--companies-uf`/`--companies-municipality-ibge`. Isso torna este plano **replicável para o 2º, 3º... vendedor**, não um trabalho artesanal único.
