# .agents/runs/

Pasta de evidência de execução. Somente o Agente 00 (Coordenador) escreve aqui; especialistas apenas leem.

Arquivos esperados por execução completa:
- `baseline.md` — resultado do levantamento de baseline na Onda 0.
- `onda-1.md`, `onda-2.md`, `onda-3.md` — relatório de cada onda, no formato descrito em `.agents/prompts/00-coordenador.md` → "Evidências".

Nunca commitar segredo, token, webhook completo ou dado pessoal real nestes relatórios. Use trechos sanitizados (mascarados) quando precisar ilustrar um problema de credencial.
