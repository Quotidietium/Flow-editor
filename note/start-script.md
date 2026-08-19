# 一键启动脚本使用说明

> 创建时间：2026-08-19
> 脚本位置：项目根目录 `start.ps1`（Windows）与 `start.sh`（Git Bash / Linux / macOS）

## 1. 文件清单

| 脚本        | 适用环境                                          | 运行方式                                                     |
| ----------- | ------------------------------------------------- | ------------------------------------------------------------ |
| `start.ps1` | Windows（PowerShell 5.1 / PowerShell 7 均已验证） | 终端执行 `.\start.ps1`；或右键文件 →「使用 PowerShell 运行」 |
| `start.sh`  | Git Bash / Linux / macOS                          | `./start.sh`（首次需 `chmod +x start.sh`，仓库内已带执行位） |

> 按用户要求，Windows 统一使用 PowerShell 脚本（此前的 `start.bat` 已删除）。
> `.gitattributes` 强制 `*.sh` 使用 LF、`*.ps1` 使用 CRLF 行尾，保证跨平台检出后可直接运行。

## 2. 用法

```powershell
# Windows PowerShell —— 启动（自动打开浏览器）
.\start.ps1

# 若系统执行策略受限，用：
powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1

# 只做环境检查，不安装、不启动
.\start.ps1 -CheckOnly        # 兼容 --check-only 写法

# 强制重新安装依赖后再启动
.\start.ps1 -Install          # 兼容 --install 写法
```

```bash
# Git Bash / Linux / macOS
./start.sh              # 启动并打开浏览器
./start.sh --check-only # 仅环境检查
./start.sh --install    # 强制重装依赖
```

启动成功后访问 **http://localhost:3000**（`--open` 会自动打开浏览器；端口被占用时 Vite 自动换端口，以控制台输出为准，`vite.config.js:34`）。

## 3. 脚本内部流程（两个脚本逻辑一致）

1. **Node 版本检查**：要求 >= 24.16.0（`package.json:127` 的 `engines` 约束），过低即退出
2. **pnpm 自举**（缺失时自动进行，按顺序尝试）：
   - `corepack enable pnpm`（若系统带有 corepack）
   - 仍不可用 → `npm install -g pnpm@10.34.5`（版本与 `package.json:129` 的 `packageManager` 固定值一致）
   - PowerShell 版额外处理了命令发现缓存问题：安装后重读 Machine+User PATH（`start.ps1` 的 `Update-SessionPath`）
3. **依赖安装**：`node_modules` 不存在（或指定 `-Install`）时执行 `pnpm install`
4. **启动**：`pnpm dev -- --open` = `pnpm build:embed && vite dev --open`（`package.json:7`），即先构建嵌入加载器 `static/embed.js` 再启动开发服务器并打开浏览器

## 4. 已验证内容（2026-08-19，本机 Windows 11 + Node v26.5.0）

| 场景                                   | 脚本                          | 结果                                                                         |
| -------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------- |
| 环境就绪时 `-CheckOnly`                | start.ps1（PS 5.1 与 pwsh 7） | 通过，exit 0                                                                 |
| `--check-only` 兼容参数                | start.ps1（PS 5.1）           | 通过，exit 0                                                                 |
| 卸载 pnpm 后 `-CheckOnly`              | start.ps1                     | 正确报「缺少 pnpm」，exit 1                                                  |
| 全量冷启动（无 pnpm）                  | start.ps1                     | npm 自动安装 pnpm@10.34.5 → 依赖就绪 → build:embed → Vite 启动，**HTTP 200** |
| 全量冷启动（无 pnpm、无 node_modules） | start.sh（Git Bash）          | 自举 pnpm → `pnpm install`（741 包）→ Vite 启动，**HTTP 200**                |
| start.sh `--check-only`（缺 pnpm）     | start.sh                      | 正确报错，exit 1                                                             |

## 5. 常见问题

- **首次运行慢**：需下载 pnpm + 全量依赖（约数百 MB），视网络数分钟；之后秒级启动
- **执行策略报错**（「禁止运行脚本」）：用第 2 节的 `-ExecutionPolicy Bypass` 命令行，或以管理员执行一次 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`
- **双击 start.ps1 打开的是记事本**：这是 Windows 默认关联；右键 →「使用 PowerShell 运行」，或在终端中执行
- **部分新版 Node 没有 corepack**：脚本已处理——自动改走 npm 全局安装分支（本机 Node 26 即此情况，已实测通过）
- **端口 3000 被占用**：Vite 自动换到 3001 等下一端口，实际地址以控制台输出为准
- **`static/embed.js`**：`pnpm dev` 会自动先构建它（`vite.embed.config.js`），该文件在 `.gitignore` 中，无需手动管理

## 6. 与项目命令的对应关系

| 脚本动作 | 等效手动命令                    | 依据                             |
| -------- | ------------------------------- | -------------------------------- |
| 版本门槛 | `engines.node >= 24.16.0`       | `package.json:126-128`           |
| 包管理器 | `pnpm@10.34.5`（corepack 规范） | `package.json:129`               |
| 依赖安装 | `pnpm install`                  | README:110                       |
| 启动     | `pnpm dev -- --open`            | `package.json:7`、README:111-112 |
| 访问地址 | http://localhost:3000           | `vite.config.js:34`              |
