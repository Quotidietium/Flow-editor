#requires -Version 5.1
<#
.SYNOPSIS
  Flow 编辑器 Windows 安装包一键构建脚本。
.DESCRIPTION
  流程：构建站点（pnpm build -> docs/）→ 同步产物到 installer/app/site →
  同步版本号 → 安装打包依赖 → 生成图标 → electron-builder 产出 NSIS 安装包 →
  冒烟测试（静默安装 / 启动探测 / 卸载）。
  依赖与工具缓存全部收敛在 installer/ 目录内（node_modules、.cache）。
.PARAMETER SkipSiteBuild
  跳过站点构建，复用已有 docs/ 产物。
.PARAMETER SkipSmoke
  跳过冒烟测试。
.PARAMETER UseMirror
  直接使用 npmmirror 镜像下载 Electron / electron-builder 二进制
  （默认行为：直连失败时自动回退镜像重试一次）。
.PARAMETER Install
  强制重新安装 installer/ 的打包依赖。
.EXAMPLE
  .\build.ps1                      # 全流程
  .\build.ps1 -SkipSiteBuild       # 站点产物已新，只重打包
  .\build.ps1 -UseMirror           # 网络受限时强制走镜像
#>
[CmdletBinding()]
param(
  [switch]$SkipSiteBuild,
  [switch]$SkipSmoke,
  [switch]$UseMirror,
  [switch]$Install
)

$ErrorActionPreference = 'Stop'
$InstallerRoot = $PSScriptRoot
$RepoRoot = Split-Path -Parent $PSScriptRoot
$AppDir = Join-Path $InstallerRoot 'app'
$SiteDir = Join-Path $AppDir 'site'

function Write-Step([string]$Message) {
  Write-Host ''
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Set-MirrorEnv {
  $env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
  $env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
  Write-Host '    已启用 npmmirror 二进制镜像' -ForegroundColor Yellow
}

# 工具缓存收敛到 installer/.cache，保持目录自包含
# （electron-builder 的 NSIS/7zip 等二进制缓存；Electron 运行时 zip 由 fetch-electron.mjs
#   以编程 cacheRoot 下载到 .cache/electron-dist —— electron 的 npm postinstall 已通过
#   pnpm.ignoredBuiltDependencies 关闭，避免其写入用户目录的固定缓存）
$env:ELECTRON_BUILDER_CACHE = Join-Path $InstallerRoot '.cache\electron-builder'
if ($UseMirror) { Set-MirrorEnv }

Write-Step '环境检查（Node >= 24.16 / pnpm）'
$nodeMajor = [int]((node -v).TrimStart('v') -split '\.')[0]
if ($nodeMajor -lt 24) { throw "Node 版本过低：$(node -v)，需要 >= 24.16.0" }
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  throw '缺少 pnpm —— 请先运行仓库根目录的 start.ps1 完成自举'
}
Write-Host "    Node $(node -v) / pnpm $(pnpm -v)"

if (-not $SkipSiteBuild) {
  Write-Step '构建站点（pnpm build -> docs/）'
  Push-Location $RepoRoot
  try {
    pnpm build
    if ($LASTEXITCODE -ne 0) { throw "pnpm build 退出码 $LASTEXITCODE" }
  } finally { Pop-Location }
} elseif (-not (Test-Path (Join-Path $RepoRoot 'docs\edit.html'))) {
  throw '指定了 -SkipSiteBuild 但 docs/ 产物不存在，请先构建'
}

Write-Step '同步站点产物 docs/ -> installer/app/site/'
robocopy (Join-Path $RepoRoot 'docs') $SiteDir /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -gt 7) { throw "robocopy 失败，退出码 $LASTEXITCODE" }
$global:LASTEXITCODE = 0 # robocopy 0-7 均为成功，复位避免误伤后续检查

Write-Step '同步版本号到 installer/app/package.json'
$rootPkg = [System.IO.File]::ReadAllText((Join-Path $RepoRoot 'package.json')) | ConvertFrom-Json
$appPkgPath = Join-Path $AppDir 'package.json'
# .NET 显式 UTF-8（无 BOM）读写：PS 5.1 的 Get-Content/Set-Content 会把中文读成乱码、写出 BOM，均会损坏 JSON
$appPkgRaw = [System.IO.File]::ReadAllText($appPkgPath)
$appPkgRaw = $appPkgRaw -replace '"version"\s*:\s*"[^"]*"', ('"version": "' + $rootPkg.version + '"')
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($appPkgPath, $appPkgRaw, $utf8NoBom)
Write-Host "    应用版本 $($rootPkg.version)"

