@echo off
setlocal

cd /d "%~dp0"

echo ============================================
echo   AtlasGR - Prospector
echo   Iniciando servidor local na rede
echo ============================================
echo.

docker info >nul 2>&1
if not errorlevel 1 goto docker_ready

echo Docker nao esta rodando. Iniciando Docker Desktop...
start "" "C:\Users\%USERNAME%\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe"
echo Aguardando o Docker ficar pronto - pode levar 1 a 2 minutos...

:wait_docker
timeout /t 5 >nul
echo   ainda aguardando o Docker...
docker info >nul 2>&1
if errorlevel 1 goto wait_docker

:docker_ready
echo Docker pronto.
echo.

docker ps --filter "name=atlas_postgres" --filter "status=running" --format "{{.Names}}" | findstr /I "atlas_postgres" >nul
if not errorlevel 1 (
    echo Containers ja estao rodando, pulando docker compose up.
    goto containers_ready
)

echo Subindo banco de dados, redis e meilisearch...
docker compose up -d
if errorlevel 1 (
    echo.
    echo [ERRO] Falha ao subir os containers do Docker. Verifique o Docker Desktop.
    pause
    exit /b 1
)

:containers_ready

echo.
echo ============================================
echo   Servidor iniciando em:
echo     - Neste PC:  http://localhost:3005
echo     - Na rede:   http://192.168.60.217:3005
echo   Outras maquinas da rede acessam pelo segundo link.
echo.
echo   Para PARAR o servidor: feche esta janela ou aperte Ctrl+C
echo ============================================
echo.

call npm run dev

echo.
echo Servidor encerrado.
pause
