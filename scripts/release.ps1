# Publishes a new version: sets the version, builds the installer, pushes the code
# and creates the GitHub release that installed copies update from.
# Usage:  npm run release -- 1.0.2
param([Parameter(Mandatory = $true)][string]$Version)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

npm version $Version --no-git-tag-version --allow-same-version
if ($LASTEXITCODE) { throw 'Setting the version failed.' }
npm run dist
if ($LASTEXITCODE) { throw 'Building the installer failed.' }

git add -A
git commit -m "Release $Version"
git push
if ($LASTEXITCODE) { throw 'Pushing to GitHub failed.' }

$exe = "dist\GlassReader-Setup-$Version.exe"
gh release create "v$Version" $exe "$exe.blockmap" dist\latest.yml --title "Glass Reader $Version" --generate-notes
if ($LASTEXITCODE) { throw 'Creating the GitHub release failed.' }
Write-Output "Released $Version. Installed copies will update within 4 hours, or on next launch."
