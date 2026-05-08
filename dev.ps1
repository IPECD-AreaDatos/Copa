# dev.ps1 - Script de desarrollo local para Copa
# Levanta la API (puerto 4000) y el frontend Next.js (puerto 3000)

$root = $PSScriptRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  COPA - Entorno de Desarrollo Local   " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  API     -> http://localhost:4000" -ForegroundColor Green
Write-Host "  Web     -> http://localhost:3000" -ForegroundColor Green
Write-Host ""
Write-Host "Levantando servicios..." -ForegroundColor Yellow
Write-Host ""

# Terminal 1: API Node.js
Start-Process powershell -ArgumentList "-NoExit", "-Command", "
    `$host.UI.RawUI.WindowTitle = 'COPA - API (puerto 4000)';
    Write-Host '[API] Iniciando servidor Node.js...' -ForegroundColor Green;
    Set-Location '$root\apps\api';
    node index.js
"

# Breve pausa para que la API arranque primero
Start-Sleep -Seconds 2

# Terminal 2: Next.js frontend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "
    `$host.UI.RawUI.WindowTitle = 'COPA - Web Next.js (puerto 3000)';
    Write-Host '[WEB] Iniciando Next.js en modo dev...' -ForegroundColor Blue;
    Set-Location '$root\apps\web';
    npm run dev
"

Write-Host "Servicios iniciados. Podés cerrar esta ventana." -ForegroundColor Cyan
Write-Host ""
