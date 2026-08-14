# FONTES - Atlas GR National Market & Territory Intelligence System

**Última revisão do catálogo:** 2026-08-13/14  
**Regra:** fonte catalogada não significa automaticamente dataset processado. O estado real de ingestão é controlado por `data/manifest.json`.

## Prioridade de fontes

1. ANTT;
2. Receita Federal;
3. IBGE;
4. MJSP / Sinesp;
5. DNIT;
6. órgãos estaduais;
7. portos e autoridades oficiais;
8. fontes empresariais primárias para concorrência;
9. fontes secundárias somente quando necessárias e identificadas.

---

## 1. ANTT - Registro Nacional de Transportadores Rodoviários de Cargas (RNTRC)

**Órgão:** Agência Nacional de Transportes Terrestres  
**Conjunto:** RNTRC  
**Catálogo:** `https://dados.antt.gov.br/dataset/rntrc`  
**API CKAN usada pelo ETL:** `https://dados.antt.gov.br/api/3/action/package_show?id=rntrc`  
**Competência:** mensal, registrada automaticamente pelo snapshot  
**Data de acesso desta revisão:** 2026-08-13/14

### Dados utilizados

- transportadores;
- município;
- UF;
- categoria;
- situação;
- ETC;
- TAC;
- CTC;
- ETC equiparada quando identificável.

### Transformação

`etl_rntrc_atlas.py` descobre o recurso mensal mais recente no CKAN, baixa para cache fora do bundle, calcula hash, valida situação e agrega por código IBGE.

### Limitações

- o arquivo bruto é grande e não deve ser carregado no navegador;
- nomes municipais exigem casamento com geografia oficial;
- frota/veículos é camada separada;
- uma linha sem match IBGE reduz qualidade e é contabilizada no metadata.

---

## 2. ANTT - Veículos / frota RNTRC

**Órgão:** ANTT  
**Referência institucional:** perfil/dados do Transporte Rodoviário de Cargas no portal ANTT  
**Data de acesso desta revisão:** 2026-08-13/14

### Dados pretendidos

- veículos ativos;
- frota;
- veículos de tração;
- implementos;
- vínculo com transportador/categoria.

### Limitação observada nesta revisão

O recurso público de veículos encontrado no catálogo atual apresentou payload vazio ou tamanho incompatível com uma base nacional utilizável. Portanto, a plataforma **não estima frota** a partir do número de transportadores. Enquanto não houver recurso oficial íntegro ou exportação oficial alternativa validada, a camada deve permanecer `NÃO DISPONÍVEL` ou `PARCIAL` no manifest.

---

## 3. ANTT - Movimentação de Cargas / MDF-e

**Órgão:** ANTT  
**Portal:** `https://www.gov.br/antt/pt-br/assuntos/cargas/dados-do-transporte-rodoviario-de-cargas`  
**Origem metodológica:** MDF-e integrado a dados do RNTRC  
**Data de acesso desta revisão:** 2026-08-13/14

### Dados pretendidos

- município/UF de origem;
- município/UF de destino;
- quantidade de viagens/MDF-e;
- toneladas;
- TKU quando disponível;
- corredores;
- interestadualidade;
- tipos/categorias de carga quando disponibilizados.

### Limitações

A disponibilidade de visualização institucional não implica existência de download automatizável no mesmo formato. A plataforma só publicará agregado MDF-e quando houver exportação oficial reproduzível e competência registrada. O ETL v0.4 existente é apenas um normalizador e será evoluído.

---

## 4. Receita Federal - Dados Abertos do CNPJ

**Órgão:** Receita Federal do Brasil  
**Catálogo institucional:** `https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/dados-abertos/cadastros/cnpj`  
**Repositório de arquivos:** `https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj/`  
**Data de acesso desta revisão:** 2026-08-13/14

### Arquivos usados/planejados

- `Empresas*.zip`;
- `Estabelecimentos*.zip`;
- `Municipios.zip`;
- `Cnaes.zip`;
- arquivos auxiliares estritamente necessários.

### Dados utilizados

- CNPJ básico/estabelecimento;
- razão social/nome fantasia quando necessário para lista B2B;
- matriz/filial;
- situação cadastral;
- município/UF;
- porte;
- capital social quando útil;
- CNAE principal;
- CNAEs secundários quando tecnicamente viável.

### Limitações

- a base nacional tem múltiplos arquivos de centenas de MB e não cabe no bundle web;
- quantidade de CNPJs não equivale a demanda ou receita;
- classificação ICP por CNAE isolado é insuficiente;
- dados pessoais de sócios não são requisito do Market Intelligence.

---

## 5. IBGE - Localidades e geografia municipal

