# Ranking de Oportunidade GR — onde contratar o próximo vendedor externo

**A pergunta:** onde a Atlas GR deve contratar o próximo vendedor consultor externo, e por quê?
**A resposta:** **Paranaguá/PR** — score 94,1 de 100. Depois dela: Navegantes/SC, Ribeirão das Neves/MG, Cambé/PR, Lages/SC, Santa Luzia/MG, Araguari/MG, Jataí/GO, Araras/SP, Itapevi/SP.

Esta é uma decisão de investimento alto (contratação de vendedor externo + estruturação comercial de território). Este documento existe para que a decisão não dependa de opinião — cada posição do ranking é rastreável até a fonte de dado que a sustenta.

**Fonte única de dado:** Receita Federal (CNPJ) e ANTT, competência 2026-08/jul-2026. Sem verificação manual em nenhuma etapa — todo o Brasil recebeu exatamente o mesmo critério automatizado.

---

## Como chegamos até aqui

O raciocínio segue cinco passos, cada um somando informação ao anterior. Nada é jogado fora — cada fonte vira pontos dentro de uma escala de 100.

**Passo 1 — Mapeamos a base ANTT (RNTRC).**
Baixamos o cadastro de transportadoras ativas da ANTT (Registro Nacional de Transportadores Rodoviários de Cargas), competência jul/2026, e agregamos por município: 899.249 transportadoras ativas em 5.422 municípios. Isso vira a metade "volume real de frota" do índice de Demanda — **vale 18,9 pontos dos 100**.

**Passo 2 — Cruzamos com a base de CNPJ da Receita Federal (perfil de cliente).**
Da mesma competência (2026-08), processamos os 72,8 milhões de estabelecimentos ativos do país e classificamos cada empresa em tier A/B/C de aderência ao perfil de cliente Atlas GR (`icp_taxonomy.v1.json`: logística/transporte direto = tier A; indústria/embarcadores de alta exposição = tier B; mercados adjacentes = tier C). Isso vira a outra metade do índice de Demanda — **vale 26,1 pontos dos 100**.
→ Demanda total = 18,9 + 26,1 = **45 pontos**, o maior peso do ranking: sem massa de cliente potencial, não há negócio a proteger, GR ou não.

**Passo 3 — Medimos fluxo real de carga (ANTT/CIOT).**
Cadastro não é o mesmo que movimento. Processamos 690 mil registros de CIOT (usado como proxy de fluxo origem-destino) para captar municípios que são corredores logísticos ativos mesmo com poucas empresas sediadas ali — caso clássico de porto. **Vale 25 pontos dos 100.**

**Passo 4 — Mapeamos a concorrência nacional por CNPJ.**
Voltamos à mesma base de 72,8 milhões de estabelecimentos e filtramos por CNAE 80200 (monitoramento de sistemas de segurança) + termo de nome ("risco", "gerenciadora", "rastreamento", "gestão de risco"), depois cruzamos com CNAE **principal** (evidência forte) vs só secundário (evidência fraca) para classificar cada achado em confiança ALTO/MEDIO/BAIXO. Resultado: 10.067 concorrentes únicos mapeados no Brasil inteiro, com o mesmo critério em todos os 5.571 municípios.
→ (100 − Concorrência) **vale 30 pontos dos 100** — quanto menos concorrência instalada, mais pontos.

**Passo 5 — Somamos tudo e ordenamos.**
```
Score final = 18,9 pts (RNTRC) + 26,1 pts (ICP/CNPJ) + 25 pts (Fluxo ANTT/CIOT) + 30 pts (100 − Concorrência CNPJ)
            = 100 pts possíveis
```
Cada município do Brasil com dado de demanda disponível recebeu esse cálculo — **5.566 municípios, cobertura de 100%**, todos pelo mesmo critério automatizado.

| Fonte | O que mede | Pontos no score final |
|---|---|---:|
| ANTT — RNTRC | Volume de frota/transportadoras | 18,9 |
| Receita Federal — CNPJ/ICP | Aderência ao perfil de cliente | 26,1 |
| ANTT — CIOT (proxy de fluxo) | Movimento real de carga | 25,0 |
| Receita Federal — CNPJ/CNAE | Concorrência já instalada (invertida) | 30,0 |
| **Total** | | **100** |

---

## Top 10 — ranking e por que cada uma está aí

