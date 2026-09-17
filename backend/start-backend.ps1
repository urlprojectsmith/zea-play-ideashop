# Zea Play - Start Backend Server
# This script initializes the database and starts the backend

Write-Host "🚀 Starting Zea Play Backend..." -ForegroundColor Cyan
Write-Host ""

# Navigate to backend directory
$backendPath = "c:\Users\USER\Downloads\zea-play 23-02-2026 (3)\backend"
Set-Location $backendPath

Write-Host "Current directory: $backendPath" -ForegroundColor Yellow
Write-Host ""

# Check if virtual environment exists
if (Test-Path ".\venv\Scripts\Activate.ps1") {
    Write-Host "Activating virtual environment..." -ForegroundColor Green
    & ".\venv\Scripts\Activate.ps1"
} else {
    Write-Host "No virtual environment found. Using global Python." -ForegroundColor Yellow
    Write-Host "Consider creating one with: python -m venv venv" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Initializing database and seeding data..." -ForegroundColor Cyan
python init_db.py

if ($LASTEXITCODE -eq 0) {
    Write-Host "Database initialized successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Starting backend server..." -ForegroundColor Cyan
    Write-Host "API will be available at: http://127.0.0.1:8000" -ForegroundColor Gray
    Write-Host "API Docs: http://127.0.0.1:8000/docs" -ForegroundColor Gray
    Write-Host ""
    uvicorn app.main:app --reload
} else {
    Write-Host "Database initialization failed!" -ForegroundColor Red
    Write-Host "Please check your database connection in .env file" -ForegroundColor Yellow
    exit 1
}
