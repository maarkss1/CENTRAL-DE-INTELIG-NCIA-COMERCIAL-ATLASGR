# NEXUS OS — Manual Definitivo de Identidade Visual & UI/UX Futurista
## Central de Inteligência Comercial (AtlasGR & TotalTrac)

Este manual é a especificação técnica e visual definitiva para a plataforma multi-tenant, fundindo o DNA de **Segurança & Gestão de Risco da AtlasGR** com a **Telemetria de Precisão da TotalTrac** sob uma camada cibernética de alta performance.

---

### 1. Pilares Estratégicos & DNA das Marcas

#### AtlasGR
- **Missão:** Gerenciar os riscos nos processos logísticos com ampla gama de serviços e alta segurança.
- **Propósito:** Conectar pessoas e tecnologia gerando valores com segurança e inovação.
- **Valores:** Perseverança, Transparência, Simplicidade, Atitude de Dono e Inovação.
- **Conceitos Visuais:** Formas geométricas com ângulos de 60º, robustez, calor industrial e dinamismo.

#### TotalTrac
- **Missão:** Atender às necessidades na gestão de frotas com recursos tecnológicos avançados.
- **Slogan:** Conectar para cuidar.
- **Valores:** Inovação, Praticidade, Segurança, Custo-benefício e Excelência de atendimento.
- **Conceitos Visuais:** Ondas concêntricas de sinal (radar/satélite), precisão matemática, dados em tempo real.

---

### 2. Logos, Grids de Construção & Área de Proteção

1. **Construção Geométrica:**
   - **AtlasGR:** Construção baseada em paralelogramos inclinados simetricamente a 60 graus, com kerning e tracking ótico balanceados.
   - **TotalTrac:** Fusão do pin de geolocalização com 3 arcos concêntricos de sinal wi-fi/satélite.
2. **Área de Proteção ($X$):**
   - O perímetro livre obrigatório ao redor do logo equivale à altura total do símbolo ($X$). Nenhum texto, botão ou elemento gráfico pode invadir este espaço.
3. **Limites de Redução Digital:**
   - Símbolo Isolado: mínimo **14 px** (0.5 cm).
   - Logo Principal: mínimo **56 px** (2.0 cm).
   - Versão com Tagline/Assinatura: mínimo **114 px** (4.0 cm).
   - Ícones Mobile: grades fixas de **40 px**, **60 px** e **80 px**.

---

### 3. Paletas Cromáticas Exatas

| Marca | Papel | HEX | RGB | CMYK | Pantone |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **AtlasGR** | Primária (Laranja Atlas) | `#FF5618` | 255, 86, 24 | 0, 84, 100, 0 | 172 C |
| **AtlasGR** | Secundária (Laranja Apoio) | `#FF6B10` | 255, 107, 16 | 0, 75, 100, 0 | 2018 C |
| **AtlasGR** | Secundária (Laranja Médio) | `#FF8008` | 255, 128, 8 | 0, 6, 100, 0 | 151 C |
| **AtlasGR** | Secundária (Amarelo) | `#FFC500` | 255, 197, 0 | 0, 26, 100, 0 | 109 C |
| **AtlasGR** | Neutra (Grafite Dark) | `#333333` | 51, 51, 51 | 73, 67, 65, 80 | 447 C |
| **TotalTrac** | Primária (Azul Médio) | `#008FCE` | 0, 143, 206 | 80, 30, 0, 0 | Medium Blue C |
| **TotalTrac** | Secundária (Azul Primário) | `#374898` | 55, 72, 152 | 90, 75, 0, 0 | 2747 C |
| **TotalTrac** | Secundária (Azul Navy) | `#2D3B78` | 45, 59, 120 | 95, 85, 20, 5 | 2372 C |
| **TotalTrac** | Secundária (Azul Claro) | `#93DBF2` | 147, 219, 242 | 45, 0, 5, 0 | 2975 C |
| **TotalTrac** | Neutra (Azul Noturno) | `#1E2F37` | 30, 47, 55 | 85, 65, 55, 60 | 433 C |

---

### 4. Tipografia & Hierarquia de Textos

