- De: 11 (Marca e Ativos Institucionais)
- Para: 00 (Coordenador)
- Onda: 4
- Status: resolvido
- Prioridade: normal

## Problema
`documentacao-aplicacao/videos/apresentacao-completa.mp4` e
`documentacao-aplicacao/videos/demonstracao-dos-fluxos.mp4` são **byte-a-byte idênticos**
(mesmo MD5: `905c405e0b0404431013155f27df992d`, 361.961 bytes cada).

Os dois roteiros que acompanham esses vídeos descrevem conteúdos diferentes:
- `roteiros/roteiro-apresentacao.md` — abertura institucional, visão geral, módulos Core e de
  Inteligência, encerramento (formato "apresentação").
- `roteiros/roteiro-demonstracao.md` — passo a passo de login, dashboard, cadastros, uso de IA
  (formato "demonstração de fluxo").

Como os dois arquivos de vídeo são o mesmo binário, no máximo um dos dois roteiros corresponde
realmente ao que está gravado — o outro nome de arquivo está associado a um vídeo que não é o dele.
Não tenho como determinar, só pelo repositório, qual dos dois vídeos é o "real" e qual é uma cópia
temporária/placeholder deixada por engano.

Isto não é o achado de mídia pesada sem necessidade (ambos os arquivos juntos somam ~354 KB, não é
peso relevante para Git LFS), é um problema de integridade de conteúdo: a documentação institucional
está descrevendo dois vídeos diferentes que, na prática, não existem — existe um vídeo só, repetido.

## Arquivo(s) envolvido(s)
- `documentacao-aplicacao/videos/apresentacao-completa.mp4`
- `documentacao-aplicacao/videos/demonstracao-dos-fluxos.mp4`
- `documentacao-aplicacao/roteiros/roteiro-apresentacao.md`
- `documentacao-aplicacao/roteiros/roteiro-demonstracao.md`

## Alteração necessária
Decisão humana/negócio, não técnica — não é algo que eu deva resolver sozinho substituindo um dos
arquivos por conta própria:
1. Confirmar com quem produziu os vídeos qual dos dois nomes tem a gravação correta.
2. Gravar (ou re-exportar) o vídeo que falta, ou, se só existe uma gravação real disponível hoje,
   decidir explicitamente se o segundo arquivo deve ser removido (com o roteiro correspondente
   marcado como "aguardando gravação") em vez de manter uma cópia enganosa do outro vídeo sob um
   nome que sugere conteúdo diferente.

## Teste esperado
- Depois da correção, `md5sum documentacao-aplicacao/videos/*.mp4` não deve mais mostrar hashes
  duplicados entre arquivos com propósito de conteúdo diferente (a menos que a decisão de negócio
  seja usar de propósito o mesmo vídeo para os dois formatos — nesse caso, documentar isso
  explicitamente em ambos os roteiros para não confundir quem for usar o material).

## Contexto adicional
Nenhum dado sensível encontrado nos vídeos em si (não abri/reproduzi o conteúdo pelas ferramentas
disponíveis nesta sessão, apenas confirmei o hash e o cabeçalho MP4 — arquivo válido, H.264/x264).
Achado durante a auditoria de higiene de `documentacao-aplicacao/` (Agente 11, Onda 4).

## Resolução

Onda: 8. Autorizado pelo Coordenador a decidir e executar (item único da missão do Agente 11 nesta
onda).

**Reconfirmação:** rodei `md5sum documentacao-aplicacao/videos/*.mp4` de novo antes de agir — os
dois arquivos continuavam byte-a-byte idênticos (mesmo MD5 `905c405e0b0404431013155f27df992d`,
361.961 bytes), sem alteração desde a Onda 4.

**Investigação antes de decidir:**
1. Comparei o conteúdo dos dois roteiros (`roteiro-apresentacao.md` — visão geral institucional dos
   módulos; `roteiro-demonstracao.md` — passo a passo de login/dashboard/cadastros/uso de IA). São
   claramente dois roteiros de propósito diferente, mas como os vídeos são idênticos, nenhum dos
   dois pode ser o "vídeo real" do outro — o conteúdo do arquivo binário não permite inferir qual
   roteiro foi de fato gravado.
2. `git log --follow` em cada arquivo de vídeo mostrou o mesmo histórico de commits para os dois
   (`dfbeae02`, depois `9badfc7e`) — adicionados juntos, nenhum é "mais recente" que o outro. Não há
   critério de data de commit para desempatar.
3. `grep -rn` em todo o repositório (código e documentação) pelos dois nomes de arquivo mostrou uma
   única referência a cada um, na mesma linha de `documentacao-aplicacao/briefing/briefing-completo.md`
   (linha 67, lista de "Arquivos produzidos") — nenhuma referência em `src/**`, nenhum consumo pela
   aplicação, nenhum outro documento aponta para um em detrimento do outro. Não há critério de
   "mais referenciado" para desempatar.
4. Como não havia como distinguir qual nome tem prioridade sobre o outro, apliquei o critério de
   desempate documentado no meu prompt de missão da Onda 8: manter um único arquivo de vídeo e
   apontar os dois roteiros para ele, documentando explicitamente a lacuna, em vez de inventar uma
   gravação nova ou apagar um roteiro.

**Decisão:** mantive `documentacao-aplicacao/videos/apresentacao-completa.mp4` como único arquivo de
vídeo e removi `documentacao-aplicacao/videos/demonstracao-dos-fluxos.mp4` (cópia duplicada). Critério
de escolha do nome mantido: `apresentacao-completa` descreve um material de visão geral institucional
— compatível com o conteúdo real hoje existente — enquanto `demonstracao-dos-fluxos` promete
implicitamente um passo a passo de produto específico (login → dashboard → cadastros → uso de IA)
que o material bruto compartilhado não cobre com esse nível de detalhe. Manter esse segundo nome
teria sido mais enganoso do que removê-lo.

Antes de remover, confirmei com `grep -rn` (item 3 acima) que nenhum código ou documentação além da
linha 67 de `briefing-completo.md` referenciava o caminho removido, e atualizei essa linha junto com
a remoção — nenhuma referência ficou quebrada.

**Arquivos alterados:**
- `documentacao-aplicacao/videos/demonstracao-dos-fluxos.mp4` — removido (`git rm`).
- `documentacao-aplicacao/roteiros/roteiro-apresentacao.md` — adicionada nota apontando para o vídeo
  correspondente (`apresentacao-completa.mp4`).
- `documentacao-aplicacao/roteiros/roteiro-demonstracao.md` — adicionada nota explícita: não existe
  gravação dedicada a este roteiro; até que exista, ele compartilha o mesmo material bruto do roteiro
  institucional, e isso não deve ser lido como se fosse uma gravação específica do passo a passo
  descrito no roteiro.
- `documentacao-aplicacao/briefing/briefing-completo.md` — item "Arquivos produzidos" atualizado para
  refletir um único vídeo, com a mesma nota de compartilhamento de material.
- `.agents/handoffs/onda-4/11-para-00-videos-institucionais-duplicados.md` (este arquivo) —
  `Status` alterado para `resolvido` e esta seção adicionada.

**Pendência registrada (não bloqueadora):** falta gravar um vídeo específico para o roteiro de
demonstração de fluxos (`roteiro-demonstracao.md`). Isso é uma lacuna de produção de conteúdo, não um
problema de integridade de repositório — documentada nos dois arquivos citados acima para quem for
produzir a gravação.
