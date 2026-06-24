param(
    [string]$DownloadsPath = "$env:USERPROFILE\Downloads",
    [string]$ProjectPath = "$env:USERPROFILE\workspace\farm-digital-twin"
)

Write-Host "Farm Digital Twin - Applying Updates" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green

$files = @{
    "DeviceConfigDialog.tsx"  = "src\components\DeviceConfigDialog.tsx"
    "DeviceConfigDialog2.tsx" = "src\components\DeviceConfigDialog.tsx"
    "MapView.tsx"             = "src\components\MapView.tsx"
    "MapView2.tsx"            = "src\components\MapView.tsx"
    "App.tsx"                 = "src\App.tsx"
    "App2.tsx"                = "src\App.tsx"
    "TankElm.ts"              = "src\sim\TankElm.ts"
    "TankElm2.ts"             = "src\sim\TankElm.ts"
    "PumpElm.ts"              = "src\sim\PumpElm.ts"
    "PumpElm2.ts"             = "src\sim\PumpElm.ts"
    "ElementRegistry.ts"      = "src\sim\ElementRegistry.ts"
    "ElementRegistry2.ts"     = "src\sim\ElementRegistry.ts"
    "BlockConfigDialog.tsx"   = "src\components\BlockConfigDialog.tsx"
    "BlockConfigDialog2.tsx"  = "src\components\BlockConfigDialog.tsx"
    "ConnectionValidator.ts"  = "src\sim\ConnectionValidator.ts"
    "ConnectionValidator2.ts" = "src\sim\ConnectionValidator.ts"
    "DeviceFingerprint.ts"    = "src\sim\DeviceFingerprint.ts"
    "DeviceFingerprint2.ts"   = "src\sim\DeviceFingerprint.ts"
    "BlockData.ts"            = "src\sim\BlockData.ts"
    "BlockData2.ts"           = "src\sim\BlockData.ts"
    "ContextMenu.tsx"         = "src\components\ContextMenu.tsx"
    "ContextMenu2.tsx"        = "src\components\ContextMenu.tsx"
    "ValidationToast.tsx"     = "src\components\ValidationToast.tsx"
    "ValidationToast2.tsx"    = "src\components\ValidationToast.tsx"
}

$copied = 0
foreach ($download in $files.Keys) {
    $src = Join-Path $DownloadsPath $download
    $dst = Join-Path $ProjectPath $files[$download]
    if (Test-Path $src) {
        Copy-Item $src $dst -Force
        Write-Host "  OK: $download -> $($files[$download])" -ForegroundColor Cyan
        $copied++
    }
}

if ($copied -eq 0) {
    Write-Host "  No update files found in Downloads." -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "$copied file(s) copied. Committing..." -ForegroundColor Green
    Set-Location $ProjectPath
    git add .
    git commit -m "Apply updates"
    git push
    Write-Host ""
    Write-Host "Done! Starting server..." -ForegroundColor Green
    npm run dev
}
