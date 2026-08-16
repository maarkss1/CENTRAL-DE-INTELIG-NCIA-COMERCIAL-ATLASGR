# FONTES - Atlas GR National Market & Territory Intelligence System

**Última revisão do catálogo:** 2026-08-14  
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
**Recurso publicado nesta versão:** `Jul26 - RNTRC`  
**Resource ID:** `42a9f5fb-494f-4ad8-acc3-e8d836dbf0c3`  
**Competência:** `2026-07`  
**Última atualização declarada do recurso:** `2026-08-10`  
**Data de processamento:** `2026-08-14`

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

### Snapshot publicado

- bruto: `158.740.046` bytes;
- linhas processadas: `1.158.159`;
- transportadores ativos: `899.249`;
- municípios com presença RNTRC: `5.422`;
- linhas ativas sem match IBGE: `391` (`0,0435%`);
- SHA-256 bruto: `0c23cdf826bb3cd943827a5972b7a2b98cb4b5a3111d1feb80eec5ce382101eb`;
- SHA-256 derivado: `a7e9379fef70cd8bcfb57621defa72dae12bb2b7da4f2b8dc74c1b9218013eca`.

### Transformação

`etl_rntrc_atlas.py` baixa para cache fora do bundle, calcula hash, filtra situação ativa, resolve geografia pelo IBGE e agrega por código municipal IBGE.

### Limitações

- o arquivo bruto é grande e não entra no navegador;
- nomes municipais exigem casamento com geografia oficial;
- `391` linhas ativas do snapshot não casaram com IBGE e permanecem contabilizadas como perda de cobertura;
- frota/veículos é camada separada e possui outra granularidade pública.

---

## 2. ANTT - RNTRC-Dados de Veículos / frota

**Órgão:** Agência Nacional de Transportes Terrestres  
**Conjunto:** `RNTRC-Dados de Veículos`  
**Data de auditoria:** `2026-08-14`  
**Dicionário oficial:** recurso `dicionario-de-dados-veiculos.pdf` do próprio conjunto ANTT.

### Schema oficial auditado

O dicionário oficial lista:

```text
Categoria do Transportador
Tipo de Veículo
UF do Veículo
Categoria
Carroceria
Ano de Fabricação do Veículo
Quantidade
```

Portanto:

- a granularidade factual disponível neste recurso é **UF**;
- `Tipo de Veículo` separa **Tração** e **Implemento**;
- `Quantidade` é a medida aditiva da frota;
- o recurso público **não contém município**;
- o recurso público **não contém número RNTRC individual** para join com a base de transportadores;
- qualquer uso municipal é obrigatoriamente `PROXY_UF`.

### Evidência de disponibilidade

**Recurso histórico Jul/2026:** o catálogo registrava aproximadamente `10,5 MiB`, porém o endereço físico devolveu HTTP 404 com HTML no CI em `2026-08-14`. O payload foi rejeitado e nenhum número foi publicado.

**Recurso vigente Ago/2026:** Resource ID `69b79c0a-6fc9-42be-b014-224dff171915`. O catálogo oficial expõe tamanho incompatível com uma base nacional válida. O workflow `market-intelligence-fleet.yml` agora executa um `probe` de integridade: somente um CSV com HTTP válido e tamanho mínimo de segurança segue para o ETL.

### Estado da plataforma

Enquanto o recurso vigente não entregar payload nacional íntegro:

```text
status = NAO_DISPONIVEL
geography = UF
municipalUse = PROXY_UF
```

A plataforma não estima frota a partir do número de transportadores e não transforma ausência de arquivo em zero.

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

A disponibilidade de visualização institucional não implica existência de download automatizável no mesmo formato. A plataforma só publicará agregado MDF-e quando houver exportação oficial reproduzível e competência registrada.

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
**Data de acesso desta revisão:** 2026-08-14

### Dados utilizados

- código IBGE;
- município;
- UF;
- região;
- divisões geográficas quando necessárias.

### Regra

`codigo_ibge` é a chave nacional canônica para integração municipal. Nome normalizado serve apenas como apoio de lookup. O parser suporta a hierarquia geográfica histórica e o esquema atual da API, inclusive linhas com `microrregiao = null`.

### Limitações

Divisões geográficas históricas, atuais e unidades político-administrativas não devem ser misturadas. O ETL rejeita cadastro municipal materialmente incompleto.

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
data de download ou probe
nivel geografico
ultima atualizacao quando disponível
transformacoes
hash quando útil
limitacoes
```

A tela **Saúde dos Dados** lê esses metadados. A tela de evidências deve apontar do indicador até a fonte correspondente.