- **Contexto AtlasGR:** Família **Mont** (Heavy/Bold para títulos) e **Montserrat** (Regular/Medium para corpo e labels).
- **Contexto TotalTrac:** Família **Fivo Sans** (Heavy/Medium) e **Inter** como fallback web.
- **Escala Modular:**
  - *Display (Hero):* 48px – 64px / Bold 900 / Tracking -0.04em
  - *H1 (Títulos de Página):* 32px / Bold 800 / Tracking -0.03em
  - *H2 (Títulos de Seção/Cards):* 24px / SemiBold 700
  - *H3 (Subtítulos & Modais):* 18px / Medium 600
  - *Corpo (Body Regular):* 16px / Line-height 1.6 / Regular 400
  - *Caption & Overline:* 12px / Monospaced / Uppercase / Tracking 0.1em

---

### 5. Iconografia & Linguagem Visual

- **Stroke:** Espessura padrão de **2px** constante.
- **Geometria:** Cantos levemente arredondados ou chanfrados em 60º na AtlasGR; anéis concêntricos e arcos circulares na TotalTrac.
- **Efeitos de Estado:** Glow neon ativo (`drop-shadow: 0 0 10px var(--neon-glow)`) nos ícones de navegação e indicadores de alerta.
- **Tamanhos Padronizados:**
  - `16x16px`: Badges e tabelas compactas.
  - `24x24px`: Navegação principal, sidebar e botões.
  - `40x40px`: Widgets de métricas e cabeçalhos de destaque.

---

### 6. Tratamento de Fotografia & Imagens

- **AtlasGR (Warm Industrial):** Duotones quentes utilizando sobreposição de Laranja (#FF5618) com pretos profundos (#141110) e gradiente linear em 60º.
- **TotalTrac (Tech Satellite):** Duotones frios em Cyan/Azul (#008FCE para #070D18) com efeito sutil de scanline e visual satelital.
- **Máscaras:** Cortes chanfrados em cantos superiores ou diagonais de 60 graus.

---

### 7. Grafismos, Texturas & Padronagens

- **AtlasGR:** Padrão de linhas diagonais em 60º (`repeating-linear-gradient(60deg, ...)`), remetendo a faixas de pista rodoviária e vetores de velocidade.
- **TotalTrac:** Padrão de ondas de radar concêntricas (`radial-gradient`), remetendo à cobertura de telemetria e pulsos de satélite.

---

### 8. Componentes de UI Kit & Microinterações

- **Botões:**
  - Formato chanfrado cibernético ou cantos de **8px**.
  - Microinteração de escala (`scale: 1.04`), glow intenso ao passar o mouse e feedback auditivo imediato.
- **Cards & Superfícies:**
  - Vidro temperado (*Glassmorphism*): `background: rgba(18, 12, 10, 0.75)`, `backdrop-filter: blur(20px)`.
  - Raio de curvatura padrão de **12px** (`rounded-xl`).
  - Bordas com iluminação neon sutil na cor da marca ativa.
- **Inputs & Formulários:**
  - Fundo escuro com transparência, borda iluminada no foco (`box-shadow: 0 0 15px var(--neon-glow)`).
- **Data Grids & Tabelas:**
  - Cabeçalhos monospaçados, status badges com pulse glow e linhas com hover suave.

---

### 9. Sound Design & Audio UI (Web Audio API)

- **Sucesso (Confirmações/Salvar):** Chime harmônico ascendente duplo (1200Hz ➔ 1800Hz, seno).
- **Clique Tátil (Botões/Tabs):** Pulso neural seco e rápido (800Hz ➔ 100Hz, dente de serra, 80ms).
- **Alerta / Erro (Bloqueios/Exclusão):** Tom grave com decaimento rápido (160Hz ➔ 60Hz, quadrado, 200ms).
- **Warp (Troca de Tema/Tenant):** Varredura de frequência com modulação espacial (300Hz ➔ 1800Hz, triângulo).

---

### 10. Regras de Brand Safety & Usos Incorretos

- ❌ **Nunca** alterar proporções, distorcer ou esticar o logotipo.
- ❌ **Nunca** rotacionar o logo ou alterar os ângulos pré-definidos (60º fixo Atlas).
- ❌ **Nunca** aplicar gradientes livres ou fora da paleta oficial sobre o lettering ou símbolo.
- ❌ **Nunca** aplicar logos positivos sobre fundos escuros sem contraste adequado (mínimo 4.5:1 WCAG AA).
- ✅ **Sempre** utilizar as versões monocromáticas ou negativas (brancas) em fundos fotográficos ou escuros.
