/**
 * MC 离线编译器（app/mc-build.cjs）Node 级探测：
 * 校验面（路径穿越/空清单/超量/缺 java 源/缺工具链）全量覆盖；
 * 本机有 JDK 21+ 时执行真实 javac+jar 端到端编译并解析产物 jar。
 * 构建安装包前由 build.ps1 调用；无 JDK 的构建机上编译用例 SKIP 但校验用例必跑。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const installerRoot = path.resolve(here, '..');
const repoRoot = path.resolve(installerRoot, '..');
const require = createRequire(import.meta.url);
const { build } = require(path.join(installerRoot, 'app', 'mc-build.cjs'));

const toolchainDir = path.join(installerRoot, 'toolchain');
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

// 样本工程：复用示例插件生成器（21 触发器全分支，最强编译覆盖）
const pluginSource = readFileSync(
  path.join(repoRoot, 'plugins/examples/mc-advancement.mjs'),
  'utf8'
);
const mod = await import(
  'data:text/javascript;base64,' + Buffer.from(pluginSource, 'utf8').toString('base64')
);
const CORE = mod._core;

const meta = CORE.readMeta(CORE.starterCode()).meta;
const nodes = [{ id: 'root', label: '全触发器测试', shape: 'rect' }];
const edges = [];
meta.nodes = {};
let prev = 'root';
for (const t of CORE.TRIGGERS) {
  const id = 't_' + t.id;
  nodes.push({
    id,
    label: t.id,
    shape: t.id === 'kill' ? 'diamond' : t.id === 'join' ? 'round' : 'rect'
  });
  edges.push({ from: prev, to: id });
  prev = id;
  const params = {};
  for (const p of t.params) params[p.key] = p.def;
  if (t.id === 'chat_keyword') params.keyword = '萌新报到';
  meta.nodes[id] = { params, trigger: t.id };
}
const request = CORE.buildJarRequest(CORE.buildCode(meta, 'TD', nodes, edges));
if (!request.ok) {
  console.error('样本生成失败', request.errors);
  process.exit(1);
}

// ---------- 校验面 ----------
{
  const traversal = await build(
    [{ path: 'src/main/java/../../etc/evil.java', text: 'class Evil {}' }],
    { toolchainDir }
  );
  check('path 穿越被拒绝', traversal.ok === false && traversal.error.code === 'INVALID_FILES');

  const absolute = await build([{ path: 'C:/Windows/x.java', text: 'class X {}' }], {
    toolchainDir
  });
  check('绝对路径被拒绝', absolute.ok === false && absolute.error.code === 'INVALID_FILES');

  const empty = await build([], { toolchainDir });
  check('空清单被拒绝', empty.ok === false && empty.error.code === 'INVALID_FILES');

  const noJava = await build([{ path: 'src/main/resources/config.yml', text: 'x: 1\n' }], {
    toolchainDir
  });
  check('缺 java 源被拒绝', noJava.ok === false && noJava.error.code === 'INVALID_FILES');

  const noToolchain = await build(request.files, {
    toolchainDir: path.join(installerRoot, 'definitely-no-such-dir')
  });
  check(
    '缺工具链报 TOOLCHAIN_MISSING',
    noToolchain.ok === false && noToolchain.error.code === 'TOOLCHAIN_MISSING'
  );

  const bogusJavac = await build(request.files, {
    javacPath: path.join(installerRoot, 'no-such-javac.exe'),
    toolchainDir
  });
  check(
    '坏 javac 路径回退系统探测或报 JDK_NOT_FOUND',
    bogusJavac.ok === true ||
      bogusJavac.error.code === 'JDK_NOT_FOUND' ||
      bogusJavac.error.code === 'JDK_TOO_OLD'
  );
}

// ---------- 端到端编译（需要本机 JDK 21+） ----------
const result = await build(request.files, { filename: request.filename, toolchainDir });
if (!result.ok && (result.error.code === 'JDK_NOT_FOUND' || result.error.code === 'JDK_TOO_OLD')) {
  check('端到端编译（无 JDK 21+，跳过）', true, result.error.code);
} else {
  check(
    '端到端编译成功',
    result.ok === true,
    result.ok ? result.jdkVersion : result.error?.message
  );

  // 单触发器极小工程：helper 生成门的最严苛情形（无 countUp/无 param/纯事件
  // 直授等形态各选一个代表）
  const singles = ['ride', 'portal', 'xp_gain', 'glide', 'shear'];
  let singlesOk = true;
  let singlesDetail = '';
  for (const tid of singles) {
    const spec = CORE.TRIGGERS.find((t) => t.id === tid);
    const params = {};
    for (const p of spec.params) {
      params[p.key] = p.def;
    }
    if (tid === 'chat_keyword') {
      params.keyword = 'hi';
    }
    const singleMeta = CORE.readMeta(CORE.starterCode()).meta;
    singleMeta.nodes = { a: { params, trigger: tid } };
    const singleCode = CORE.buildCode(
      singleMeta,
      'TD',
      [
        { id: 'r', label: '根', shape: 'rect' },
        { id: 'a', label: spec.name, shape: 'rect' }
      ],
      [{ from: 'r', to: 'a' }]
    );
    const singleReq = CORE.buildJarRequest(singleCode);
    const single = await build(singleReq.files, {
      filename: singleReq.filename,
      toolchainDir
    });
    if (!single.ok) {
      singlesOk = false;
      singlesDetail += `${tid}: ${single.error?.message ?? ''} `;
    }
  }
  check('单触发器极小工程编译（ride/portal/xp_gain/glide/shear）', singlesOk, singlesDetail);

  if (result.ok) {
    // 经中央目录解析 jar（jar 工具写数据描述符，本地头无尺寸；条目 deflate）
    const { inflateRawSync } = await import('node:zlib');
    const bytes = Buffer.from(result.jarBase64, 'base64');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const eocd = bytes.length - 22;
    const count = view.getUint16(eocd + 10, true);
    let p = view.getUint32(eocd + 16, true);
    const entries = new Map();
    for (let i = 0; i < count; i++) {
      const method = view.getUint16(p + 10, true);
      const csize = view.getUint32(p + 20, true);
      const nameLen = view.getUint16(p + 28, true);
      const extraLen = view.getUint16(p + 30, true);
      const commentLen = view.getUint16(p + 32, true);
      const localOff = view.getUint32(p + 42, true);
      const name = bytes.slice(p + 46, p + 46 + nameLen).toString('utf8');
      const localNameLen = view.getUint16(localOff + 26, true);
      const localExtraLen = view.getUint16(localOff + 28, true);
      const start = localOff + 30 + localNameLen + localExtraLen;
      const raw = bytes.slice(start, start + csize);
      entries.set(name, method === 8 ? inflateRawSync(raw) : raw);
      p += 46 + nameLen + extraLen + commentLen;
    }
    const names = [...entries.keys()];
    check(
      'jar 含编译产物 .class',
      names.some((n) => n.endsWith('AchievementListener.class'))
    );
    check('jar 含数据包根进度', names.includes('datapack/data/myach/advancement/root.json'));
    check('jar 含插件清单', names.includes('paper-plugin.yml'));

    const yml = entries.get('paper-plugin.yml')?.toString('utf8') ?? '';
    check(
      'paper-plugin.yml 版本已置换',
      yml.includes("version: '1.0.0'"),
      yml.split('\n')[1] ?? ''
    );
  }
}

const failed = results.filter((r) => !r.ok);
console.log(
  failed.length === 0
    ? `\nMC-BUILD OK — ${results.length}/${results.length} checks passed`
    : `\nMC-BUILD FAILED — ${failed.length}/${results.length} checks failed`
);
process.exit(failed.length === 0 ? 0 : 1);
