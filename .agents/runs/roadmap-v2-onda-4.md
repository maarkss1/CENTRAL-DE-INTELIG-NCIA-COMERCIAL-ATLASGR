# Roadmap v2 — Onda 4 — Extensões (Mobile, Infraestrutura, Marca)

- **SHA base:** `599668b2de111758faa620fc6eb64a1de2787ca6` (`origin/main`)
- **Data/hora (UTC):** 2026-08-26
- **Branch de integração:** `integracao/roadmap-v2-onda-4`
- **Decisão:** disparada antes de `RELEASE APPROVED` formal nas Ondas 1-3 (ainda em execução), com
  base em `/AGENTS.md` → Onda 4: "nenhuma delas depende de bloqueador das Ondas 1-3". Propriedade
  de arquivo (`android/**`+`capacitor.config.ts`; `k8s/**`+`argocd/**`+`charts/**`+`infrastructure/**`;
  `identidade-visual/**`+`documentacao-aplicacao/**`) é disjunta de tudo que está rodando nas
  Ondas 1-3 — inclusive do `Dockerfile`/workflows que 08 já tocou na Onda 3 (10 não edita
  `Dockerfile`, que é exclusivo de 08).

## 1. Escopo (Freeze de escopo em vigor)

Mesmo regime das ondas anteriores: auditoria fail-closed com correção no próprio escopo, sem
feature nova.

## 2. Especialistas e matriz de propriedade

| Agente | Missão | Pastas/arquivos de propriedade |
|---|---|---|
| 09 — Mobile (Capacitor/Android) | Auditar o build Android/Capacitor quanto a configuração real vs. aspiracional, permissões nativas excessivas, e deep link/navegação mobile quebrada. | `android/**`, `capacitor.config.ts` |
| 10 — Infraestrutura, Observabilidade e SRE | Auditar manifests k8s/Helm/ArgoCD quanto a probes de saúde reais, `resources.limits`, e paridade com o `docker-compose.oci.yml`/migration-job já corrigidos na Onda 3 (não retrabalhar isso, só confirmar consistência). | `k8s/**`, `argocd/**`, `charts/**`, `infrastructure/**` |
| 11 — Marca e Ativos Institucionais | Auditar consistência de tokens/ativos de marca entre `identidade-visual/{atlasgr,totaltrac}/` e o que `src/styles/globals.css` (dono: 03) realmente consome — divergência de cor/token é handoff para 03, não edição direta. | `identidade-visual/**`, `documentacao-aplicacao/**` |

Nenhuma sobreposição com as Ondas 1-3 (04,05,07,03,08,01,02,06) em execução.

## 3. Gate mínimo

Igual ao gate mínimo já descrito em `.agents/runs/roadmap-v2-onda-2.md`, seção 4.

## 4. Status

Onda disparada nesta data. Relatório final de integração será registrado em atualização deste
mesmo arquivo.
