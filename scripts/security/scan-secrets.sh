#!/usr/bin/env bash
# scripts/security/scan-secrets.sh
#
# Varredura local de segredo versionado — roda ANTES do commit, no worktree do próprio agente,
# não só depois do push no CI (ver AGENTS.md -> "Segurança e higiene" e
# .agents/prompts/15-seguranca-aplicada.md -> "2. Varredura de segredo ligada ao gate").
#
# Estratégia em duas camadas, nesta ordem:
#   1. gitleaks, se disponível (binário local OU via docker) — mesma ferramenta usada no CI
#      (.github/workflows/ci.yml), mesma config (.gitleaks.toml se existir, senão a config
#      default do gitleaks).
#   2. Fallback embutido (grep por padrões de alto sinal) quando gitleaks não está disponível
#      neste ambiente — para nunca deixar o agente sem varredura só porque a ferramenta externa
#      não está instalada. O fallback é deliberadamente mais estreito (menos falso-positivo,
#      também menos cobertura) que o gitleaks real: ele NÃO substitui o gate de CI, só dá uma
#      rede de segurança local antes do commit.
#
# Uso:
#   scripts/security/scan-secrets.sh              # varre o working tree (arquivos staged + unstaged rastreados)
#   scripts/security/scan-secrets.sh --staged      # varre só o que está staged (git add), para rodar em pre-commit
#   scripts/security/scan-secrets.sh <arquivo...>  # varre arquivo(s) específico(s), staged ou não
#
# Saída: exit 0 se nada suspeito for encontrado, exit 1 (ou o exit code do gitleaks) se algo for
# encontrado. Nunca trate exit != 0 deste script como falha de ambiente — trate como achado real
# a investigar antes de commitar (ver "Mentira mais provável do seu domínio" no prompt do Agente 15).

set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [[ -z "$REPO_ROOT" ]]; then
    echo "scan-secrets: não está dentro de um repositório git." >&2
    exit 2
fi
cd "$REPO_ROOT"

MODE="worktree"
FILES=()
for arg in "$@"; do
    case "$arg" in
        --staged) MODE="staged" ;;
        *) FILES+=("$arg") ;;
    esac
done

GITLEAKS_CONFIG=""
[[ -f "$REPO_ROOT/.gitleaks.toml" ]] && GITLEAKS_CONFIG="--config=$REPO_ROOT/.gitleaks.toml"

run_gitleaks_bin() {
    local bin="$1"
    if [[ "$MODE" == "staged" ]]; then
        "$bin" protect --staged --source="$REPO_ROOT" --no-banner $GITLEAKS_CONFIG
    else
        "$bin" detect --no-git -s "$REPO_ROOT" --no-banner $GITLEAKS_CONFIG
    fi
}

# gitleaks (binário ou docker) só é usado nos modos "worktree"/"staged", que varrem o repositório
# inteiro/staged area — é o caminho preferido, mesma ferramenta e (quando existir) mesma config do
# CI. Quando arquivo(s) específico(s) são passados como argumento (ex.: um arquivo de teste
# temporário para validar o próprio script), usamos direto o fallback embutido abaixo: é
# determinístico, não depende de rede/pull de imagem, e é exatamente o caso de uso "valide que o
# script pega um segredo plantado".
# git worktrees (ver AGENTS.md -> "Isolamento de execução") têm .git como arquivo-ponteiro para o
# repositório principal fora deste diretório — montar só $REPO_ROOT no docker quebra a leitura do
# git dentro do container. Nesse caso pulamos direto para o fallback embutido, que já resolve a
# lista de arquivos via `git` no HOST (fora do container) antes de varrer conteúdo.
IS_LINKED_WORKTREE=0
if [[ -f "$REPO_ROOT/.git" ]]; then
    IS_LINKED_WORKTREE=1
fi

