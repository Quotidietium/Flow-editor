#!/usr/bin/env bash
# ============================================================
#  Mermaid Live Editor 一键启动脚本（Git Bash / Linux / macOS）
#
#  用法:
#    ./start.sh              检查环境 → 安装依赖(如缺) → 启动开发服务器并打开浏览器
#    ./start.sh --install    强制重新安装依赖后再启动
#    ./start.sh --check-only 只做环境检查，不安装、不启动
#
#  脚本行为:
#    1. 校验 Node >= 24.16.0（package.json engines 约束）
#    2. 确保 pnpm 可用：优先 corepack；系统未捆绑 corepack 时自动
#       npm 全局安装 package.json#packageManager 固定的 pnpm 版本
#    3. node_modules 缺失时执行 pnpm install
#    4. 执行 pnpm dev（= pnpm build:embed && vite dev，端口 3000）
#       并通过 --open 自动打开浏览器
# ============================================================
set -euo pipefail

cd "$(dirname "$0")"

MIN_NODE="24.16.0"
PNPM_PIN="10.34.5"
PORT=3000

info() { printf '\033[36m[start]\033[0m %s\n' "$*"; }
err() { printf '\033[31m[error]\033[0m %s\n' "$*" >&2; }

FORCE_INSTALL=0
CHECK_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --install) FORCE_INSTALL=1 ;;
    --check-only) CHECK_ONLY=1 ;;
    *)
      err "未知参数: $arg（可选: --install / --check-only）"
      exit 1
      ;;
  esac
done

# ---- 1) Node 版本 ----
if ! command -v node >/dev/null 2>&1; then
  err "未找到 Node.js（需要 ${MIN_NODE} 以上），请安装: https://nodejs.org/zh-cn"
  exit 1
fi
NODE_VERSION="$(node -v | sed 's/^v//')"
if [ "$(printf '%s\n' "${MIN_NODE}" "${NODE_VERSION}" | sort -V | head -n1)" != "${MIN_NODE}" ]; then
  err "Node 版本过低: v${NODE_VERSION}（需要 ${MIN_NODE} 以上）"
  exit 1
fi
info "Node v${NODE_VERSION} OK"

# ---- 2) pnpm（--check-only 时只报告，不安装）----
if ! command -v pnpm >/dev/null 2>&1; then
  if [ "${CHECK_ONLY}" = 1 ]; then
    err "缺少 pnpm（运行 ./start.sh 会自动安装）"
    exit 1
  fi
  if command -v corepack >/dev/null 2>&1; then
    info "未找到 pnpm，执行 corepack enable pnpm ..."
    corepack enable pnpm 2>/dev/null || true
  fi
  if ! command -v pnpm >/dev/null 2>&1; then
    # 系统未捆绑 corepack（部分新版 Node 如此）时，退回 npm 全局安装。
    info "改用 npm 全局安装 pnpm@${PNPM_PIN} ..."
    command -v npm >/dev/null 2>&1 || { err "未找到 npm，请重新安装 Node.js"; exit 1; }
    npm install -g "pnpm@${PNPM_PIN}"
  fi
fi
info "pnpm $(pnpm --version) OK"

# ---- 3) 依赖 ----
if [ "${CHECK_ONLY}" = 1 ]; then
  if [ -d node_modules ]; then
    info "依赖已存在（node_modules）"
  else
    info "node_modules 缺失（正式启动时会自动执行 pnpm install）"
  fi
  info "环境检查通过（--check-only，未启动服务器）"
  exit 0
fi

if [ ! -d node_modules ] || [ "${FORCE_INSTALL}" = 1 ]; then
  info "安装依赖（首次可能需要几分钟）..."
  pnpm install
else
  info "依赖已就绪（强制重装: ./start.sh --install）"
fi

# ---- 4) 启动（pnpm dev = pnpm build:embed && vite dev）----
info "启动开发服务器: http://localhost:${PORT}"
info "端口被占用时 Vite 会自动换端口，以控制台输出为准；Ctrl+C 退出"
exec pnpm dev -- --open
