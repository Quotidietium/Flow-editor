# ============================================================
#  Mermaid Live Editor 一键启动脚本（Windows PowerShell）
#
#  用法:
#    .\start.ps1              检查环境 → 安装依赖(如缺) → 启动开发服务器并打开浏览器
#    .\start.ps1 -Install     强制重新安装依赖后再启动
#    .\start.ps1 -CheckOnly   只做环境检查，不安装、不启动
#    （兼容 --install / --check-only 写法）
#
#  若执行策略受限，可用:
#    powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1
# ============================================================
param(
  [switch]$Install,
  [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$MinNode = '24.16.0'
$PnpmPin = '10.34.5'
$Port = 3000

# 兼容 kebab-case 参数（与 start.sh 保持一致）
foreach ($a in $args) {
  switch -Exact ($a) {
    '--install' { $Install = $true }
    '--check-only' { $CheckOnly = $true }
    default {
      Write-Host "[error] 未知参数: $a（可选: -Install / -CheckOnly）" -ForegroundColor Red
      exit 1
    }
  }
}

function Write-Info([string]$msg) {
  Write-Host '[start] ' -ForegroundColor Cyan -NoNewline
  Write-Host $msg
}
function Write-Err([string]$msg) {
  Write-Host '[error] ' -ForegroundColor Red -NoNewline
  Write-Host $msg
}

# 刷新当前会话 PATH 与命令发现缓存（npm 全局安装 pnpm 后，Get-Command 才能找到它）
function Update-SessionPath {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user"
}

# 比较语义化版本 Version >= Minimum（容忍 26.5.0-nightly 之类的后缀）
function Test-VersionAtLeast([string]$Version, [string]$Minimum) {
  $v = @($Version -split '\.' | ForEach-Object {
      $x = ($_ -replace '\D.*$', ''); if ($x) { [int]$x } else { 0 }
    })
  $m = @($Minimum -split '\.' | ForEach-Object {
      $x = ($_ -replace '\D.*$', ''); if ($x) { [int]$x } else { 0 }
    })
  $n = [Math]::Max($v.Count, $m.Count)
  for ($i = 0; $i -lt $n; $i++) {
    $a = if ($i -lt $v.Count) { $v[$i] } else { 0 }
    $b = if ($i -lt $m.Count) { $m[$i] } else { 0 }
    if ($a -gt $b) { return $true }
    if ($a -lt $b) { return $false }
  }
  return $true
}

# ---- 1) Node 版本 ----
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Err "未找到 Node.js（需要 $MinNode 以上），请安装: https://nodejs.org/zh-cn"
  exit 1
}
$NodeVersion = (& node -v).TrimStart('v')
if (-not (Test-VersionAtLeast $NodeVersion $MinNode)) {
  Write-Err "Node 版本过低: v$NodeVersion（需要 $MinNode 以上）"
  exit 1
}
Write-Info "Node v$NodeVersion OK"

# ---- 2) pnpm（-CheckOnly 时只报告，不安装）----
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  if ($CheckOnly) {
    Write-Err '缺少 pnpm（运行 .\start.ps1 会自动安装）'
    exit 1
  }
  if (Get-Command corepack -ErrorAction SilentlyContinue) {
    Write-Info '未找到 pnpm，执行 corepack enable pnpm ...'
    & corepack enable pnpm
    Update-SessionPath
  }
  if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    # 部分新版 Node 不再捆绑 corepack，退回 npm 全局安装 package.json#packageManager 固定版本
    Write-Info "改用 npm 全局安装 pnpm@$PnpmPin ..."
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
      Write-Err '未找到 npm，请重新安装 Node.js'
      exit 1
    }
    & npm install -g "pnpm@$PnpmPin"
    if ($LASTEXITCODE -ne 0) {
      Write-Err "pnpm 安装失败，请手动执行: npm install -g pnpm@$PnpmPin"
      exit 1
    }
    Update-SessionPath
  }
}
$PnpmVersion = (& pnpm --version)
if ($LASTEXITCODE -ne 0) {
  Write-Err "pnpm 不可用（exit $LASTEXITCODE），请检查安装"
  exit 1
}
Write-Info "pnpm v$PnpmVersion OK"

# ---- 3) 依赖 ----
if ($CheckOnly) {
  if (Test-Path 'node_modules') {
    Write-Info '依赖已存在（node_modules）'
  } else {
    Write-Info 'node_modules 缺失（正式启动时会自动执行 pnpm install）'
  }
  Write-Info '环境检查通过（-CheckOnly，未启动服务器）'
  exit 0
}

if (-not (Test-Path 'node_modules') -or $Install) {
  Write-Info '安装依赖（首次可能需要几分钟）...'
  & pnpm install
  if ($LASTEXITCODE -ne 0) {
    Write-Err '依赖安装失败'
    exit 1
  }
} else {
  Write-Info '依赖已就绪（强制重装: .\start.ps1 -Install）'
}

# ---- 4) 启动（pnpm dev = pnpm build:embed && vite dev）----
Write-Info "启动开发服务器: http://localhost:$Port"
Write-Info '端口被占用时 Vite 会自动换端口，以控制台输出为准；Ctrl+C 退出'
& pnpm dev -- --open
exit $LASTEXITCODE
