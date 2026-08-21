# Manual de Identidade Visual e UI/UX - Multi-Tenant (AtlasGR & TotalTrac)

Este documento estabelece as diretrizes globais de design, interface (UI) e experiência do usuário (UX) para a Plataforma centralizada. O objetivo é unir o **melhor dos dois mundos**, garantindo uma experiência premium, moderna e limpa, que se adapta automaticamente à marca do tenant ativo (AtlasGR ou TotalTrac).

## 1. O Conceito Multi-Tenant (Dual-Brand)

A plataforma utiliza uma arquitetura visual baseada em **Design Tokens dinâmicos**. Isso significa que as formas (raios de borda), sombras, espaçamentos e microinterações são padronizadas para garantir a melhor UX possível, enquanto **Cores e Tipografia** alternam de acordo com o contexto do usuário.

## 2. Cores e Temas

A aplicação alterna suas cores base injetando um atributo no HTML (ex: `data-brand="totaltrac"`).

**Paleta AtlasGR (Energia, Inovação, Alerta):**
*   **Ação Primária:** Laranja Atlas (`#FF5618`).
*   **Hover/Accent:** Laranja Apoio (`#FF6B10`) e Amarelo (`#FFC500`).
*   **Texto/Dark:** Grafite Institucional (`#333333`).

**Paleta TotalTrac (Confiança, Segurança, Tecnologia):**
*   **Ação Primária:** Azul Médio TotalTrac (`#008FCE`).
*   **Hover/Accent:** Azul Escuro / Navy (`#2D3B78` ou `#374898`).
*   **Texto/Dark:** Azul Marinho Profundo (`#1E2F37`).

**Cores Neutras Globais (Ambos os mundos):**
*   **Fundo da Aplicação:** Cinza super claro (`#F8F9FA`).
*   **Superfície dos Cards:** Branco Puro (`#FFFFFF`).
*   **Bordas:** Cinza suave (`#E5E7EB`).

## 3. Tipografia Adaptável

A voz da marca muda conforme o contexto, mas a legibilidade premium é mantida.
*   **Contexto AtlasGR:**
    *   Títulos: **Mont** (Heavy/Bold)
    *   Corpo e Botões: **Montserrat** (Medium/SemiBold)
*   **Contexto TotalTrac:**
    *   Títulos e Corpo: **Fivo Sans** (Heavy para títulos, Regular/Medium para corpo).

*Regra de Ouro UX:* O tamanho base da fonte (16px) e as proporções (H1: 32px, H2: 24px) permanecem estritamente iguais para ambas as marcas, evitando quebras de layout ao alternar entre as empresas.

## 4. O Melhor do Formato: Botões e Cards

Em vez de ter botões diferentes para cada marca, unimos a geometria que mais agrada os usuários modernos:

*   **Botões:** Retangulares com **cantos arredondados (8px / `rounded-lg`)**. Eles usam a cor primária dinâmica da marca ativa. 
    *   *Microinteração unificada:* Ao passar o mouse (Hover), o botão cresce sutilmente (`scale: 1.02`) e emite uma sombra macia baseada na cor primária (Laranja ou Azul).
*   **Cards:** 
    *   Cantos arredondados **(12px / `rounded-xl`)**, criando um contêiner amigável que "abraça" a informação.
    *   **Sombra (Shadow):** Sombra difusa e elegante (`0 4px 6px -1px rgba(0,0,0,0.05)`).
    *   Para dar um toque especial de cada marca, cards de destaque podem ter uma barra colorida no topo (Accent Bar) usando o gradiente de cada marca.

## 5. Alinhamento, Espaçamento e UX

*   **Leitura Fluida:** Alinhamento de textos e formulários predominantemente à esquerda.
*   **Respiro (Whitespace):** Padding generoso de `24px` nos cards. A clareza visual é o principal trunfo da união dessas marcas.
*   **Navegação Inteligente:** Sidebar escura (Grafite ou Navy, dependendo do tenant), contrastando com o fundo claro da área de trabalho.

## 6. Microinterações e Áudio UI

A experiência multissensorial é idêntica para ambos, garantindo o "Premium Feel":
1.  **Sucesso:** Um *pop* duplo rápido e agudo.
2.  **Aviso/Notificação:** Som de sino (chime) suave.
3.  **Erro/Destrutivo:** Som grave e curto.
4.  **Animações:** Transições de 200ms-300ms, *fade-in* suave ao abrir modais e skeletons dinâmicos durante o carregamento de dados.

---
**Conclusão:** Ao padronizar as formas e a matemática do design (espaços, sombras e animações) e manter dinâmicas as cores e as tipografias, a plataforma consegue acomodar a **AtlasGR** e a **TotalTrac** simultaneamente, entregando a melhor performance e a experiência mais coesa possível.
