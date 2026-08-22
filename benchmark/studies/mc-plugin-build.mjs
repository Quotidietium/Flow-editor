/**
 * MC 进度设计器插件（plugins/examples/mc-advancement.mjs）工程级冒烟：
 * 用覆盖全部 21 种触发器的样本图导出 Maven 工程并解包到系统临时目录，
 * 可接 --mvn 离线编译验证生成的 Java 源码（Paper API 需本地仓库缓存，
 * 首次需联网拉取一次依赖）。
 *
 * 用法：
 *   node benchmark/studies/mc-plugin-build.mjs          # 仅生成+解包
 *   node benchmark/studies/mc-plugin-build.mjs --mvn    # 生成后离线编译验证
 */
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const source = readFileSync('plugins/examples/mc-advancement.mjs', 'utf8');
const mod = await import(
  'data:text/javascript;base64,' + Buffer.from(source, 'utf8').toString('base64')
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
  for (const p of t.params) {
    params[p.key] = p.def;
  }
  if (t.id === 'chat_keyword') {
    params.keyword = '萌新报到';
  }
  meta.nodes[id] = { params, trigger: t.id };
}
const result = CORE.exportZip(CORE.buildCode(meta, 'TD', nodes, edges));
if (!result.ok) {
  console.error('导出失败', result.errors);
  process.exit(1);
}

// store zip 解包（中央目录遍历）
const bytes = result.bytes;
const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const eocd = bytes.length - 22;
const count = view.getUint16(eocd + 10, true);
let p = view.getUint32(eocd + 16, true);
const outDir = join(tmpdir(), 'mc-plugin-build');
rmSync(outDir, { force: true, recursive: true });
const decoder = new TextDecoder();
for (let i = 0; i < count; i++) {
  const nameLen = view.getUint16(p + 28, true);
  const size = view.getUint32(p + 24, true);
  const localOff = view.getUint32(p + 42, true);
  const name = decoder.decode(bytes.slice(p + 46, p + 46 + nameLen));
  const localNameLen = view.getUint16(localOff + 26, true);
  const data = bytes.slice(localOff + 30 + localNameLen, localOff + 30 + localNameLen + size);
  const target = join(outDir, ...name.split('/'));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, data);
  p += 46 + nameLen;
}
console.log(
  `导出 ${result.files.length} 个文件（${CORE.TRIGGERS.length} 种触发器全分支）→ ${outDir}`
);

if (process.argv.includes('--mvn')) {
  // 经 shell 调用以兼容 Windows 的 mvn.cmd
  execSync('mvn compile -o -q', { cwd: outDir, stdio: 'inherit' });
  console.log('mvn compile: BUILD SUCCESS');
}
