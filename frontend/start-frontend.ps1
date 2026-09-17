# Zea Play - Start Frontend Server
# This script starts the frontend development server

Write-Host "🚀 Starting Zea Play Frontend..." -ForegroundColor Cyan
Write-Host ""

# Navigate to frontend directory
$frontendPath = "c:\Users\USER\Downloads\zea-play 23-02-2026 (3)\frontend"
Set-Location $frontendPath

Write-Host "Current directory: $frontendPath" -ForegroundColor Yellow
Write-Host ""

# Check if node_modules exists
if (-not (Test-Path ".\node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Green
    npm install
    Write-Host ""
}

# Create .env.local for local development if it doesn't exist
if (-not (Test-Path ".\.env.local")) {
    Write-Host "Creating .env.local for local development..." -ForegroundColor Green
    "VITE_API_BASE_URL=http://localhost:8000" | Out-File -FilePath ".\.env.local" -Encoding utf8
    Write-Host "Created .env.local pointing to local backend" -ForegroundColor Green
    Write-Host ""
}

Write-Host "Starting frontend development server..." -ForegroundColor Cyan
Write-Host "Frontend will be available at: http://localhost:5173" -ForegroundColor Gray
Write-Host ""
npm run dev
