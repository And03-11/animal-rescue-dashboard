$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$pluginDirectory = Join-Path $repositoryRoot 'integrations\wordpress\animal-love-email-tracking'
$distributionDirectory = Join-Path $repositoryRoot 'dist'
$archivePath = Join-Path $distributionDirectory 'animal-love-email-tracking.zip'

if (-not (Test-Path -LiteralPath $pluginDirectory -PathType Container)) {
    throw "Plugin directory was not found: $pluginDirectory"
}

New-Item -ItemType Directory -Path $distributionDirectory -Force | Out-Null
if (Test-Path -LiteralPath $archivePath -PathType Leaf) {
    Remove-Item -LiteralPath $archivePath -Force
}

$pluginFiles = @(
    'animal-love-email-tracking.php',
    'readme.txt',
    'assets\js\tracker.js'
)

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open(
    $archivePath,
    [System.IO.Compression.ZipArchiveMode]::Create
)
try {
    foreach ($relativePath in $pluginFiles) {
        $sourcePath = Join-Path $pluginDirectory $relativePath
        if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
            throw "Required plugin file was not found: $sourcePath"
        }
        $entryName = 'animal-love-email-tracking/' + ($relativePath -replace '\\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive,
            $sourcePath,
            $entryName,
            [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
}
finally {
    $archive.Dispose()
}
Write-Output "Created $archivePath"
