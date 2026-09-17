# Zea Play - Quick Start
# This script provides a menu to start backend, frontend, or both

Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     🎮 Zea Play - Quick Start Menu      ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "What would you like to start?" -ForegroundColor Yellow
Write-Host ""
Write-Host "  1️⃣  Backend only (Database + API)" -ForegroundColor Green
Write-Host "  2️⃣  Frontend only (UI)" -ForegroundColor Green
Write-Host "  3️⃣  Both (Recommended)" -ForegroundColor Green
Write-Host "  4️⃣  Exit" -ForegroundColor Red
Write-Host ""

$choice = Read-Host "Enter your choice (1-4)"

switch ($choice) {
    "1" {
        Write-Host ""
        Write-Host "Starting Backend..." -ForegroundColor Cyan
        & "c:\Users\User\Downloads\zea-play 17-02-2026\backend\start-backend.ps1"
    }
    "2" {
        Write-Host ""
        Write-Host "Starting Frontend..." -ForegroundColor Cyan
        & "c:\Users\User\Downloads\zea-play 17-02-2026\frontend\start-frontend.ps1"
    }
    "3" {
        Write-Host ""
        Write-Host "Starting Both Backend and Frontend..." -ForegroundColor Cyan
        Write-Host ""
        Write-Host "⚠️  Note: This will open two separate terminal windows." -ForegroundColor Yellow
        Write-Host "   - One for Backend (API)" -ForegroundColor Gray
        Write-Host "   - One for Frontend (UI)" -ForegroundColor Gray
        Write-Host ""
        
        # Start backend in new window
        Start-Process powershell -ArgumentList "-NoExit", "-File", "c:\Users\User\Downloads\zea-play 17-02-2026\backend\start-backend.ps1"
        
        # Wait a bit for backend to start
        Start-Sleep -Seconds 3
        
        # Start frontend in new window
        Start-Process powershell -ArgumentList "-NoExit", "-File", "c:\Users\User\Downloads\zea-play 17-02-2026\frontend\start-frontend.ps1"
        
        Write-Host "✅ Both servers are starting in separate windows!" -ForegroundColor Green
        Write-Host ""
        Write-Host "📝 Access your application:" -ForegroundColor Cyan
        Write-Host "   Frontend: http://localhost:5173" -ForegroundColor Green
        Write-Host "   Backend API: http://localhost:8000" -ForegroundColor Green
        Write-Host "   API Docs: http://localhost:8000/docs" -ForegroundColor Green
        Write-Host ""
        Write-Host "🔐 Login with:" -ForegroundColor Cyan
        Write-Host "   Email: owner@example.com" -ForegroundColor Yellow
        Write-Host "   Password: password123" -ForegroundColor Yellow
        Write-Host ""
    }
    "4" {
        Write-Host ""
        Write-Host "👋 Goodbye!" -ForegroundColor Cyan
        exit 0
    }
    default {
        Write-Host ""
        Write-Host "❌ Invalid choice. Please run the script again." -ForegroundColor Red
        exit 1
    }
}