if [[ ${#FILES[@]} -eq 0 && $IS_LINKED_WORKTREE -eq 0 ]]; then
    if command -v gitleaks >/dev/null 2>&1; then
        echo "scan-secrets: usando gitleaks local ($(command -v gitleaks))."
        run_gitleaks_bin gitleaks
        exit $?
    fi

    if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
        echo "scan-secrets: gitleaks não instalado localmente — tentando via docker."
        if [[ "$MODE" == "staged" ]]; then
            docker run --rm -v "$REPO_ROOT:/repo" zricethezav/gitleaks:latest protect --staged --source=/repo --no-banner 2>&1
            rc=$?
        else
            docker run --rm -v "$REPO_ROOT:/repo" zricethezav/gitleaks:latest detect --no-git -s /repo --no-banner 2>&1
            rc=$?
        fi
        if [[ $rc -ne 127 ]]; then
            # 127 normalmente indica falha de pull/rede do docker, não achado do gitleaks — nesse
            # caso caímos no fallback abaixo em vez de reportar sucesso falso.
            exit $rc
        fi
        echo "scan-secrets: docker indisponível para gitleaks (rede/imagem) — caindo para o fallback embutido." >&2
    fi
fi

echo "scan-secrets: gitleaks indisponível neste ambiente (nem binário, nem docker) — usando fallback embutido (grep de padrões de alto sinal)." >&2

# ── Fallback embutido ──────────────────────────────────────────────────────────────────────────
# Lista de arquivos a varrer.
if [[ ${#FILES[@]} -eq 0 ]]; then
    if [[ "$MODE" == "staged" ]]; then
        mapfile -t FILES < <(git diff --cached --name-only --diff-filter=ACM)
    else
        mapfile -t FILES < <(git ls-files --cached --others --exclude-standard)
    fi
fi

# Padrões de alto sinal: chaves/tokens de provedores conhecidos deste projeto + padrões genéricos
# de segredo (AWS, JWT privado, string de conexão com credencial embutida, atribuição de variável
# que parece token/secret/key/password com valor não-vazio e não-placeholder).
PATTERNS=(
    'AKIA[0-9A-Z]{16}'                                   # AWS access key id
    '-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'
    'sk-[A-Za-z0-9]{20,}'                                 # chave estilo OpenAI/Anthropic/Bland
    'xox[baprs]-[A-Za-z0-9-]{10,}'                        # Slack token
    'ghp_[A-Za-z0-9]{36}'                                 # GitHub PAT
    'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}' # JWT
    '(BITRIX24_WEBHOOK_URL|TOTALTRAC_BITRIX24_WEBHOOK_URL)\s*=\s*.+/rest/[0-9]+/[A-Za-z0-9]{10,}'
    '(BLAND_API_KEY|API_KEY|SECRET|TOKEN|PASSWORD)\s*[:=]\s*["'"'"']?[A-Za-z0-9_\-\/\.]{16,}["'"'"']?'
)

# Padrão à parte para "user:senha embutido em URL" — exclui hosts de dev/CI conhecidos deste
# projeto (localhost, serviços do docker-compose local, valores placeholder de exemplo) para não
# afogar o sinal real em ruído de `.env.example`/docker-compose/CI já documentados como não-segredo.
URL_CRED_PATTERN='://[A-Za-z0-9._%+-]+:[^/@[:space:]]{6,}@'
URL_CRED_ALLOWLIST='@(localhost|127\.0\.0\.1|postgres|db-host|db|clickhouse|redis)([:/]|$)'

FOUND=0
for f in "${FILES[@]}"; do
    [[ -f "$f" ]] || continue
    # Nunca varre binário/dump — ver achado conhecido de backups/*.dump; eles são bloqueados por
    # regra própria abaixo (presença do arquivo, não conteúdo).
    case "$f" in
        *.dump|*.png|*.jpg|*.jpeg|*.gif|*.pdf|*.woff*|*.ttf|node_modules/*|dist/*|.git/*) continue ;;
    esac
    for pat in "${PATTERNS[@]}"; do
        if grep -EnI "$pat" -- "$f" 2>/dev/null | grep -vE '\.example[:=]|__PLACEHOLDER__|xxxxxxxx|<.*>|process\.env\.' >/tmp/scan-secrets-hit.$$ ; then
            if [[ -s /tmp/scan-secrets-hit.$$ ]]; then
                echo "POTENCIAL SEGREDO em $f:"
                sed 's/^/    /' /tmp/scan-secrets-hit.$$
                FOUND=1
            fi
        fi
        rm -f /tmp/scan-secrets-hit.$$
    done

    # user:senha embutido em URL — só sinaliza quando o host NÃO é um serviço local/dev/CI já
    # documentado como não-segredo neste repositório.
    if grep -EnI "$URL_CRED_PATTERN" -- "$f" 2>/dev/null | grep -vEi "$URL_CRED_ALLOWLIST" >/tmp/scan-secrets-hit.$$ ; then
        if [[ -s /tmp/scan-secrets-hit.$$ ]]; then
            echo "POTENCIAL SEGREDO em $f:"
            sed 's/^/    /' /tmp/scan-secrets-hit.$$
            FOUND=1
        fi
    fi
    rm -f /tmp/scan-secrets-hit.$$
done

# Bloqueador dedicado, independente de conteúdo: dump/backup de banco nunca deveria estar
# rastreado (achado conhecido — AGENTS.md -> "Segurança e higiene").
while IFS= read -r f; do
    echo "DUMP/BACKUP DE BANCO RASTREADO: $f (proibido — ver AGENTS.md > Segurança e higiene)"
    FOUND=1
done < <(printf '%s\n' "${FILES[@]}" | grep -E '^backups/.*\.dump$' || true)

if [[ $FOUND -eq 1 ]]; then
    echo "scan-secrets: achado(s) acima — NÃO faça commit até investigar e sanitizar." >&2
    exit 1
fi

echo "scan-secrets: nenhum padrão de alto sinal encontrado (fallback embutido)."
exit 0