if ($Install -or -not (Test-Path (Join-Path $InstallerRoot 'node_modules'))) {
  Write-Step '安装打包依赖（electron + electron-builder，首次约 300MB）'
  Push-Location $InstallerRoot
  try {
    try {
      pnpm install
      if ($LASTEXITCODE -ne 0) { throw "pnpm install 退出码 $LASTEXITCODE" }
    } catch {
      if ($UseMirror) { throw }
      Write-Host '    直连失败，回退 npmmirror 镜像重试…' -ForegroundColor Yellow
      Set-MirrorEnv
      pnpm install
      if ($LASTEXITCODE -ne 0) { throw "pnpm install（镜像）退出码 $LASTEXITCODE" }
    }
  } finally { Pop-Location }
}

Write-Step '生成图标 resources/icon.ico'
Push-Location $InstallerRoot
try {
  node scripts\build-icon.mjs
  if ($LASTEXITCODE -ne 0) { throw "build-icon 退出码 $LASTEXITCODE" }
} finally { Pop-Location }

Write-Step 'MCP 服务器单元探测（协议面与安全防线）'
Push-Location $InstallerRoot
try {
  node scripts\test-mcp.mjs
  if ($LASTEXITCODE -ne 0) { throw "test-mcp 退出码 $LASTEXITCODE" }
} finally { Pop-Location }

Write-Step '拉取 MC 插件编译工具链（12 个 jar，优先本机 .m2）'
Push-Location $InstallerRoot
try {
  node scripts\fetch-toolchain.mjs
  if ($LASTEXITCODE -ne 0) { throw "fetch-toolchain 退出码 $LASTEXITCODE" }
} finally { Pop-Location }

Write-Step 'MC 离线编译器探测（javac/jar 链路；无 JDK 时跳过用例但保留校验用例）'
Push-Location $InstallerRoot
try {
  node scripts\test-mc-build.mjs
  if ($LASTEXITCODE -ne 0) { throw "test-mc-build 退出码 $LASTEXITCODE" }
} finally { Pop-Location }

Write-Step '拉取 Electron 运行时（缓存于 installer/.cache/electron-dist）'
Push-Location $InstallerRoot
try {
  $electronZip = $null
  try {
    $electronZip = (node scripts\fetch-electron.mjs | Select-Object -Last 1)
    if ($LASTEXITCODE -ne 0) { throw "fetch-electron 退出码 $LASTEXITCODE" }
  } catch {
    if ($UseMirror) { throw }
    Write-Host '    直连失败，回退 npmmirror 镜像重试…' -ForegroundColor Yellow
    Set-MirrorEnv
    $electronZip = (node scripts\fetch-electron.mjs | Select-Object -Last 1)
    if ($LASTEXITCODE -ne 0) { throw "fetch-electron（镜像）退出码 $LASTEXITCODE" }
  }
  $electronZip = "$electronZip".Trim()
  if (-not (Test-Path $electronZip)) { throw "Electron zip 不存在：$electronZip" }
  Write-Host "    $electronZip"
} finally { Pop-Location }

Write-Step 'electron-builder 打包（NSIS，数分钟）'
Push-Location $InstallerRoot
try {
  pnpm exec electron-builder --win --x64 "-c.electronDist=$electronZip"
  if ($LASTEXITCODE -ne 0 -and -not $UseMirror) {
    Write-Host '    打包失败，回退 npmmirror 镜像重试一次…' -ForegroundColor Yellow
    Set-MirrorEnv
    pnpm exec electron-builder --win --x64 "-c.electronDist=$electronZip"
  }
  if ($LASTEXITCODE -ne 0) { throw "electron-builder 退出码 $LASTEXITCODE" }
} finally { Pop-Location }

$setup = Get-ChildItem (Join-Path $InstallerRoot 'dist\Flow-Editor-Setup-*.exe') |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $setup) { throw 'dist/ 下未找到安装包产物' }

if (-not $SkipSmoke) {
  Write-Step '冒烟测试（静默安装 -> 启动探测 -> 卸载）'
  Push-Location $InstallerRoot
  try {
    node scripts\smoke.mjs
    if ($LASTEXITCODE -ne 0) { throw "冒烟测试未通过（退出码 $LASTEXITCODE）" }
  } finally { Pop-Location }
}

Write-Step '完成'
$hash = (Get-FileHash $setup.FullName -Algorithm SHA256).Hash.ToLower()
$sizeMB = [math]::Round($setup.Length / 1MB, 1)
Write-Host "安装包: $($setup.FullName)"
Write-Host "大小:   $sizeMB MB"
Write-Host "SHA256: $hash"
