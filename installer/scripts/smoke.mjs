/**
 * 冒烟测试：对 dist/ 下最新的安装包做全链路验证——
 * 静默安装 → 启动安装的 exe → HTTP 探测内嵌服务器 → 杀进程 → 静默卸载。
 * 任何一步失败以非零码退出。
 */
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const installerRoot = path.resolve(here, '..');
const smokeDir = path.join(installerRoot, '.smoke');
const installDir = path.join(smokeDir, 'installed');
const portFile = path.join(smokeDir, 'port');
const PRODUCT_EXE = 'Flow 编辑器.exe';
const UNINSTALL_EXE = 'Uninstall Flow 编辑器.exe';

const results = [];
function check(name, ok, detail = '') {
  results.push({ detail, name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeoutMs, intervalMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await sleep(intervalMs);
  }
  return null;
}

function httpGet(port, pathname) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', path: pathname, port, timeout: 5000 }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () =>
        resolve({
          body: Buffer.concat(chunks).toString('utf8'),
          headers: res.headers,
          status: res.statusCode
        })
      );
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

function httpPost(port, body, contentType = 'application/json') {
  return new Promise((resolve) => {
    const req = http.request(
      {
        headers: { 'Content-Type': contentType },
        host: '127.0.0.1',
        method: 'POST',
        path: '/',
        port,
        timeout: 8000
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolve({ body: Buffer.concat(chunks).toString('utf8'), status: res.statusCode })
        );
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.end(body);
  });
}

// MCP 冒烟配置：预写 userData/mcp-config.json 让应用启动即开启 HTTP 服务，
// 结束后还原现场（卸载默认保留用户数据，不能污染）。
const MCP_SMOKE_PORT = 38655;
const mcpConfigDir = path.join(process.env.APPDATA ?? '', 'Flow 编辑器');
const mcpConfigFile = path.join(mcpConfigDir, 'mcp-config.json');
let mcpConfigBackup = null;
try {
  fs.mkdirSync(mcpConfigDir, { recursive: true });
  mcpConfigBackup = fs.existsSync(mcpConfigFile) ? fs.readFileSync(mcpConfigFile) : null;
  fs.writeFileSync(mcpConfigFile, JSON.stringify({ enabled: true, port: MCP_SMOKE_PORT }), 'utf8');
} catch (error) {
  console.log(`WARN: cannot seed mcp config (${error.message}) — MCP checks will fail`);
}

// 1. 找最新安装包
const distDir = path.join(installerRoot, 'dist');
const setups = fs
  .readdirSync(distDir)
  .filter((f) => /^Flow-Editor-Setup-.+\.exe$/i.test(f))
  .map((f) => ({ f, mtime: fs.statSync(path.join(distDir, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);
if (setups.length === 0) {
  console.error('no installer found in dist/ — run build first');
  process.exit(1);
}
const setupExe = path.join(distDir, setups[0].f);
console.log(`smoke target: ${setups[0].f}`);

// 2. 静默安装
fs.rmSync(smokeDir, { force: true, recursive: true });
fs.mkdirSync(smokeDir, { recursive: true });
await new Promise((resolve, reject) => {
  const child = spawn(setupExe, ['/S', `/D=${installDir}`], { stdio: 'ignore' });
  child.on('error', reject);
  child.on('exit', resolve);
});
const installedExe = await waitFor(() => {
  const p = path.join(installDir, PRODUCT_EXE);
  return fs.existsSync(p) ? p : null;
}, 30_000);
check('silent install produces app exe', installedExe !== null, installDir);

// 3. 启动并等待端口
let port = null;
let appProcess = null;
if (installedExe) {
  appProcess = spawn(installedExe, [], {
    env: {
      ...process.env,
      FLOW_EDITOR_PORT_FILE: portFile,
      FLOW_EDITOR_QUIT_AFTER_MS: '120000'
    },
    stdio: 'ignore'
  });
  port = await waitFor(() => {
    try {
      const text = fs.readFileSync(portFile, 'utf8').trim();
      return /^\d+$/.test(text) ? Number(text) : null;
    } catch {
      return null;
    }
  }, 30_000);
  check('app starts and reports port', port !== null, port ? `port ${port}` : 'no port file');
}

// 4. HTTP 探测
if (port) {
  const edit = await waitFor(async () => {
    const res = await httpGet(port, '/edit');
    return res && res.status === 200 ? res : null;
  }, 30_000);
  check(
    'GET /edit -> 200 text/html',
    !!edit && String(edit.headers['content-type'] ?? '').includes('text/html')
  );

  if (edit) {
    // adapter-static 预渲染页默认输出相对路径（./_app/...），探测时归一为绝对路径
    const assetMatch = edit.body.match(/(?:src|href)="\.?(\/_app\/immutable\/[^"]+\.js)"/);
    if (!assetMatch) {
      check('immutable JS asset discoverable in /edit html', false);
    } else {
      const asset = await httpGet(port, assetMatch[1]);
      check(
        'GET immutable JS asset -> 200 text/javascript',
        !!asset &&
          asset.status === 200 &&
          String(asset.headers['content-type'] ?? '').includes('javascript')
      );
    }
  }

  const sw = await httpGet(port, '/service-worker.js');
  check(
    'GET /service-worker.js -> 200 + Service-Worker-Allowed',
    !!sw && sw.status === 200 && sw.headers['service-worker-allowed'] === '/'
  );

  const missing = await httpGet(port, '/definitely-not-a-route');
  check('unknown route -> 404 with SPA fallback page', !!missing && missing.status === 404);

  const traversal = await httpGet(port, '/..%2F..%2Fpackage.json');
  check('path traversal blocked', !!traversal && traversal.status !== 200);
}

// 4b. MCP HTTP 服务探测（配置已在启动前预写：enabled + MCP_SMOKE_PORT）
{
  const init = await waitFor(async () => {
    const res = await httpPost(
      MCP_SMOKE_PORT,
      JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'initialize' })
    );
    if (!res || res.status !== 200) return null;
    try {
      const parsed = JSON.parse(res.body);
      return parsed.result?.serverInfo?.name === 'flow-editor' ? parsed : null;
    } catch {
      return null;
    }
  }, 30_000);
  check('MCP POST initialize -> serverInfo flow-editor', init !== null);

  const tools = await httpPost(
    MCP_SMOKE_PORT,
    JSON.stringify({ id: 2, jsonrpc: '2.0', method: 'tools/list' })
  );
  check(
    'MCP POST tools/list -> 6 tools',
    (() => {
      try {
        return JSON.parse(tools?.body ?? '{}').result?.tools?.length === 6;
      } catch {
        return false;
      }
    })()
  );

  // get_code 走页面桥（executeJavaScript），顺带验证端到端链路
  const code = await httpPost(
    MCP_SMOKE_PORT,
    JSON.stringify({
      id: 3,
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { arguments: {}, name: 'get_code' }
    })
  );
  check(
    'MCP tools/call get_code -> diagram source',
    (() => {
      try {
        return JSON.parse(code?.body ?? '{}').result?.content?.[0]?.text?.includes('flowchart');
      } catch {
        return false;
      }
    })()
  );

  const get405 = await httpGet(MCP_SMOKE_PORT, '/');
  check('MCP GET -> 405', !!get405 && get405.status === 405);

  const plain = await httpPost(MCP_SMOKE_PORT, '{}', 'text/plain');
  check('MCP wrong Content-Type -> 415', !!plain && plain.status === 415);
}

// 5. 杀进程
if (appProcess && appProcess.pid) {
  try {
    execFileSync('taskkill', ['/PID', String(appProcess.pid), '/T', '/F'], { stdio: 'ignore' });
  } catch {
    // 进程可能已自行退出
  }
  await sleep(1000);
}

// 6. 静默卸载
if (installedExe) {
  const uninstallExe = path.join(installDir, UNINSTALL_EXE);
  if (fs.existsSync(uninstallExe)) {
    await new Promise((resolve) => {
      const child = spawn(uninstallExe, ['/S'], { stdio: 'ignore' });
      child.on('error', resolve);
      child.on('exit', resolve);
    });
    const removed = await waitFor(() => !fs.existsSync(path.join(installDir, PRODUCT_EXE)), 60_000);
    check('silent uninstall removes app', removed === true);
  } else {
    check('uninstaller present', false, uninstallExe);
  }
}

// 清理
fs.rmSync(smokeDir, { force: true, recursive: true });
try {
  if (mcpConfigBackup === null) {
    fs.rmSync(mcpConfigFile, { force: true });
  } else {
    fs.writeFileSync(mcpConfigFile, mcpConfigBackup);
  }
} catch {
  // 配置还原失败不影响结论
}

const failed = results.filter((r) => !r.ok);
console.log(
  failed.length === 0
    ? `\nSMOKE OK — ${results.length}/${results.length} checks passed`
    : `\nSMOKE FAILED — ${failed.length}/${results.length} checks failed`
);
process.exit(failed.length === 0 ? 0 : 1);
