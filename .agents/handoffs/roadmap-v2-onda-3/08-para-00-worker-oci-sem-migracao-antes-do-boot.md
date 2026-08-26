- De: 08
- Para: 00
- Onda: roadmap-v2-onda-3
- Status: aberto
- Prioridade: normal
## Problema
Auditando o bloqueador prioritário #5 de `/AGENTS.md` ("Deploy capaz de iniciar sem aplicar
migrações") encontrei um gap real no caminho self-hosted OCI (`docker-compose.oci.yml` +
`scripts/deploy-oci.sh`, caminho #3 documentado em `docs/deploy/README.md`):

1. **Serviço `app` (web) — já corrigido nesta rodada, fora deste handoff.** `docker-compose.oci.yml`
   não define `command:` para o serviço `app`, então ele usava o `CMD` padrão do `Dockerfile`
   (`npm run start`, sem migração). `scripts/deploy-oci.sh` sobe todos os containers com
   `docker compose up -d` e só roda `prisma migrate deploy` DEPOIS, num `docker exec` separado
   (linha ~174) — entre o container "up" (o healthcheck de `/health/live` só verifica processo
   vivo) e esse `exec` terminar, a aplicação podia responder tráfego contra schema desatualizado
   ou, num volume novo, sem tabelas. **Corrigi isso no `Dockerfile`** (minha propriedade exclusiva,
   dentro do escopo desta onda): o `CMD` agora é
   `["sh", "-c", "npx prisma migrate deploy && exec npm run start"]` — a imagem migra antes de
   começar a escutar na porta 3000, então o `healthcheck`/Caddy (`depends_on: [app]`) não consegue
   rotear tráfego real até a migração terminar. Isso resolve o caso do serviço `app`, que é quem
   recebe tráfego HTTP de usuário — o risco de maior blast radius.
2. **Serviço `worker` — gap residual, não corrigido, fora do meu escopo de arquivo nesta onda.**
   `docker-compose.oci.yml` define `command: ["npm", "run", "start:worker"]` para o serviço
   `worker` — essa sobrescrita de `command:` ignora o `CMD` da imagem (inclusive minha correção
   acima), então o worker BullMQ pode começar a processar fila contra um schema ainda não migrado
   se subir antes do serviço `app` terminar sua própria migração (nenhum `depends_on` liga `worker`
   a `app`, só a `postgres`/`redis` saudáveis). Blast radius menor que o do `app` (não é tráfego de
   usuário direto, e a maioria dos jobs BullMQ tem retry), mas é o mesmo padrão de risco do
   bloqueador #5. `render.yaml` já trata esse caso corretamente para o serviço worker equivalente:
   `startCommand: npx prisma migrate deploy && npm run start:worker` — o mesmo padrão deveria valer
   aqui.
## Arquivo(s) envolvido(s)
- `docker-compose.oci.yml` (raiz, mas não é o `docker-compose.yml` — este último é minha
  propriedade exclusiva conforme `/AGENTS.md`; o `.oci.yml` não tem dono explícito no roster atual,
  por isso este handoff em vez de eu editar diretamente).
- Comparar com `render.yaml` (padrão já correto, linha do `startCommand` do serviço worker) e com
  `Dockerfile` (correção já aplicada nesta rodada, ver commit desta onda).
## Alteração necessária
Em `docker-compose.oci.yml`, trocar a linha do serviço `worker`:
```yaml
command: ["npm", "run", "start:worker"]
```
por:
```yaml
command: ["sh", "-c", "npx prisma migrate deploy && exec npm run start:worker"]
```
Idempotente e seguro sob execução concorrente com o `app` (Prisma serializa via advisory lock),
então não há problema em ambos os serviços rodarem `migrate deploy` no boot.
## Teste esperado
Com um volume novo (`docker compose -f docker-compose.oci.yml down -v` seguido de
`up -d --build`), confirmar via `docker logs atlasgr_worker` que a migração aparece nos logs do
worker antes de `npm run start:worker` iniciar, e que o worker não lança erro de "relation does
not exist" nos primeiros segundos de vida.
## Contexto adicional
Não é bloqueador desta onda: o achado de maior severidade (serviço `app`, tráfego de usuário) já
foi corrigido dentro do meu escopo de arquivo. Este handoff cobre só o residual do `worker`, que
depende de editar um arquivo sem dono claro no roster — peço ao Coordenador decidir se atribui a
mim (08) numa rodada com escopo de arquivo ampliado, ou a outro agente.
