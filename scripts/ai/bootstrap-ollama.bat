@echo off
echo ==========================================================
echo  Central AtlasGR -- Bootstrap do Ollama no Windows
echo ==========================================================

set OLLAMA_CONTAINER=atlas_ollama

echo Aguardando container %OLLAMA_CONTAINER%...
docker exec %OLLAMA_CONTAINER% ollama list >nul 2>&1
if %errorlevel% neq 0 (
    echo Container %OLLAMA_CONTAINER% nao esta rodando. Verifique o docker-compose up.
    exit /b 1
)

echo [1/3] Baixando DeepSeek R1...
docker exec %OLLAMA_CONTAINER% ollama pull deepseek-r1:8b

echo [2/3] Baixando Llama 3.1...
docker exec %OLLAMA_CONTAINER% ollama pull llama3.1:8b

echo [3/3] Baixando Qwen 2.5...
docker exec %OLLAMA_CONTAINER% ollama pull qwen2.5:7b

echo ==========================================================
echo  Modelos configurados com sucesso!
echo ==========================================================