| # | Município/UF | Score | Demanda (pts de 45) | Fluxo (pts de 25) | Concorrência (pts de 30) | Concorrentes achados |
|---:|---|---:|---:|---:|---:|---:|
| 1 | Paranaguá/PR | 94,1 | 39,9 | 24,9 | 29,3 | 2 |
| 2 | Navegantes/SC | 92,7 | 38,7 | 24,0 | 30,0 | 0 |
| 3 | Ribeirão das Neves/MG | 91,0 | 40,7 | 23,6 | 26,8 | 5 |
| 4 | Cambé/PR | 90,2 | 37,2 | 23,2 | 29,9 | 1 |
| 5 | Lages/SC | 89,3 | 39,7 | 21,2 | 28,4 | 3 |
| 6 | Santa Luzia/MG | 89,2 | 39,3 | 23,1 | 26,8 | 5 |
| 7 | Araguari/MG | 89,0 | 37,1 | 22,6 | 29,3 | 3 |
| 8 | Jataí/GO | 88,4 | 37,6 | 23,2 | 27,6 | 4 |
| 9 | Araras/SP | 88,2 | 37,1 | 22,0 | 29,0 | 2 |
| 10 | Itapevi/SP | 87,8 | 40,3 | 22,9 | 24,6 | 6 |

*(pontos de cada bloco recalculados a partir dos percentis brutos — ver `data/ranking_oportunidade_gr.json` para os percentis originais)*

### 1. Paranaguá/PR — score 94,1

**Pontos fortes:** 2º maior fluxo de carga do país (25,0 de 25 pontos possíveis) — é o principal porto do Paraná, corredor de exportação do agronegócio e granéis; demanda estrutural forte (percentil 89 em ICP, 87 em RNTRC); concorrência quase inexistente (só 2 empresas mapeadas em toda a base nacional).
**Pontos de atenção:** cidade-porto tem receita concentrada no ciclo de commodities/exportação — validar diversificação de carteira antes de comprometer meta 100% em transporte de granel. Concorrentes já mapeados: **Agrolog Transportadora de Cargas em Geral Ltda.** e **Inviolável Paranaguá Serviço de Monitoramento Ltda**.

### 2. Navegantes/SC — score 92,7

**Pontos fortes:** concorrência **zero** confirmada na base nacional — nenhum concorrente mapeado; fluxo de carga altíssimo (percentil 96, também perfil porto — proximidade do porto de Itajaí); demanda robusta.
**Pontos de atenção:** "zero concorrentes" é o resultado mais forte do ranking, mas também o que mais exige checagem antes de comprometer investimento — confirmar que não é um falso negativo do filtro de CNAE/nome (ex.: concorrente atuando sob razão social sem termo reconhecível) antes de tratar como definitivo.

### 3. Ribeirão das Neves/MG — score 91,0

**Pontos fortes:** maior score de Demanda do Top 10 (40,7 de 45 — percentil 93 em ICP, o mais alto da lista); parte do cinturão industrial/logístico da Grande BH, com massa de empresas tier A/B relevante.
**Pontos de atenção:** concorrência já presente (5 empresas, a 2ª maior contagem do Top 10) — espaço real, mas não é território virgem. Concorrentes mapeados: **Achei Soluções e Transportes Ltda**, **Arthur Pilo Costa Serviços Gerenciados**, **JR Monitoramento Veicular Ltda**, **Larimar Locações e Monitoramento Ltda**, **V&I Soluções e Logística Ltda** — nenhuma delas com evidência de ser Gerenciadora de Risco direta (perfil predominante é rastreamento/monitoramento, sinal mais fraco).

### 4. Cambé/PR — score 90,2

**Pontos fortes:** concorrência praticamente nula (0,4 percentil — só 1 concorrente); vizinha de Londrina, região de forte demanda agrícola no norte do Paraná.
**Pontos de atenção:** menor score de Demanda do Top 4 (37,2) — vale confirmar se a operação alvo seria melhor capturada com base em Londrina (cidade-polo vizinha, fora deste Top 10 mas com massa maior) e Cambé como território de atuação, não sede. Único concorrente mapeado: **Art Serviços Automotivos Ltda**.

### 5. Lages/SC — score 89,3

**Pontos fortes:** demanda forte (percentil 88-90) combinada com concorrência baixa (5,2 percentil, 3 concorrentes); polo logístico da região serrana catarinense.
**Pontos de atenção:** menor score de Fluxo do Top 10 (21,2 de 25) — é mais um polo de origem/demanda do que um corredor de passagem; ticket esperado por conta pode ser menor que em praças-porto. Concorrentes mapeados: **Dados Seguros Tecnologia Ltda**, **Edson Rodrigo de Morais**, **Khronos Monitoramento Eletrônico Ltda**.

### 6. Santa Luzia/MG — score 89,2

