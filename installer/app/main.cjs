'use strict';

/**
 * Flow 编辑器桌面版 —— Electron 主进程。
 *
 * 启动内嵌静态服务器（127.0.0.1，固定端口段扫描），用 BrowserWindow 加载 /edit。
 * 端口固定（默认 38527，冲突时顺延）是关键设计：localStorage 按 origin 隔离，
 * 端口变了用户草稿（codeStore / 历史时间线）就「丢」了。
 */

const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { createStaticServer } = require('./server.cjs');
const { createMcpServer } = require('./mcp-server.cjs');

const PORT_BASE = 38527;
const PORT_TRIES = 16;

let server = null;
let serverPort = 0;
let mainWindow = null;

function logLine(message) {
  try {
    const logDir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(
      path.join(logDir, 'startup.log'),
      `[${new Date().toISOString()}] ${message}\n`
    );
  } catch {
    // 日志失败不影响主流程
  }
}

function listen(serverInstance, port) {
  return new Promise((resolve, reject) => {
    serverInstance.once('error', reject);
    serverInstance.listen(port, '127.0.0.1', () => {
      serverInstance.removeListener('error', reject);
      resolve();
    });
  });
}

async function startServer() {
  const siteRoot = path.join(__dirname, 'site');
  for (let i = 0; i < PORT_TRIES; i++) {
    const port = PORT_BASE + i;
    const candidate = createStaticServer(siteRoot);
    try {
      // 端口冲突时顺序顺延是预期行为（await-in-loop 有意为之）
      await listen(candidate, port);
      server = candidate;
      serverPort = port;
      return;
    } catch (error) {
      candidate.close();
      if (error.code !== 'EADDRINUSE') throw error;
      logLine(`port ${port} in use, trying next`);
    }
  }
  // 保底：随机端口（origin 变化会导致历史草稿不可见，仅极端端口占用场景触发）
  server = createStaticServer(siteRoot);
  await listen(server, 0);
  serverPort = server.address().port;
  logLine(`WARNING: falling back to random port ${serverPort}; localStorage origin changes`);
}

function baseUrl() {
  return `http://127.0.0.1:${serverPort}`;
}

// ---------- MCP HTTP 服务（页面内 postMessage 桥的回环 HTTP 门面） ----------

const MCP_PORT_MIN = 1024;
const MCP_PORT_MAX = 65535;
const MCP_PORT_DEFAULT = 38528; // 紧随站点端口段（38527+最多16次顺延）
// mc_build 要走完整 javac+jar 流程，慢机上可能超过 15s；60s 仍为有限兜底
const MCP_EXECUTOR_TIMEOUT_MS = 60_000;

function mcpConfigPath() {
  return path.join(app.getPath('userData'), 'mcp-config.json');
}

/** 与页面侧 mcpConfig.ts 同一套校验（渲染进程不可信，主进程必须复核）。 */
function normalizeMcpConfig(value) {
  const record = value && typeof value === 'object' ? value : {};
  const port = Number(record.port);
  return {
    enabled: record.enabled === true,
    port:
      Number.isInteger(port) && port >= MCP_PORT_MIN && port <= MCP_PORT_MAX
        ? port
        : MCP_PORT_DEFAULT
  };
}

function loadMcpConfig() {
  try {
    return normalizeMcpConfig(JSON.parse(fs.readFileSync(mcpConfigPath(), 'utf8')));
  } catch {
    return normalizeMcpConfig(undefined);
  }
}

function saveMcpConfigFile(config) {
  try {
    fs.writeFileSync(mcpConfigPath(), JSON.stringify(config, null, 2), 'utf8');
  } catch (error) {
    logLine(`mcp config save failed: ${error.message}`);
  }
}

/**
 * 把请求送进页面桥。payload 双重 JSON 编码：外层编码产生的是合法 JS 字符
 * 串字面量，请求内容永远以数据身份进入页面（页面端 JSON.parse 还原），
 * 任何字节都不可能逃逸成被执行的代码。
 */
