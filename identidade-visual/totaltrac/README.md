# Total Trac - pack de identidade visual

Este diretório reúne os arquivos e regras identificados no **Manual de Identidade Visual - Total Trac, versão 1.0, 2026**. Os PNGs de logo foram extraídos em alta resolução diretamente das pranchas oficiais do manual e têm fundo transparente.

## Uso rápido

- Assinatura principal com tagline: `logos/totaltrac-logo-principal-positivo.png`.
- Assinatura sem tagline: `logos/totaltrac-logo-sem-tagline-positivo.png`.
- Assinatura vertical: `logos/totaltrac-logo-vertical-positivo.png`.
- Avatar, favicon ou app: `icones/totaltrac-simbolo-positivo.png` ou os ícones quadrados.
- Para fundo escuro, escolha a variante cujo nome começa com `negativo-` e corresponde à cor de fundo.
- Importe `tokens/totaltrac.css` ou use os objetos em JSON/TypeScript.

## Nomenclatura dos arquivos

- `positivo`: cores institucionais sobre fundo branco.
- `sobre-azul-claro`: cores institucionais previstas para `#93DBF2`.
- `sobre-ciano`: versão clara prevista para `#008FCE`.
- `negativo-azul`: versão clara prevista para `#374898`.
- `negativo-azul-escuro`: versão clara prevista para `#2D3B78`.
- `negativo-grafite`: versão clara prevista para `#1E2F37`.

Os arquivos são transparentes: o nome registra o fundo para o qual a combinação de cores foi aprovada. Aplique o fundo no layout, não dentro da imagem.

## Paleta oficial

| Papel | Cor | HEX | RGB | CMYK | Pantone |
| --- | --- | --- | --- | --- | --- |
| Primária | Azul | `#374898` | 55, 72, 152 | 90, 75, 0, 0 | 2747 C |
| Primária | Ciano | `#008FCE` | 0, 143, 206 | 80, 30, 0, 0 | Medium Blue C |
| Secundária | Azul profundo | `#2D3B78` | 45, 59, 120 | 95, 85, 20, 5 | 2372 C |
| Secundária | Grafite azulado | `#1E2F37` | 30, 47, 55 | 85, 65, 55, 60 | 433 C |
| Secundária | Azul claro | `#93DBF2` | 147, 219, 242 | 45, 0, 5, 0 | 2975 C |
| Secundária | Branco | `#FFFFFF` | 255, 255, 255 | 0, 0, 0, 0 | - |

## Tipografia

- Família: **Fivo Sans**.
- Heavy: títulos grandes.
- Medium: subtítulos.
- Regular: textos longos e web.
- O manual também apresenta Bold e Black como pesos da família.
- Consulte `fontes/README.md` antes de adicionar binários ao repositório.

## Regras do logo

- Área de proteção: o módulo `X` equivale à altura do símbolo. Preserve pelo menos um `X` entre a marca e qualquer elemento externo.
- Redução mínima por largura: principal com tagline `140 px / 50 mm`; sem tagline `110 px / 40 mm`; vertical `70 px / 25 mm`; símbolo `20 px / 6 mm`.
- Para fundos fora da paleta, use versão positiva, negativa ou monocromática com contraste suficiente.
- Em fotografia, use versão positiva, negativa ou monocromática e ajuste a composição do fundo para maximizar o contraste; não altere a marca.

## Nunca faça

- Não distorça, comprima, estique ou reflita.
- Não rotacione.
- Não remova nem reposicione elementos.
- Não aplique filtros ou efeitos.
- Não altere cores, diagramação ou proporções.
- Não aplique sobre fundo sem contraste.

## Conteúdo do pack

- `logos/`: assinaturas principal, sem tagline e vertical; versões claras, escuras e monocromáticas.
- `icones/`: símbolo oficial e ícones quadrados de 20 a 512 px.
- `padroes/`: grafismo de anéis e padrão de símbolos.
- `tokens/`: variáveis CSS e objetos JSON/TypeScript.
- `fontes/`: orientação de aquisição e licenciamento.
- `preview.html`: prancha local de conferência.

## Referência no manual

- Relação símbolo/serviço: página 6.
- Cores: páginas 7-8.
- Tipografia: páginas 9-10.
- Assinaturas do logo: páginas 11-15.
- Proteção e redução: páginas 16-17.
- Versões e usos incorretos: páginas 18-25.
- Elementos gráficos: páginas 26-27.

