# Flow 编辑器 Windows 安装包构建工程

> 目标：产出**单个 `.exe` 安装包**，最终用户在 Windows 上双击安装即可使用，
> 不需要安装 Node / pnpm / 浏览器运行时等任何前置软件——Electron（Chromium +
> Node 运行时）与本项目的完整站点全部内置于安装包内。

## 方案概述

```
仓库源码 --pnpm build--> docs/（静态站点）--拷贝--> installer/app/site/
                                                        │
Electron 主进程（main.cjs + server.cjs）─────────────────┤
  └─ 启动内嵌 http 服务器（127.0.0.1:38527）             ▼
  └─ BrowserWindow 加载 /edit              electron-builder（NSIS）
                                                        │
                                                        ▼
                              dist/Flow-Editor-Setup-<版本>.exe
```

- **为什么内嵌 http 服务器而不是 file://**：ES module 脚本在 `file://` 下被
  CORS 拦截；且 `localStorage` 按 origin 隔离——固定端口（38527，冲突顺延）
  保证每次启动 origin 不变，用户草稿（`codeStore`、历史时间线）跨启动持久。
- **为什么 Electron 而不是「便携 Node + 系统浏览器」**：独立窗口、独立图标、
  无地址栏干扰，体验与桌面软件一致；Chromium 版本确定，渲染行为可复现。
- **离线一致性**：本项目 2.0.69 起已移除全部自主联网行为（见
  `note/privacy-simplify.md`），桌面版天然继承——安装后运行零外联。
- **目录自包含**：打包过程的一切文件（脚本、配置、依赖、缓存、产物）都在
  `installer/` 内。Electron 运行时 zip 经 `scripts/fetch-electron.mjs` 以编程
  `cacheRoot` 下载到 `.cache/electron-dist/`（npm postinstall 的默认缓存位于
  用户目录且无环境变量可改道，故已通过 `pnpm.ignoredBuiltDependencies` 关闭），
  再由 `build.ps1` 以 `-c.electronDist=` 传给 electron-builder。

## 目录结构

| 路径                         | 说明                                                              |
| ---------------------------- | ----------------------------------------------------------------- |
| `build.ps1`                  | 一键构建编排（见下）                                              |
| `package.json`               | 打包工程自身依赖（electron / electron-builder / sharp，精确锁版） |
| `electron-builder.yml`       | NSIS 安装包配置（辅助向导、per-user 免管理员、简体中文界面）      |
| `app/package.json`           | 应用清单（版本号由 build.ps1 从根 package.json 同步）             |
| `app/main.cjs`               | Electron 主进程：内嵌服务器 + 窗口生命周期 + 单实例锁             |
| `app/server.cjs`             | 静态文件服务器（MIME / SPA 兜底 / 目录穿越防护）                  |
| `app/site/`                  | 站点产物（`robocopy /MIR` 自 `docs/`，不入库）                    |
| `scripts/build-icon.mjs`     | `static/favicon.png` → `resources/icon.ico`（多尺寸）             |
| `scripts/fetch-electron.mjs` | Electron 运行时 zip 拉取到 `.cache/electron-dist/`                |
| `scripts/smoke.mjs`          | 冒烟测试：静默安装 → 启动探测 → 卸载                              |
| `resources/icon.ico`         | 安装包/快捷方式图标（入库，可由脚本再生成）                       |
| `dist/`                      | 最终产物（不入库）                                                |
| `.cache/`                    | Electron / electron-builder 二进制缓存（不入库，自包含）          |
| `.smoke/`                    | 冒烟测试临时目录（不入库）                                        |

## 用法

```powershell
# 全流程：构建站点 + 打包 + 冒烟测试
.\build.ps1

# 站点产物已是最新时只重打包
.\build.ps1 -SkipSiteBuild

# 跳过冒烟测试（CI / 无显示环境）
.\build.ps1 -SkipSmoke

# 强制重装打包依赖 / 强制走 npmmirror 镜像
.\build.ps1 -Install
.\build.ps1 -UseMirror
```

构建机要求：Node >= 24.16 + pnpm（即仓库本身的开发环境；**最终用户无此要求**）。
首次构建需下载 Electron 等二进制（约 300MB，缓存于 `.cache/`，直连失败自动
回退 npmmirror 镜像）；之后增量构建只需数分钟。

产物：`dist/Flow-Editor-Setup-<版本>.exe`（构建结束输出 SHA256 与大小）。

## 安装包行为

- 辅助安装向导（可选安装目录），per-user 安装到
  `%LocalAppData%\Programs\Flow 编辑器`，**免管理员权限**；`/S` 支持静默安装。
- 创建桌面与开始菜单快捷方式「Flow 编辑器」；安装界面为简体中文。
- 卸载经「应用与功能」；**卸载不删除用户数据**（图表草稿位于
  `%AppData%\Flow 编辑器`，卸载后重装仍可找回）。
- 启动日志：`%AppData%\Flow 编辑器\logs\startup.log`（端口选择、兜底告警）。

## 冒烟测试（`scripts/smoke.mjs`）

对 `dist/` 最新安装包执行真实全链路验证，任一检查失败即非零退出：

1. 静默安装到 `.smoke/installed`（`/S /D=`）；
2. 启动安装的 exe（注入 `FLOW_EDITOR_PORT_FILE`，应用写入实际端口）；
3. HTTP 探测：`/edit` 200 + `text/html`、HTML 内引用的 immutable JS 资产
   200 + `text/javascript`、`/service-worker.js` 200 + `Service-Worker-Allowed`
   头、未知路由 404（SPA 兜底页）、目录穿越请求被拒；
4. 结束应用进程；静默卸载并确认安装目录移除。

## 常见问题

- **端口 38527 被占用**：自动顺延（38528…38542）；全部占用才回退随机端口
  （此时历史草稿不可见——origin 变化所致，日志有 WARNING）。
- **启动失败弹窗「内嵌服务器无法启动」**：看 `startup.log`，通常为端口
  扫描全部失败或站点文件缺失（重新打包可修复）。
- **杀毒软件提示**：未签名安装包可能被 SmartScreen 提示「未知发布者」，属
  预期（代码签名证书需另行采购，与本工程无关）。
- **构建期 Electron 下载慢**：`.\build.ps1 -UseMirror`。
