#!/bin/bash
set -e

echo "=== AtlasGR: Rollback de Deployment ==="
echo "Este script auxilia no rollback seguro de uma release falha."

# 1. Avisos Prévios
echo ""
echo "[1] Código da Aplicação:"
echo "Reverta a imagem do container ou a branch git para a tag/commit anterior de produção segura."
echo ""

# 2. Status do Prisma
echo "[2] Status do Banco de Dados (Prisma Migrations):"
echo "Verificando status atual das migrations aplicadas..."
npx prisma migrate status

echo ""
echo "Aviso: Prisma não possui 'down migrations' nativas automáticas seguras em produção."
echo "Se a release com falha aplicou migrations indesejadas, você deve:"
echo "  a) Remover a pasta da migration do repositório/código revertido."
echo "  b) Rodar: npx prisma migrate resolve --rolled-back \"nome_da_migration\""
echo "     Isso informará a tabela _prisma_migrations que ela foi removida, porém"
echo "     o schema do banco em si continuará alterado. Se a migration causou quebras,"
echo "     restaure a partir do backup via scripts/restore.sh ou aplique comandos SQL"
echo "     corretivos de drop column/table."

echo ""
echo "Se nenhuma migration foi aplicada (apenas código Node.js causou o incidente):"
echo "  Você pode apenas subir o código antigo com segurança."

echo ""
echo "=== Rollback Completo Finalizado? ==="
echo "Após as correções, não esqueça de conferir a estabilidade pelo painel SRE."
