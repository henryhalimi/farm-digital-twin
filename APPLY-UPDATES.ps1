param(
    [string]$DownloadsPath = "$env:USERPROFILE\Downloads",
    [string]$ProjectPath = "$env:USERPROFILE\workspace\farm-digital-twin"
)

Write-Host "Farm Digital Twin - Applying Updates" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green

$destMap = @{
    "DeviceConfigDialog.tsx"  = "src\components\DeviceConfigDialog.tsx"
    "MapView.tsx"             = "src\components\MapView.tsx"
    "App.tsx"                 = "src\App.tsx"
    "TankElm.ts"              = "src\sim\TankElm.ts"
    "PumpElm.ts"              = "src\sim\PumpElm.ts"
    "PipeElm.ts"              = "src\sim\PipeElm.ts"
    "ValveElm.ts"             = "src\sim\ValveElm.ts"
    "LumoValveElm.ts"         = "src\sim\LumoValveElm.ts"
    "ManifoldElm.ts"          = "src\sim\ManifoldElm.ts"
    "FilterElm.ts"            = "src\sim\FilterElm.ts"
    "PRVElm.ts"               = "src\sim\PRVElm.ts"
    "BoosterPumpElm.ts"       = "src\sim\BoosterPumpElm.ts"
    "ElementRegistry.ts"      = "src\sim\ElementRegistry.ts"
    "BlockConfigDialog.tsx"   = "src\components\BlockConfigDialog.tsx"
    "ConnectionValidator.ts"  = "src\sim\ConnectionValidator.ts"
    "DeviceFingerprint.ts"    = "src\sim\DeviceFingerprint.ts"
    "BlockData.ts"            = "src\sim\BlockData.ts"
    "ContextMenu.tsx"         = "src\components\ContextMenu.tsx"
    "ValidationToast.tsx"     = "src\components\ValidationToast.tsx"
    "APPLY-UPDATES.ps1"       = "APPLY-UPDATES.ps1"
}

$copied = 0

Get-ChildItem $DownloadsPath | ForEach-Object {
    $file = $_
    $name = $file.Name
    $baseName = $name -replace '(\w+?)(\d+)(\.\w+)$', '$1$3'

    if ($destMap.ContainsKey($baseName)) {
        $dst = Join-Path $ProjectPath $destMap[$baseName]
        Copy-Item $file.FullName $dst -Force
        Write-Host "  OK: $name -> $($destMap[$baseName])" -ForegroundColor Cyan
        $copied++
        $done = Join-Path $DownloadsPath "applied"
        if (-not (Test-Path $done)) { New-Item $done -ItemType Directory | Out-Null }
        Move-Item $file.FullName (Join-Path $done $name) -Force
    }
}

if ($copied -eq 0) {
    Write-Host "  No update files found in Downloads." -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "$copied file(s) applied." -ForegroundColor Green
    Set-Location $ProjectPath
    git add .
    git commit -m "Apply $copied update(s)"
    git push
    Write-Host ""
    Write-Host "Starting server..." -ForegroundColor Green
    npm run dev
}
