# Manual de Identidade Visual e UI/UX - Plataforma AtlasGR

Este documento estabelece as diretrizes de design, interface (UI) e experiência do usuário (UX) para a Plataforma AtlasGR. O objetivo é garantir a melhor experiência e o visual mais moderno e limpo possível, mantendo a consistência com o Manual de Identidade Visual oficial da marca.

## 1. Cores e Tipografia

A paleta de cores deriva das cores institucionais da AtlasGR para transmitir confiança, modernidade e energia.

**Cores UI Principais:**
*   **Ação Primária (Brand):** Laranja Atlas (`#FF5618`). Usado para o botão principal da tela, links ativos e destaques essenciais.
*   **Hover (Ação):** Laranja Apoio (`#FF6B10`).
*   **Fundo da Aplicação (Background):** Cinza super claro (`#F8F9FA` ou `slate-50` do Tailwind) para descansar a vista, destacando os cards brancos. No Dark Mode, Grafite institucional (`#333333`).
*   **Texto Principal:** Grafite institucional (`#333333`). Usado em títulos e corpo de texto.
*   **Texto Secundário/Labels:** Cinza médio (`#666666` ou `gray-500`).
*   **Estados/Feedbacks:**
    *   **Sucesso:** Verde vibrante (`#10B981`).
    *   **Aviso:** Amarelo Institucional (`#FFC500`).
    *   **Erro:** Vermelho sólido (`#EF4444`).

**Tipografia:**
*   **Títulos (H1, H2, H3):** Fonte **Mont** (Heavy/Bold). Traz o peso institucional e moderno da marca.
*   **Corpo de Texto, Labels e Botões:** Fonte **Montserrat** (Regular/Medium/SemiBold). Excelente legibilidade em telas digitais.
*   **Tamanhos Base:**
    *   H1: `32px` (2rem) - Títulos de página
    *   H2: `24px` (1.5rem) - Títulos de sessão/cards
    *   H3: `18px` (1.125rem) - Subtítulos
    *   Corpo Padrão: `14px` (0.875rem) a `16px` (1rem)
    *   Apoio/Legendas: `12px` (0.75rem)

## 2. Formato de Botões e Interações

Os botões devem ser táteis, óbvios e satisfatórios de clicar.

*   **Formato Padrão:** Retangulares com cantos arredondados (`border-radius: 8px`). Esse arredondamento equilibra profissionalismo com uma estética amigável.
*   **Botão Primário:** Fundo `#FF5618`, texto Branco (Montserrat SemiBold `14px`). Sem borda.
*   **Botão Secundário (Apoio):** Fundo Transparente, borda `1px solid #D1D5DB` (cinza), texto Grafite (`#333333`).
*   **Botão Terciário (Ghost):** Apenas texto, sem borda ou fundo padrão. Útil para ações de baixa prioridade como "Cancelar".
*   **Comportamento Hover/Focus:**
    *   Mudança de cor de fundo (ex: `#FF5618` para `#FF6B10`).
    *   Escala sutil: `transform: scale(1.02)` com transição suave (`transition: all 0.2s ease-in-out`).
    *   Sombra: `box-shadow: 0 4px 12px rgba(255, 86, 24, 0.2)` no primário durante hover.

## 3. Cards e Superfícies

Cards são os principais organizadores de informação (dashboards, formulários, listas).

*   **Background:** Branco puro (`#FFFFFF`) para criar contraste com o fundo claro da página.
*   **Bordas:** `1px solid #E5E7EB` (cinza bem claro). Ajudam na delimitação de forma sutil.
*   **Arredondamento:** Cantos arredondados (`border-radius: 12px`). Mais redondos que botões para estabelecer hierarquia visual (o container abraça o conteúdo).
*   **Sombra (Shadow):** Sombra suave e difusa para dar profundidade (`box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05)`). Em *hover* de cards clicáveis, a sombra aumenta.
*   **Espaçamento Interno (Padding):** Amplo para "respiro". Padrão de `24px` (`p-6` no Tailwind). Nunca amontoar informações perto da borda.

## 4. Alinhamento e Espaçamento

O alinhamento dita o fluxo de leitura e a percepção de ordem do sistema.

*   **Grid e Fluxo:** Leitura em F. Alinhamento predominante à **esquerda** (inclusive botões em formulários).
*   **Formulários:** Labels sempre *acima* do campo de input, não à esquerda. Facilita o escaneamento ocular. Inputs com altura generosa (`44px`).
*   **Espaçamento (Whitespace):** Uso pesado de espaços em branco. O espaço vazio separa grupos lógicos de informações de forma natural.
*   **Disposição de Itens (Layout):**
    *   **Navegação Principal:** Sidebar à esquerda, colapsável.
    *   **Ações Globais:** Header superior contendo título da página, Breadcrumbs, Busca e Perfil.
    *   **Ações de Contexto (Página):** Canto superior direito do container principal de conteúdo (ex: botão "Novo Registro").

## 5. Respostas de Som (Audio Feedback)

Para a melhor experiência e sensação "premium", a plataforma deve usar microinterações auditivas não-intrusivas (Audio UI). O som deve ser sutil, com decaimento rápido, e ter volume padrão restrito (máximo 20%). 

**Tipos de Som:**
1.  **Sucesso (Ex: Salvar cadastro):** Um *pop* duplo rápido, levemente agudo e ascendente. Sensação de "tarefa concluída".
2.  **Aviso/Notificação:** Um *chime* (sino) suave e cristalino.
3.  **Erro/Destrutivo (Ex: Falha ao deletar):** Um som grave, curto, abafado. Sugere "barreira".
4.  **Alternância (Toggles):** Um *click* tátil seco.
*Nota de UX:* Sempre deve haver um "toggle" nas configurações para silenciar completamente os sons da plataforma.

## 6. Microinterações e Animações (Motion Design)

A plataforma deve parecer "viva" e responsiva.

*   **Duração:** Transições curtas, no máximo `200ms` a `300ms` (snappy).
*   **Carregamento (Loading):** Skeletons suaves no lugar de spinners para grandes blocos de conteúdo. Mantém o layout fixo.
*   **Modais/Diálogos:** Animação de *fade-in* simultâneo a um leve *scale-up* (ex: 95% para 100%).
*   **Listas e Tabelas:** Ao deletar ou adicionar um item, ele deve encolher/expandir ou deslizar suavemente.

---
Este manual compõe as regras estritas que deverão ser implementadas pelos agentes (02, 03 e 11) no repositório.
