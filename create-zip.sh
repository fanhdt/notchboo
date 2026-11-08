
#!/usr/bin/env bash

set -euo pipefail

PROJECT_NAME="notchboo"
OUTPUT="${PROJECT_NAME}-source.zip"

echo "Creating ${OUTPUT}..."

powershell.exe -NoProfile -Command '
$source = (Get-Location).Path
$output = Join-Path $source "notchboo-source.zip"

$excluded = @(
    "node_modules",
    "target",
    "dist",
    "build",
    ".git",
    "coverage"
)

$files = Get-ChildItem -LiteralPath $source -Recurse -File |
    Where-Object {
        $relative = $_.FullName.Substring($source.Length + 1)
        $parts = $relative -split "[\\/]"
        $name = $_.Name

        -not ($parts | Where-Object { $excluded -contains $_ }) -and
        $name -notlike ".env*" -and
        $name -notlike "*.log" -and
        $name -ne ".DS_Store" -and
        $name -ne "notchboo-source.zip" -and
        $name -ne "create-zip.sh"
    }

Compress-Archive -Path $files.FullName -DestinationPath $output -CompressionLevel Optimal -Force

Write-Host "ZIP created successfully: $output"
'

echo "Done!"
