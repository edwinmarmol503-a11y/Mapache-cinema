@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
    "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" scripts\play-server.mjs
    exit /b
  )
  echo Necesitas Node.js para abrir la copia descargada. Descarga: https://nodejs.org/
  pause
  exit /b 1
)
node scripts\play-server.mjs
pause
