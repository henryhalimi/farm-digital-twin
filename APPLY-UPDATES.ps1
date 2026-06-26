param(
    [string]$DownloadsPath = "$env:USERPROFILE\Downloads",
    [string]$ProjectPath = "$env:USERPROFILE\workspace\farm-digital-twin"
)

Set-Location $ProjectPath

Write-Host "Farm Digital Twin - Applying Updates" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green

$destMap = @{
    "App.tsx"                = "src\App.tsx"
    "MapView.tsx"            = "src\components\MapView.tsx"
    "DeviceConfigDialog.tsx" = "src\components\DeviceConfigDialog.tsx"
    "BlockConfigDialog.tsx"  = "src\components\BlockConfigDialog.tsx"
    "ContextMenu.tsx"        = "src\components\ContextMenu.tsx"
    "ValidationToast.tsx"    = "src\components\ValidationToast.tsx"
    "SizePromptDialog.tsx"   = "src\components\SizePromptDialog.tsx"
    "SizePromptDialog.css"   = "src\components\SizePromptDialog.css"
    "CircuitElm.ts"          = "src\sim\CircuitElm.ts"
    "PipeElm.ts"             = "src\sim\PipeElm.ts"
    "PumpElm.ts"             = "src\sim\PumpElm.ts"
    "ValveElm.ts"            = "src\sim\ValveElm.ts"
    "LumoValveElm.ts"        = "src\sim\LumoValveElm.ts"
    "BoosterPumpElm.ts"      = "src\sim\BoosterPumpElm.ts"
    "TankElm.ts"             = "src\sim\TankElm.ts"
    "FilterElm.ts"           = "src\sim\FilterElm.ts"
    "PRVElm.ts"              = "src\sim\PRVElm.ts"
    "ManifoldElm.ts"         = "src\sim\ManifoldElm.ts"
    "SprinklerElm.ts"        = "src\sim\SprinklerElm.ts"
    "ElementRegistry.ts"     = "src\sim\ElementRegistry.ts"
    "ConnectionValidator.ts" = "src\sim\ConnectionValidator.ts"
    "DeviceFingerprint.ts"   = "src\sim\DeviceFingerprint.ts"
    "BlockData.ts"           = "src\sim\BlockData.ts"
    "APPLY-UPDATES.ps1"      = "APPLY-UPDATES.ps1"
}

$copied = 0

Get-ChildItem $DownloadsPath | ForEach-Object {
    $file = $_
    $name = $file.Name
    # Strip browser duplicate suffixes: "File (2).tsx" -> "File.tsx"
    # Also strip trailing numbers: "File2.tsx" -> "File.tsx"
    $baseName = $name -replace '\s*\(\d+\)(\.\w+)$', '$1'
    $baseName = $baseName -replace '(\w+?)(\d+)(\.\w+)$', '$1$3'

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
    git add .
    git commit -m "Apply $copied update(s)"
    git push
    Write-Host ""
    Write-Host "Starting server..." -ForegroundColor Green
    npm run dev
}