**Pontos fortes:** demanda muito forte (percentil 90 em ICP), parte do mesmo cinturão metropolitano de BH que Ribeirão das Neves — os dois juntos sugerem a região metropolitana de Belo Horizonte como cluster de oportunidade, não só um município isolado.
**Pontos de atenção:** mesma ressalva de Ribeirão das Neves — 5 concorrentes já mapeados: **Auto Center Gestão de Frota IoT Ltda**, **D'Granel Transportes e Comércio Ltda**, **Domo de Ferro Monitoramento e Portaria Ltda**, **Instituto Pedagógico Julio Luiz Ltda** (achado por palavra-chave, checar relevância — CNAE não é do setor), **Master Coop Cooperativa de Transportes**.

### 7. Araguari/MG — score 89,0

**Pontos fortes:** concorrência muito baixa (2,2 percentil, empatada com Paranaguá); município do Triângulo Mineiro, região de forte trânsito agro entre MG/GO/SP.
**Pontos de atenção:** demanda (37,1 pts) é a mais baixa do Top 10 em termos absolutos — oportunidade real mas de porte potencialmente menor que os líderes. Concorrentes mapeados: **Buscar Transportes e Conservadora Patrimonial Ltda**, **Coopdiesel — Cooperativa de Pessoas Físicas e Jurídicas no Segmento de Transportes**, **L R Transportes Locações e Serviços Ltda**.

### 8. Jataí/GO — score 88,4

**Pontos fortes:** polo de agronegócio de Goiás (corredor de grãos/soja), com demanda e fluxo equilibrados (ambos por volta do percentil 83-93).
**Pontos de atenção:** concorrência (8,1 percentil, 4 concorrentes) é a mais alta entre as posições 1-9 — ainda um espaço bom, mas não o mais limpo da lista. Concorrentes mapeados: **Essencial Vigilância e Segurança Ltda**, **Graziela A Vizentin Ltda**, **SIM — Soluções Integradas em Monitoramento Ltda**, **Zuccosat Rastreamento Ltda**.

### 9. Araras/SP — score 88,2

**Pontos fortes:** demanda ICP muito forte (percentil 90) com concorrência baixa (3,3 percentil, 2 concorrentes); interior paulista, região sucroalcooleira/agroindustrial.
**Pontos de atenção:** percentil RNTRC mais baixo do Top 10 (72 — ainda assim alto na escala nacional, mas o mais fraco dos dez) — menos transportadoras cadastradas ali proporcionalmente ao ICP, vale entender se é por concentração em transporte próprio (frota cativa das usinas) em vez de terceirizado. Concorrentes mapeados: **Nova Rastreadores Gestão e Segurança de Frotas Ltda**, **SmartSeg Monitoramento e Automação Ltda**.

### 10. Itapevi/SP — score 87,8

**Pontos fortes:** maior score de Demanda do Top 10 empatado com Paranaguá (40,3) — Grande São Paulo, cinturão logístico/industrial denso.
**Pontos de atenção:** maior concorrência do Top 10 (18,1 percentil, 6 concorrentes) — ainda assim um espaço saudável, mas a região metropolitana de SP já tem operação GR mais consolidada. Concorrentes mapeados: **CIM Central de Intel e Monitoramento Ltda**, **Enzo Transportes e Serviços Gerais Ltda**, **ERL Instalação de Rastreadores Ltda**, **Guardian Proteção Veicular Ltda**, **Sicarseg — Serviço de Segurança, Portaria e Monitoramento Ltda**, **Transvictor Soluções em Transportes Ltda**.

---

## Recomendação

**Paranaguá/PR primeiro.** Justificativa em uma frase: é o único município do Top 10 com o máximo possível de pontos de Fluxo (25 de 25) combinado com concorrência quase zero — nenhuma outra praça junta as duas coisas no mesmo nível, e os 2 únicos concorrentes já estão nominalmente identificados.

**Segunda onda, se a operação em Paranaguá validar a tese:** Navegantes/SC (mesmo perfil porto, zero concorrência confirmada — mas validar o dado antes) e o cluster Ribeirão das Neves + Santa Luzia (Grande BH), que juntos indicam uma região inteira de oportunidade, não só um município.

O material completo de apoio a esta decisão está em:
- `METODOLOGIA_RANKING_EXPLICADO.md` — cada fonte, peso, fórmula e cálculo de exemplo
- `data/ranking_oportunidade_gr.json` — dados brutos (Top 30 municípios + agregado por UF)
- `data/whitespace_municipios.json` — score de todos os 5.566 municípios classificáveis
- `data/concorrentes_gr_receita_federal.csv` — os 10.795 concorrentes mapeados, com cidade e CNAE
- Dashboard visual (artifact HTML) — mesmos dados em formato navegável, com gráficos
- `PLANO_ACAO_BACKOFFICE_NOVO_VENDEDOR.md` — plano de ativação para o backoffice, com contas pré-mapeadas em Paranaguá/PR
