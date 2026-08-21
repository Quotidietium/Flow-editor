'use strict';

/**
 * Flow 编辑器桌面版 —— Electron 主进程。
 *
 * 启动内嵌静态服务器（127.0.0.1，固定端口段扫描），用 BrowserWindow 加载 /edit。
 * 端口固定（默认 38527，冲突时顺延）是关键设计：localStorage 按 origin 隔离，
 * 端口变了用户草稿（codeStore / 历史时间线）就「丢」了。
 */

const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { createStaticServer } = require('./server.cjs');

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
      // eslint-disable-next-line no-await-in-loop -- 端口冲突时顺序顺延是预期行为
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
    if (server) server.close();
    app.quit();
  });
}
