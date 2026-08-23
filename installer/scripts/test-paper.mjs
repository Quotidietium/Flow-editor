/**
 * 真实 Paper 服务器实机验证：把 MC 进度设计器生成的 jar 丢进 REF 工程
 * 自带的 Paper 1.21.11 服务器，启动 → latest.log 断言 → 停服 → 清理。
 * 无 REF 环境的机器自动 SKIP（退出 0）。
 *
 * 断言源是服务器的 logs/latest.log（文件为 UTF-8；子进程 stdout 在
 * Windows 上是 GBK，不可用于中文断言）。端口用 25599 避开本机遗留服务器。
 *
 * 用法：node scripts/test-paper.mjs
 */
import { spawn } from 'node:child_process';
import {
  closeSync,
  existsSync,
  fstatSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const installerRoot = path.resolve(here, '..');
const repoRoot = path.resolve(installerRoot, '..');
const runDir = path.join(repoRoot, 'REF', 'Minecraft-Achievement-plugin', 'run');
const paperJar = path.join(runDir, 'paper.jar');
const pluginJar = path.join(runDir, 'plugins', 'FlowEditorTest-1.0.0.jar');
const pluginDataDir = path.join(runDir, 'plugins', 'FlowEditorTest');

if (!existsSync(paperJar)) {
  console.log(`SKIP: REF Paper 服务器环境不存在（${runDir}）`);
  process.exit(0);
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

// ---- 样本：覆盖触发器/战利品/本地化/subgraph 多栏 的最小全功能图 ----
const require = createRequire(import.meta.url);
const { build } = require(path.join(installerRoot, 'app', 'mc-build.cjs'));
const toolchainDir = path.join(installerRoot, 'toolchain');
const pluginSource = readFileSync(
  path.join(repoRoot, 'plugins', 'examples', 'mc-advancement.mjs'),
  'utf8'
);
const mod = await import(
  'data:text/javascript;base64,' + Buffer.from(pluginSource, 'utf8').toString('base64')
);
const CORE = mod._core;
const meta = CORE.readMeta(CORE.starterCode()).meta;
meta.plugin = 'FlowEditorTest';
meta.namespace = 'flowtest';
meta.command = 'flowtest';
meta.localization = 'on';
meta.nodes = {
  fisher: {
    desc: '钓上 3 条鱼',
    en: 'Fisherman',
    loot: [{ item: 'minecraft:cod', max: 2, min: 1 }],
    trigger: 'fish',
    xp: 5
  }
};
const code = CORE.buildCode(
  meta,
  'TD',
  [
    { id: 'tab_main', label: '实测栏', shape: 'rect' },
    { id: 'hello', label: '你好，世界！', shape: 'rect' },
    { id: 'fisher', label: '钓鱼佬', shape: 'round' }
  ],
  [
    { from: 'tab_main', to: 'hello' },
    { from: 'hello', to: 'fisher' }
  ],
  [{ id: 'tab_main', label: '实测栏', memberIds: ['tab_main', 'hello', 'fisher'] }]
);
const request = CORE.buildJarRequest(code);
if (!request.ok) {
  console.error('样本生成失败', request.errors);
  process.exit(1);
}
const built = await build(request.files, { filename: 'FlowEditorTest-1.0.0.jar', toolchainDir });
if (!built.ok) {
  console.error('编译失败', built.error);
  process.exit(1);
}
writeFileSync(pluginJar, Buffer.from(built.jarBase64, 'base64'));
console.log(`样本 jar 就绪（${statSync(pluginJar).size} 字节，${built.jdkVersion}）`);

// ---- latest.log 读取（从 0：服务器启动会 rotate 旧日志，记旧 offset 会跳过头部） ----
const latestLog = path.join(runDir, 'logs', 'latest.log');
const readLog = () => {
  try {
    const fd = openSync(latestLog, 'r');
    try {
      const size = fstatSync(fd).size;
      const buf = Buffer.alloc(size);
      const read = readSync(fd, buf, 0, size, 0);
      return buf.subarray(0, read).toString('utf8');
    } finally {
      closeSync(fd);
    }
  } catch {
    return '';
  }
};
const waitFor = async (pattern, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pattern.test(readLog())) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
};

// ---- 启动服务器（专用端口 25599 避开本机遗留实例） ----
const child = spawn(
  'java',
  ['-Xmx2G', '-Xms512M', '-jar', 'paper.jar', '--nogui', '--port', '25599'],
  { cwd: runDir, shell: false, stdio: ['pipe', 'ignore', 'ignore'] }
);
child.stdin.on('error', () => undefined); // 进程提前退出时写 stop 会 EPIPE

try {
  // 首启可能生成地形，给足 5 分钟
  const done = await waitFor(/Done \([0-9.]+s\)!/, 300_000);
  const doneLine = (readLog().match(/Done \([0-9.]+s\)/) ?? [''])[0];
  check('服务器启动到 Done', done, doneLine || '超时');
  await new Promise((r) => setTimeout(r, 3000)); // 等 onEnable 与数据包日志冲刷

  // ---- 控制台命令链：注册成功 + 权限放行 + 用法/仅玩家提示 ----
  // 无在线玩家，可验证到 getPlayerExact 判空分叉（无客户端下的最深路径）。
  // console reader 在 Done 后仍未就绪（首行会被吞）——先发原生命令 list
  // 等它的输出出现，再发我们的命令。
  try {
    // console reader 在 Done 后仍未 attach（首行会被静默吞掉）——实测
    // 固定等待 8s 后稳定可用（原生 list/tps 探针在此构建下本身会抛
    // Command exception，不能作探针）
    await new Promise((r) => setTimeout(r, 8000));
    child.stdin.write('flowtest\n');
    await waitFor(/该命令仅玩家可用/, 10_000);
    child.stdin.write('flowtest grant GhostPlayer hello\n');
    await waitFor(/用法: \/flowtest grant/, 10_000);
    child.stdin.write('flowtest grant\n'); // 缺参：args.length < 3 分支
    await new Promise((r) => setTimeout(r, 2000));
  } catch {
    // stdin 不可写时，下面断言会给出失败详情
  }
  await new Promise((r) => setTimeout(r, 1500));
  const cmdLog = readLog();
  check(
    'flowtest 命令已注册（无 Unknown command）',
    !/Unknown command[\s\S]{0,80}flowtest/.test(cmdLog) &&
      !/flowtest[\s\S]{0,80}Unknown command/.test(cmdLog)
  );
  check('无参调用返回「仅玩家可用」提示', /该命令仅玩家可用/.test(cmdLog));
  check(
    'grant 对离线玩家走用法提示（权限链放行 + getPlayerExact 判空）',
    /用法: \/flowtest grant <在线玩家> <成就id>/.test(cmdLog)
  );
  check(
    'grant 缺参与离线玩家均给用法（两次）',
    (cmdLog.match(/用法: \/flowtest grant/g) ?? []).length >= 2
  );

  const full = readLog();
  check(
    '数据包注册为插件内置包（bootstrap 发现行）',
    // bootstrap 的发现行每次启动都会打；首次自动启用另有英文
    // Found new data pack 行（仅首启出现）
    /\[FlowEditorTest\] 数据包发现完成: FlowEditorTest\/provided/.test(full) ||
      /Found new data pack FlowEditorTest\/provided/.test(full)
  );
  check(
    '进度全部加载（vanilla 1592 + 我们的 4）',
    /Loaded \d+ advancements/.test(full),
    (full.match(/Loaded (\d+) advancements/) ?? ['', '?'])[1]
  );
  check(
    '插件自检：N 个自定义成就就绪',
    /内置数据包加载成功，\d+ 个自定义成就已就绪/.test(full),
    (full.match(/内置数据包加载成功，(\d+) 个/) ?? ['', '?'])[1]
  );
  check(
    '插件进入启用列表',
    /FlowEditorTest \(1\.0\.0\)/.test(full) || /- FlowEditorTest/.test(full)
  );
  check('无端口冲突崩溃', !/Failed to bind to port/.test(full));
  check('无插件启用异常', !/Error occurred while enabling/.test(full));
  check(
    '无我们的包名异常栈',
    !/dev\.floweditor\.flowtest[\s\S]{0,200}Exception/.test(full) &&
      !/Exception[\s\S]{0,200}dev\.floweditor\.flowtest/.test(full)
  );
} finally {
  // 停服：stop → 等 exit → 45s 后 taskkill /T /F 强杀（Moonrise 关闭池
  // 可能挂起致进程不退）；强杀后兜底放行，绝不悬挂脚本
  if (child.exitCode === null) {
    try {
      child.stdin.write('stop\n');
    } catch {
      // 进程已退出
    }
    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      child.on('exit', finish);
      setTimeout(() => {
        if (!settled && child.exitCode === null) {
          try {
            if (process.platform === 'win32') {
              spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
            } else {
              child.kill('SIGKILL');
            }
          } catch {
            // 尽力而为
          }
          setTimeout(finish, 8000);
        } else {
          finish();
        }
      }, 45_000);
    });
  }
  // 清理（句柄延迟释放时重试；失败不掩盖验证结果）
  try {
    rmSync(pluginJar, { force: true, maxRetries: 20, retryDelay: 500 });
    rmSync(pluginDataDir, { force: true, maxRetries: 20, recursive: true, retryDelay: 500 });
  } catch (error) {
    console.log(`WARN: 清理失败（${error.code ?? error.message}），可手动删除`);
  }
}

const failed = results.filter((r) => !r.ok);
console.log(
  failed.length === 0
    ? `\nPAPER-LIVE OK — ${results.length}/${results.length} checks passed`
    : `\nPAPER-LIVE FAILED — ${failed.length}/${results.length} checks failed`
);
if (failed.length > 0) {
  console.log('--- latest.log 尾部 ---\n' + readLog().split('\n').slice(-40).join('\n'));
}
process.exit(failed.length === 0 ? 0 : 1);
