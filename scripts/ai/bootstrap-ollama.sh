#!/bin/bash
set -e

echo "=========================================================="
echo "🚀 Central AtlasGR — Bootstrap do Ollama na Nuvem / VPS"
echo "=========================================================="

OLLAMA_CONTAINER="${1:-atlas_ollama}"

echo "⏳ Aguardando container $OLLAMA_CONTAINER iniciar..."
until docker exec "$OLLAMA_CONTAINER" ollama list > /dev/null 2>&1; do
    echo "Aguardando Ollama daemon..."
    sleep 2
done

echo "✅ Ollama online! Baixando modelos para a Central..."

echo "📥 1/3: Baixando DeepSeek R1 (Raciocínio lógico e análise de dados)..."
docker exec "$OLLAMA_CONTAINER" ollama pull deepseek-r1:8b

echo "📥 2/3: Baixando Llama 3.1 (Pitches, Quebra-gelo, Cadência e Resumos)..."
docker exec "$OLLAMA_CONTAINER" ollama pull llama3.1:8b

echo "📥 3/3: Baixando Qwen 2.5 (Estruturação e extração de dados)..."
docker exec "$OLLAMA_CONTAINER" ollama pull qwen2.5:7b

echo "=========================================================="
echo "🎉 Todos os modelos foram configurados com sucesso no Ollama!"
echo "=========================================================="
