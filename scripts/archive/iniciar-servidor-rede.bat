@echo off
setlocal enabledelayedexpansion
title Prospector Atlas - Setup de Rede
set PATH=%PATH%;C:\Program Files\nodejs

echo ===================================================
echo   PROSPECTOR ATLAS - CONFIGURACAO DE ACESSO (REDE)
echo ===================================================
echo.
echo Desbloqueando Firewall para a porta 3000 e 5173...

netsh advfirewall firewall add rule name="ProspectorAtlas_Port3000" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1
netsh advfirewall firewall add rule name="ProspectorAtlas_Port5173" dir=in action=allow protocol=TCP localport=5173 >nul 2>&1

if %ERRORLEVEL% EQU 0 (
    echo [OK] Firewall configurado com sucesso.
) else (
    echo [!] AVISO: Execute este arquivo como Administrador para liberar o Firewall.
)

echo.
echo Descobrindo o IP desta maquina na rede...
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address" /c:"Endereo IPv4"') do (
    set IP=%%a
    set IP=!IP: =!
)

if "%IP%"=="" (
    echo [!] Nao foi possivel detectar o IP automaticamente. Use 'localhost'.
    set IP=localhost
)

echo.
echo ===================================================
echo   ACESSO LIBERADO!
echo.
echo   Na maquina local, acesse:
echo   http://localhost:3000/app
echo.
echo   Em OUTROS computadores da rede, acesse:
echo   http://%IP%:3000/app
echo ===================================================
echo.

echo Iniciando o servidor... (Pode demorar um pouco na primeira vez)
echo Pressione Ctrl+C a qualquer momento para desligar.
echo.

:: Roda o servidor
call npm run dev

pause
