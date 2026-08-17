#!/bin/bash
# FIN-0001: Higienização Definitiva de Dados no Histórico Git
# Este script utiliza o git-filter-repo para remover todos os arquivos .dump e .sql do histórico
# da pasta backups/, eliminando dados PII reais vazados em commits iniciais.

set -e

echo "=== AtlasGR Central de Inteligência Comercial ==="
echo "Iniciando processo de expurgo de backups do histórico Git."
echo "ATENÇÃO: Isso reescreverá todos os commits que possuíam os arquivos."
echo "Coordenar com o time para que todos façam clone limpo após o force push."
echo ""

if ! command -v git-filter-repo &> /dev/null; then
    echo "Erro: git-filter-repo não encontrado."
    echo "Instale com: pip install git-filter-repo"
    exit 1
fi

echo "Iniciando expurgo (isso pode demorar alguns minutos)..."

# Remove todos os arquivos .dump e .sql de qualquer caminho do histórico
git filter-repo --path-glob '*.dump' --path-glob '*.sql' --invert-paths

echo "Expurgo local finalizado com sucesso."
echo ""
echo "PRÓXIMO PASSO OBRIGATÓRIO:"
echo "Verifique o histórico com: git log --all --stat"
echo "Se estiver tudo correto, force o push para a origem:"
echo "git push origin --force --all"
echo "git push origin --force --tags"
echo ""
echo "Aviso: NUNCA tente fazer 'git pull' no antigo repositório local. Apague a pasta e faça clone novamente."
