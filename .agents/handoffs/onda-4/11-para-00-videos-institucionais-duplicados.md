- De: 11 (Marca e Ativos Institucionais)
- Para: 00 (Coordenador)
- Onda: 4
- Status: aberto
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