async function executeMcpRequest(request) {
  const id = request && typeof request === 'object' ? (request.id ?? null) : null;
  if (!mainWindow) {
    return { error: { code: -32002, message: 'editor window not ready' }, id, jsonrpc: '2.0' };
  }
  const payload = JSON.stringify(JSON.stringify(request));
  let timeout;
  try {
    const response = await Promise.race([
      mainWindow.webContents.executeJavaScript(
        `window.__FLOW_EDITOR_BRIDGE_CALL__ ? window.__FLOW_EDITOR_BRIDGE_CALL__(${payload}) : null`
      ),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('bridge call timed out')),
          MCP_EXECUTOR_TIMEOUT_MS
        );
      })
    ]);
    return (
      response ?? {
        error: { code: -32002, message: 'editor bridge not installed (page still loading)' },
        id,
        jsonrpc: '2.0'
      }
    );
  } finally {
    clearTimeout(timeout);
  }
}

const mcpServer = createMcpServer({ executor: executeMcpRequest });
let mcpConfig = normalizeMcpConfig(undefined);

async function applyMcpConfig() {
  await mcpServer.stop();
  if (!mcpConfig.enabled) return;
  try {
    await mcpServer.start(mcpConfig.port);
    logLine(`mcp http server listening on 127.0.0.1:${mcpConfig.port}`);
  } catch (error) {
    logLine(`mcp http server failed: ${error.message}`);
  }
}

function installMcpIpc() {
  ipcMain.handle('flow:mcp:get-config', () => mcpConfig);
  ipcMain.handle('flow:mcp:get-status', () => mcpServer.status());
  ipcMain.handle('flow:mcp:set-config', async (_event, raw) => {
    mcpConfig = normalizeMcpConfig(raw);
    saveMcpConfigFile(mcpConfig);
    await applyMcpConfig();
    const status = mcpServer.status();
    return status.error ? { error: status.error, ok: false } : { ok: true };
  });
}

// ---------- MC 成就插件离线编译（javac 走用户自装 JDK，应用不捆绑 Java） ----------

function installMcBuildIpc() {
  const { build } = require('./mc-build.cjs');
  // electron-builder extraResources 把 toolchain 放到 resources/ 下；
  // 开发态（直接 node 调用 mc-build.cjs）由调用方显式传 toolchainDir。
  const toolchainDir = path.join(process.resourcesPath, 'toolchain');
  ipcMain.handle('flow:mc-build', async (_event, raw) => {
    const files = raw && typeof raw === 'object' ? raw.files : undefined;
    const filename = raw && typeof raw === 'object' ? raw.filename : undefined;
    try {
      return await build(files, { filename, toolchainDir });
    } catch (error) {
      logLine(`mc-build failed unexpectedly: ${error.stack ?? error}`);
      return {
        error: { code: 'INTERNAL', message: `构建过程异常：${error.message}` },
        ok: false
      };
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    height: 960,
    minHeight: 640,
    minWidth: 1024,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
      spellcheck: false
    },
    width: 1600
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // History「在新标签页打开」= 同源新窗口；其余一律拒绝（本应用设计上无任何外链）
  mainWindow.webContents.setWindowOpenHandler(({ url }) =>
    url.startsWith(`${baseUrl()}/`) ? { action: 'allow' } : { action: 'deny' }
  );

  mainWindow.loadURL(`${baseUrl()}/edit`);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.floweditor.desktop');
    try {
      await startServer();
    } catch (error) {
      logLine(`FATAL: server failed to start: ${error.stack ?? error}`);
      dialog.showErrorBox(
        'Flow 编辑器启动失败',
        `内嵌服务器无法启动：${error.message}\n请关闭占用端口的程序后重试。`
      );
      app.exit(1);
      return;
    }
    logLine(`serving ${path.join(__dirname, 'site')} at ${baseUrl()}`);

    // MCP HTTP 服务：读取持久配置（默认关闭），按需在回环端口启动
    mcpConfig = loadMcpConfig();
    installMcpIpc();
    installMcBuildIpc();
    await applyMcpConfig();

    // 冒烟测试钩子：写入端口供外部探测；可定时自动退出
    if (process.env.FLOW_EDITOR_PORT_FILE) {
      try {
        fs.writeFileSync(process.env.FLOW_EDITOR_PORT_FILE, String(serverPort), 'utf8');
      } catch (error) {
        logLine(`port file write failed: ${error.message}`);
      }
    }
    if (process.env.FLOW_EDITOR_QUIT_AFTER_MS) {
      setTimeout(() => app.quit(), Number(process.env.FLOW_EDITOR_QUIT_AFTER_MS));
    }

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    void mcpServer.stop();
    if (server) server.close();
    app.quit();
  });
}