**Órgão:** Instituto Brasileiro de Geografia e Estatística  
**API de municípios:** `https://servicodados.ibge.gov.br/api/v1/localidades/municipios`  
**Data de acesso desta revisão:** 2026-08-13/14

### Dados utilizados

- código IBGE;
- município;
- UF;
- região;
- divisões geográficas quando necessárias.

### Regra

`codigo_ibge` é a chave nacional canônica para integração municipal. Nome normalizado serve apenas como apoio de lookup.

### Limitações

Divisões geográficas históricas, atuais e unidades político-administrativas não devem ser misturadas. A contagem do universo municipal será lida do snapshot e explicitada no metadata, sem número hardcoded na interface.

---

## 6. MJSP / Sinesp - Base Nacional de Dados de Segurança Pública

**Órgão:** Ministério da Justiça e Segurança Pública / Sinesp  
**Portal:** `https://www.gov.br/mj/pt-br/assuntos/sua-seguranca/seguranca-publica/estatistica`  
**Conjunto de referência:** Sinesp VDE / Base de dados nacional  
**Cobertura encontrada na revisão:** série publicada abrangendo 2015-2026  
**Data de acesso desta revisão:** 2026-08-13/14

### Indicadores pretendidos

- roubo de carga;
- roubo de veículo;
- furto de veículo;
- demais indicadores securitários apenas quando metodologicamente pertinentes.

### Limitações

- alimentação e consolidação dependem dos entes federativos;
- atualização pode sofrer defasagem/revisões posteriores;
- granularidade nem sempre é municipal;
- dado estadual usado em município deve ser explicitamente `PROXY_UF` e ter confiança reduzida.

---

## 7. DNIT

**Órgão:** Departamento Nacional de Infraestrutura de Transportes  
**Portal institucional:** `https://www.gov.br/dnit/`  
**Uso planejado:** malha rodoviária, infraestrutura e evidências de acesso territorial quando houver dataset adequado e licença/competência claras.

### Limitação

Distância geodésica por Haversine não será apresentada como tempo/custo rodoviário. DNIT ou outra fonte oficial adequada deverá sustentar refinamentos de malha/rota.

---

## 8. Concorrência - fontes primárias empresariais

**Órgão:** não aplicável  
**Fontes prioritárias:** site oficial do concorrente, página oficial de unidades/contato, documentação institucional, registros públicos quando necessários.  
**Seed atual:** `concorrencia_seed_verificada.csv` + `FONTES_CONCORRENCIA_SEED.md`

### Campos de evidência

```text
empresa
municipio
uf
site
tipo
GR
rastreamento
monitoramento
pronta_resposta
presenca_fisica
presenca_comercial
atendimento_nacional
fonte
data_verificacao
confianca
```

A modelagem nacional deve ainda separar de forma inequívoca:

```text
sede
filial
representante
presença comercial
atendimento remoto
atendimento nacional
```

### Limitação crítica

O seed atual é `PESQUISA_PARCIAL`. Ele não autoriza inferir ausência competitiva e não libera White Space confiável.

---

## 9. Atlas GR - fontes internas de produto e premissas comerciais

**Fontes:** documentação oficial Atlas localizada no repositório/acervo e parâmetros fornecidos pelos responsáveis da empresa.

### Usos

- catálogo real de produtos;
- Product Fit Score;
- personas/decisores prováveis por contexto B2B;
- ticket MRR;
- margem;
- win rate;
- sales cycle;
- churn;
- custo/ramp-up do vendedor.

### Regra

Parâmetro comercial sem fonte interna validada é `PREMISSA EDITÁVEL`, nunca observação.

---

## 10. Manual de Identidade Visual Atlas GR

**Fonte:** Manual de Identidade Visual oficial localizado no acervo Atlas.  
**Uso:** logo oficial, área de proteção, paleta, tipografia e restrições de aplicação.

### Regras aplicadas

- logo não redesenhado;
- proporção preservada;
- sem rotação, filtro, sombra ou gradiente sobre a marca;
- Mont não é redistribuída;
- Montserrat é a alternativa digital quando a licença Mont não está disponível;
- cores principais da plataforma: `#FF5618`, `#333333`, `#FFFFFF`;
- secundárias: `#FFC500`, `#FF8008`, `#FF6B10`.

---

# Critério de fonte na interface

Cada dataset publicado deve registrar no mínimo:

```text
fonte
URL
competencia
data de download
nivel geografico
ultima atualizacao quando disponível
transformacoes
hash quando útil
limitacoes
```

A tela **Saúde dos Dados** lê esses metadados. A tela de evidências deve apontar do indicador até a fonte correspondente.