$templateSource = Join-Path $PSScriptRoot '..\docs\project\templates\rule-package-template'
$templateDirectory = Join-Path $PSScriptRoot '..\public\templates'
$templateArchive = Join-Path $templateDirectory 'rule-package-template.zip'
$guideSource = Join-Path $PSScriptRoot '..\docs\project\templates\rule-package-import-guide.md'
$guideOutput = Join-Path $templateDirectory 'rule-package-import-guide.md'

if (-not (Test-Path -LiteralPath $templateSource -PathType Container)) {
    throw "规则包模板源目录不存在：$templateSource"
}
if (-not (Test-Path -LiteralPath $guideSource -PathType Leaf)) {
    throw "规则包导入说明源文件不存在：$guideSource"
}

New-Item -ItemType Directory -Force -Path $templateDirectory | Out-Null
Copy-Item -LiteralPath $guideSource -Destination $guideOutput -Force
if (Test-Path -LiteralPath $templateArchive) {
    Remove-Item -LiteralPath $templateArchive -Force
}

# Pass the directory contents so all TOML files are placed at the ZIP root.
Compress-Archive -Path (Join-Path $templateSource '*') -DestinationPath $templateArchive -CompressionLevel Optimal
