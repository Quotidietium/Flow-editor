/**
 * MC 进度设计器示例插件（plugins/examples/mc-advancement.mjs）单元测试。
 * 加载方式与注册表一致：读源码后经 data: URI 动态 import。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateCode, parseCode } from '../util/visualEditor/model';

interface Issue {
  msg: string;
  nodeId?: string;
  scope?: string;
  tabId?: string;
}
interface AnalysisNode {
  frame: string;
  id: string;
  label: string;
  meta: {
    desc?: string;
    icon?: string;
    loot?: unknown[];
    style?: { fill?: string; stroke?: string };
    trigger?: string;
    xp?: number;
  };
  nid: string;
  params: Record<string, unknown>;
  parent: null | string;
  shape: string;
  tab: null | string;
}
interface Analysis {
  edges: { from: string; label?: string; to: string }[];
  errors: Issue[];
  meta: Record<string, unknown>;
  nodes: AnalysisNode[];
  ok: boolean;
  tabs: { members: string[]; name: string; rootId: string; rootNid: string }[];
  skipped?: number;
  warnings: Issue[];
}
interface TriggerParam {
  def: string | number | boolean;
  key: string;
  label: string;
  min?: number;
  ph?: string;
  type: 'bool' | 'int' | 'select' | 'text';
}
interface TriggerSpec {
  counted: boolean;
  desc: string;
  event: string;
  id: string;
  name: string;
  params: TriggerParam[];
}

interface Core {
  TRIGGERS: TriggerSpec[];
  triggerById(id: string): TriggerSpec;
  triggerGroup(id: string): string;
  analyze(code: string): Analysis;
  buildCode(
    meta: unknown,
    direction: string,
    nodes: unknown[],
    edges: unknown[],
    groups?: { id: string; label: string; memberIds: string[] }[]
  ): string;
  buildJarRequest(
    code: string
  ):
    | { analysis: Analysis; filename: string; files: { path: string; text: string }[]; ok: true }
    | { errors: Issue[]; ok: false };
  buildZip(files: { path: string; text: string }[]): Uint8Array;
  importDatapackZip(bytes: Uint8Array): Promise<{ code: string; warnings: string[] } | undefined>;
  readZipEntries(bytes: Uint8Array): Promise<Map<string, Uint8Array>>;
  exportZip(code: string):
    | {
        analysis: Analysis;
        bytes: Uint8Array;
        filename: string;
        files: { path: string; text: string }[];
        ok: true;
      }
    | { errors: Issue[]; ok: false };
  generateFiles(a: Analysis): { path: string; text: string }[];
  normId(id: string): string;
  parseFlow(body: string): {
    direction: string;
    edges: { from: string; label: string; to: string }[];
    groupOf: Map<string, string>;
    groups: { id: string; label: string }[];
    nodes: { id: string; label: string; shape: string }[];
    skipped: number;
    styleOf: Map<string, { fill?: string; stroke?: string }>;
  };
  readMeta(code: string): {
    body: string;
    meta: Record<string, unknown> & {
      nodes: Record<string, unknown>;
      tabs: Record<string, unknown>;
    };
    metaFound: boolean;
  };
  starterCode(): string;
}
interface ExportCtx {
  notify(msg: string): void;
}
interface ExportPayload {
  blob?: Blob;
  filename: string;
}
interface PluginModule {
  _core: Core;
  default: {
    exports?: {
      id: string;
      label: string;
      run(
        input: { code: string },
        ctx: ExportCtx
      ): ExportPayload | undefined | Promise<ExportPayload | undefined>;
    }[];
    frontend: { sandbox?: string; url: string };
    id: string;
    name: string;
    permissions: string[];
    version: string;
  };
}

const pluginPath = resolve(process.cwd(), 'plugins/examples/mc-advancement.mjs');
const pluginSource = readFileSync(pluginPath, 'utf8');
const dataUrl = `data:text/javascript;base64,${Buffer.from(pluginSource, 'utf8').toString('base64')}`;
const mod = (await import(/* @vite-ignore */ dataUrl)) as unknown as PluginModule;
const CORE = mod._core;
const plugin = mod.default;

/** 最小 zip 读取器：按中央目录提取全部条目（store 模式）。 */
const readZip = (bytes: Uint8Array): { data: string; name: string }[] => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const eocd = bytes.length - 22;
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries: { data: string; name: string }[] = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02_01_4b_50) {
      throw new Error(`中央目录签名错误 @${p}`);
    }
    const nameLen = view.getUint16(p + 28, true);
    const size = view.getUint32(p + 24, true);
    const crc = view.getUint32(p + 16, true);
    const localOff = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.slice(p + 46, p + 46 + nameLen));
    if (view.getUint32(localOff, true) !== 0x04_03_4b_50) {
      throw new Error(`本地文件头签名错误: ${name}`);
    }
    const localNameLen = view.getUint16(localOff + 26, true);
    const dataStart = localOff + 30 + localNameLen;
    const data = bytes.slice(dataStart, dataStart + size);
    // CRC 校验
    let c = 0xff_ff_ff_ff;
    const TABLE = (() => {
      const t = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let cc = n;
        for (let k = 0; k < 8; k++) {
          cc = cc & 1 ? 0xed_b8_83_20 ^ (cc >>> 1) : cc >>> 1;
        }
        t[n] = cc >>> 0;
      }
      return t;
    })();
    for (const byte of data) {
      c = TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
    }
    expect((c ^ 0xff_ff_ff_ff) >>> 0).toBe(crc);
    entries.push({ data: decoder.decode(data), name });
    p += 46 + nameLen;
  }
  return entries;
};

describe('parseFlow：流程图解析', () => {
  it('触发器注册表：30 种、分组覆盖全部、无重名', () => {
    expect(CORE.TRIGGERS).toHaveLength(30);
    const ids = CORE.TRIGGERS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(CORE.triggerGroup(id)).not.toBe('其他');
    }
  });

  it('新触发器（循环2 新增 9 种）生成对应 Java 分支与 config 键', () => {
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    const newIds = [
      'shear',
      'ride',
      'portal',
      'damage_taken',
      'projectile_hit',
      'glide',
      'swim',
      'bucket_fill',
      'xp_gain'
    ];
    const nodes = [{ id: 'root', label: '根', shape: 'rect' }];
    const edges: { from: string; to: string }[] = [];
    meta.nodes = {};
    let prev = 'root';
    for (const tid of newIds) {
      nodes.push({ id: `t_${tid}`, label: tid, shape: 'rect' });
      edges.push({ from: prev, to: `t_${tid}` });
      prev = `t_${tid}`;
      const params: Record<string, unknown> = {};
      for (const p of CORE.triggerById(tid).params) {
        params[p.key] = p.def;
      }
      meta.nodes[`t_${tid}`] = { params, trigger: tid };
    }
    const r = CORE.exportZip(CORE.buildCode(meta, 'TD', nodes, edges));
    if (!r.ok) {
      throw new Error(r.errors.map((e) => e.msg).join('; '));
    }
    const listener = r.files.find((f) => f.path.endsWith('AchievementListener.java'))?.text ?? '';
    for (const marker of [
      'PlayerShearEntityEvent',
      'EntityMountEvent',
      'EntityPortalEnterEvent',
      'EntityDamageEvent',
      'ProjectileHitEvent',
      'EntityToggleGlideEvent',
      'EntityToggleSwimEvent',
      'PlayerBucketFillEvent',
      'PlayerExpChangeEvent'
    ]) {
      expect(listener).toContain(marker);
    }
    const config = r.files.find((f) => f.path.endsWith('config.yml'))?.text ?? '';
    expect(config).toContain('amount: 1000'); // xp_gain 默认
  });

  it('join 的 config 键与 Java 读取键一致（firstOnly，非 first-only）', () => {
    const r = CORE.exportZip(CORE.starterCode());
    if (!r.ok) {
      throw new Error('starter 导出失败');
    }
    const config = r.files.find((f) => f.path.endsWith('config.yml'))?.text ?? '';
    const listener = r.files.find((f) => f.path.endsWith('AchievementListener.java'))?.text ?? '';
    expect(config).toContain('firstOnly: true');
    expect(listener).toContain('"firstOnly"');
    expect(listener).not.toContain('"first-only"');
  });

  it('解析可视化编辑器规范输出（形状/引号/链式/标签边）', () => {
    const flow = CORE.parseFlow(`flowchart TD
    root["示例成就"]
    first_join(你好，世界！)
    special(["含 (括号) 标签"])
    boss{最终挑战}
    root --> first_join
    first_join --> special --> boss
    boss -->|可选步骤| root
`);
    expect(flow.nodes).toHaveLength(4);
    expect(flow.nodes[0]).toMatchObject({ id: 'root', label: '示例成就', shape: 'rect' });
    expect(flow.nodes[1]).toMatchObject({ shape: 'round' });
    expect(flow.nodes[2]).toMatchObject({ label: '含 (括号) 标签', shape: 'stadium' });
    expect(flow.nodes[3]).toMatchObject({ shape: 'diamond' });
    expect(flow.edges).toHaveLength(4);
    expect(flow.edges[2]).toMatchObject({ from: 'special', to: 'boss' });
    expect(flow.edges[3].label).toBe('可选步骤');
  });

  it('兼容手写形态（graph 头/分号/虚线/文字边/注释跳过、style 解析）', () => {
    const flow = CORE.parseFlow(`graph LR
    %% 这是注释
    a[x]; b(y)
    a -- 文字 --> b
    b -.-> a
    style a fill:#fff
`);
    expect(flow.direction).toBe('LR');
    expect(flow.nodes).toHaveLength(2);
    expect(flow.edges).toHaveLength(2);
    expect(flow.edges[0].label).toBe('文字');
    expect(flow.skipped).toBeGreaterThanOrEqual(1); // 注释行仍跳过
    expect(flow.styleOf.get('a')).toEqual({ fill: '#fff' }); // style 行现被解析
  });
});

describe('frontmatter 元数据', () => {
  it('buildCode ↔ readMeta 往返保持插件设置', () => {
    const meta = {
      ...CORE.readMeta('flowchart TD\n a[x]\n').meta,
      namespace: 'test_ns',
      plugin: 'TestAch'
    };
    const code = CORE.buildCode(meta, 'LR', [{ id: 'a', label: 'x', shape: 'rect' }], []);
    const back = CORE.readMeta(code);
    expect(back.metaFound).toBe(true);
    expect(back.meta.namespace).toBe('test_ns');
    expect(back.meta.plugin).toBe('TestAch');
    expect(back.body).toContain('flowchart LR');
  });

  it('无 frontmatter / 非 JSON frontmatter 的容错', () => {
    expect(CORE.readMeta('flowchart TD\n a[x]\n').metaFound).toBe(false);
    const broken = CORE.analyze('---\n{not json\n---\nflowchart TD\n a[x]\n');
    expect(broken.errors.some((e) => e.msg.includes('frontmatter'))).toBe(true);
  });
});

describe('analyze：校验与建树', () => {
  it('入门模板：1 栏 3 节点（含根），校验通过', () => {
    const a = CORE.analyze(CORE.starterCode());
    expect(a.errors).toEqual([]);
    expect(a.ok).toBe(true);
    expect(a.tabs).toHaveLength(1);
    expect(a.tabs[0].name).toBe('示例成就');
    expect(a.nodes).toHaveLength(3);
    const root = a.nodes.find((n) => n.parent === null);
    expect(root?.id).toBe('root');
    const breaker = a.nodes.find((n) => n.id === 'block_breaker');
    expect(breaker?.frame).toBe('goal');
    expect(breaker?.parent).toBe('first_join');
  });

  it('多连通分量 = 多成就栏', () => {
    const code = `flowchart TD
    r1[栏一]
    a1[成就一]
    r1 --> a1
    r2[栏二]
    b1[成就二]
    r2 --> b1
`;
    const a = CORE.analyze(code);
    expect(a.ok).toBe(true);
    expect(a.tabs).toHaveLength(2);
    expect(a.tabs.map((t) => t.name)).toEqual(['栏一', '栏二']);
    expect(a.nodes.find((n) => n.id === 'b1')?.tab).toBe('r2');
  });

  it('环 / 多根 / id 冲突 / 非流程图均为错误', () => {
    const cycle = CORE.analyze('flowchart TD\n a[x] --> b\n b --> a\n');
    expect(cycle.ok).toBe(false);
    expect(cycle.errors.some((e) => e.msg.includes('环'))).toBe(true);

    const multiRoot = CORE.analyze('flowchart TD\n a[x]\n b[y]\n a --> c\n b --> c\n c[z]\n');
    expect(multiRoot.ok).toBe(false);
    expect(multiRoot.errors.some((e) => e.msg.includes('无父级'))).toBe(true);

    const collision = CORE.analyze('flowchart TD\n r[根]\n r --> N-1\n r --> N_1\n');
    expect(collision.ok).toBe(false);
    expect(collision.errors.some((e) => e.msg.includes('同一个成就 id'))).toBe(true);

    const notFlow = CORE.analyze('sequenceDiagram\n Alice->>Bob: hi\n');
    expect(notFlow.ok).toBe(false);
    expect(notFlow.errors[0].msg).toContain('流程图');
  });

  it('触发器参数校验：amount < 1 报错；聊天关键词缺失报错', () => {
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    meta.nodes = {
      b: { params: { amount: 0, material: '' }, trigger: 'break_block' },
      c: { trigger: 'chat_keyword' }
    };
    const code = CORE.buildCode(
      meta,
      'TD',
      [
        { id: 'r', label: '根', shape: 'rect' },
        { id: 'b', label: '挖', shape: 'rect' },
        { id: 'c', label: '聊', shape: 'rect' }
      ],
      [
        { from: 'r', to: 'b' },
        { from: 'r', to: 'c' }
      ]
    );
    const a = CORE.analyze(code);
    expect(a.errors.some((e) => e.msg.includes('整数'))).toBe(true);
    expect(a.errors.some((e) => e.msg.includes('关键词'))).toBe(true);
  });

  it('reach_height 允许负 Y（below 模式）', () => {
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    meta.nodes = { deep: { params: { mode: 'below', y: -60 }, trigger: 'reach_height' } };
    const code = CORE.buildCode(
      meta,
      'TD',
      [
        { id: 'r', label: '根', shape: 'rect' },
        { id: 'deep', label: '深潜', shape: 'rect' }
      ],
      [{ from: 'r', to: 'deep' }]
    );
    const a = CORE.analyze(code);
    expect(a.errors).toEqual([]);
    expect(a.ok).toBe(true);
  });

  it('保留命名空间报错；非法图标/非法插件名/版本号产生警告', () => {
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    meta.namespace = 'Minecraft';
    meta.plugin = '我的插件';
    meta.version = '1.0 你好';
    meta.nodes = { a: { icon: ' Iron Pickaxe!!' } };
    const code = CORE.buildCode(
      meta,
      'TD',
      [
        { id: 'r', label: '根', shape: 'rect' },
        { id: 'a', label: '甲', shape: 'rect' }
      ],
      [{ from: 'r', to: 'a' }]
    );
    const a = CORE.analyze(code);
    expect(a.errors.some((e) => e.msg.includes('保留命名空间'))).toBe(true);
    expect(a.warnings.some((w) => w.msg.includes('图标'))).toBe(true);
    expect(a.warnings.some((w) => w.msg.includes('插件名'))).toBe(true);
    expect(a.warnings.some((w) => w.msg.includes('版本号'))).toBe(true);
    // 命名空间被规范为小写 minecraft 后才命中保留名单
    expect(a.meta.namespace).toBe('minecraft');
  });

  it('Java 枚举名冲突报错（1abc 与 a_1abc 都映射 A_1ABC）', () => {
    const code = 'flowchart TD\n r[根]\n r --> 1abc\n r --> a_1abc\n 1abc[甲]\n a_1abc[乙]\n';
    const a = CORE.analyze(code);
    expect(a.ok).toBe(false);
    expect(a.errors.some((e) => e.msg.includes('同名 Java 枚举'))).toBe(true);
  });

  it('非法分量的节点保留在模型中（tab=null），前端可修复', () => {
    const a = CORE.analyze('flowchart TD\n r[根]\n a[甲]\n b[乙]\n r --> a\n b --> a\n');
    expect(a.ok).toBe(false); // 多根错误
    const stray = a.nodes.find((n) => n.id === 'b');
    expect(stray).toBeDefined();
    expect(stray?.tab).toBeNull();
  });

  it('空名称 / 重复名称 / 非法背景纹理产生警告', () => {
    const code =
      'flowchart TD\n r1[栏一]\n r2[栏二]\n a[同名]\n b[同名]\n c[]\n r1 --> a\n r1 --> b\n r2 --> c\n';
    const a = CORE.analyze(code);
    expect(a.ok).toBe(true); // 警告不阻断
    expect(a.warnings.some((w) => w.msg.includes('显示为空白'))).toBe(true);
    expect(a.warnings.some((w) => w.msg.includes('无法区分'))).toBe(true);

    const meta = CORE.readMeta(CORE.starterCode()).meta;
    meta.tabs = { root: { background: 'not a texture path' } };
    const bgCode = CORE.buildCode(meta, 'TD', [{ id: 'root', label: '根', shape: 'rect' }], []);
    const bgA = CORE.analyze(bgCode);
    expect(bgA.warnings.some((w) => w.msg.includes('背景纹理'))).toBe(true);
  });

  it('advancement_done 触发检查在命名空间分支之前（可指向本插件进度）', () => {
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    meta.nodes = {
      follow: { params: { key: 'myach:first_join' }, trigger: 'advancement_done' }
    };
    const nodes = [
      { id: 'root', label: '根', shape: 'rect' },
      { id: 'first_join', label: '先来', shape: 'rect' },
      { id: 'follow', label: '后至', shape: 'rect' }
    ];
    const edges = [
      { from: 'root', to: 'first_join' },
      { from: 'first_join', to: 'follow' }
    ];
    const r = CORE.exportZip(CORE.buildCode(meta, 'TD', nodes, edges));
    if (!r.ok) {
      throw new Error('导出失败');
    }
    const listener = r.files.find((f) => f.path.endsWith('AchievementListener.java'))?.text ?? '';
    const checkIdx = listener.indexOf('keyString.equalsIgnoreCase');
    const branchIdx = listener.indexOf('Achievement.NAMESPACE.equals');
    expect(checkIdx).toBeGreaterThan(-1);
    expect(branchIdx).toBeGreaterThan(checkIdx);
  });

  it('孤儿元数据与多父级产生警告', () => {
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    meta.nodes = { ghost: { desc: '已删除的节点' } };
    const code = CORE.buildCode(
      meta,
      'TD',
      [
        { id: 'r', label: '根', shape: 'rect' },
        { id: 'a', label: '甲', shape: 'rect' },
        { id: 'b', label: '乙', shape: 'rect' }
      ],
      [
        { from: 'r', to: 'a' },
        { from: 'b', to: 'a' }
      ]
    );
    const a = CORE.analyze(code);
    expect(a.warnings.some((w) => w.msg.includes('ghost'))).toBe(true);
    // b 是无入边节点且与 a 连通 → b 成为第二根？不：r、b 均无入边 → 多根错误 + a 的多父级警告
    expect(a.warnings.some((w) => w.msg.includes('多个父级'))).toBe(true);
  });
});

describe('generateFiles：工程文件生成', () => {
  const result = CORE.exportZip(CORE.starterCode());
  if (!result.ok) {
    throw new Error('入门模板导出失败');
  }
  const files = result.files;
  const byPath = new Map(files.map((f) => [f.path, f.text]));

  it('文件清单完整（pom/yml/mcmeta/数据包 JSON/Java×7/README）', () => {
    const pkg = 'src/main/java/dev/floweditor/myach';
    for (const path of [
      'pom.xml',
      'README.md',
      'src/main/resources/paper-plugin.yml',
      'src/main/resources/config.yml',
      'src/main/resources/datapack/pack.mcmeta',
      'src/main/resources/datapack/data/myach/advancement/root.json',
      'src/main/resources/datapack/data/myach/advancement/first_join.json',
      'src/main/resources/datapack/data/myach/advancement/block_breaker.json',
      'src/main/resources/datapack/data/myach/advancement/root_completionist.json',
      `${pkg}/MyAchievementsPlugin.java`,
      `${pkg}/MyAchievementsBootstrap.java`,
      `${pkg}/Achievement.java`,
      `${pkg}/AchievementService.java`,
      `${pkg}/AchievementListener.java`,
      `${pkg}/ProgressStore.java`,
      `${pkg}/MyAchievementsCommand.java`
    ]) {
      expect(byPath.has(path), path).toBe(true);
    }
  });

  it('成就 JSON 字段正确（root tick / parent / frame / 大满贯 requirements）', () => {
    const root = JSON.parse(
      byPath.get('src/main/resources/datapack/data/myach/advancement/root.json') ?? ''
    );
    expect(root.criteria.tick.trigger).toBe('minecraft:tick');
    expect(root.display.background).toContain('textures/');
    expect(root.display.title.text).toBe('示例成就');

    const join = JSON.parse(
      byPath.get('src/main/resources/datapack/data/myach/advancement/first_join.json') ?? ''
    );
    expect(join.parent).toBe('myach:root');
    expect(join.criteria.grant.trigger).toBe('minecraft:impossible');
    expect(join.display.frame).toBe('task');
    expect(join.display.announce_to_chat).toBe(false);

    const breaker = JSON.parse(
      byPath.get('src/main/resources/datapack/data/myach/advancement/block_breaker.json') ?? ''
    );
    expect(breaker.parent).toBe('myach:first_join');
    expect(breaker.display.frame).toBe('goal');

    const comp = JSON.parse(
      byPath.get('src/main/resources/datapack/data/myach/advancement/root_completionist.json') ?? ''
    );
    expect(comp.display.hidden).toBe(true);
    expect(comp.display.frame).toBe('challenge');
    expect(Object.keys(comp.criteria).sort()).toEqual(['block_breaker', 'first_join']);
    expect(comp.requirements).toEqual([['first_join'], ['block_breaker']]);
    expect(comp.rewards.experience).toBe(100);
  });

  it('suggest 按已输入前缀过滤（循环 26）', () => {
    const r = CORE.exportZip(CORE.starterCode());
    if (!r.ok) {
      throw new Error('导出失败');
    }
    const cmd = r.files.find((f) => f.path.endsWith('Command.java'))?.text ?? '';
    expect(cmd).toContain('.startsWith(prefix)');
    expect(cmd).toContain('List.of("grant", "revoke").stream().filter(matches).toList()');
  });

  it('config.yml / paper-plugin.yml / pom.xml 关键内容', () => {
    const config = byPath.get('src/main/resources/config.yml') ?? '';
    expect(config).toContain('block_breaker:');
    expect(config).toContain('amount: 200');
    expect(config).toContain('firstOnly: true');
    expect(config).toContain('autosave-interval-seconds: 300');

    const yml = byPath.get('src/main/resources/paper-plugin.yml') ?? '';
    expect(yml).toContain('main: dev.floweditor.myach.MyAchievementsPlugin');
    expect(yml).toContain('bootstrapper: dev.floweditor.myach.MyAchievementsBootstrap');
    expect(yml).toContain("api-version: '1.21'");
    // grant 权限显式声明（default op）——未声明权限对权限插件不可见
    expect(yml).toContain('permissions:');
    expect(yml).toContain('myach.grant:');
    expect(yml).toContain('default: op');

    const pom = byPath.get('pom.xml') ?? '';
    expect(pom).toContain('<artifactId>myach</artifactId>');
    expect(pom).toContain('paper-api');
    expect(pom).toContain('${project.name}-${project.version}'); // Maven 占位符未被 JS 插值
  });

  it('Java 生成：枚举项 / 监听器只含用到的触发器分支 / 播报链', () => {
    const pkg = 'src/main/java/dev/floweditor/myach';
    const enumSrc = byPath.get(`${pkg}/Achievement.java`) ?? '';
    expect(enumSrc).toContain('FIRST_JOIN("first_join", "root", "你好，世界！", true)');
    expect(enumSrc).toContain('ROOT("root", "root", "示例成就", false)');
    expect(enumSrc).toContain('ROOT_COMPLETIONIST("root_completionist"');

    const listener = byPath.get(`${pkg}/AchievementListener.java`) ?? '';
    expect(listener).toContain('BlockBreakEvent'); // 用到 break_block
    expect(listener).toContain('PlayerJoinEvent'); // 用到 join
    expect(listener).not.toContain('PlayerFishEvent'); // 未用到 fish
    expect(listener).not.toContain('AsyncChatEvent');
    expect(listener).toContain('awardCriterion(player, comp, achievement.id())');
    // 并发防线：异步事件线程与主线程并发时（循环 23）
    expect(listener).not.toContain('EnumMap'); // Service 缓存改并发容器
    const service = byPath.get(`${pkg}/AchievementService.java`) ?? '';
    expect(service).toContain('new ConcurrentHashMap<>()');
    const store = byPath.get(`${pkg}/ProgressStore.java`) ?? '';
    expect(store).toContain('map.merge(key, delta, Integer::sum)'); // 原子累计
    // chat 触发在异步线程：授予必须调度回主线程（Bukkit API 非线程安全）
    const chatSample = CORE.exportZip(
      (() => {
        const m = CORE.readMeta(CORE.starterCode()).meta;
        m.nodes = { c: { params: { keyword: 'hi' }, trigger: 'chat_keyword' } };
        return CORE.buildCode(
          m,
          'TD',
          [
            { id: 'r', label: '根', shape: 'rect' },
            { id: 'c', label: '聊', shape: 'rect' }
          ],
          [{ from: 'r', to: 'c' }]
        );
      })()
    );
    if (!chatSample.ok) {
      throw new Error('chat 样本失败');
    }
    const chatListener = chatSample.files
      .find((f) => f.path.endsWith('AchievementListener.java'))
      ?.text.includes('getScheduler().runTask(plugin,');
    expect(chatListener).toBe(true); // 异步 chat 授予调度回主线程
    expect(listener).toContain('ENTITY_PLAYER_LEVELUP');
    expect(listener).toContain('store.add(player, achievement.id(), delta)');
    // 阈值下限防护：config 手填 0/负数时成就将永不可达
    expect(listener).toContain('int target = Math.max(1, amount(');

    const main = byPath.get(`${pkg}/MyAchievementsPlugin.java`) ?? '';
    expect(main).toContain('"myach"');
    expect(main).not.toContain('StatWatch'); // 无统计类触发器
  });

  it('统计类触发器生成轮询代码', () => {
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    meta.nodes = { farmer: { params: { minutes: 120 }, trigger: 'playtime' } };
    const code = CORE.buildCode(
      meta,
      'TD',
      [
        { id: 'root', label: '根', shape: 'rect' },
        { id: 'farmer', label: '老玩家', shape: 'rect' }
      ],
      [{ from: 'root', to: 'farmer' }]
    );
    const r = CORE.exportZip(code);
    if (!r.ok) {
      throw new Error('导出失败');
    }
    const main = r.files.find((f) => f.path.endsWith('Plugin.java'))?.text ?? '';
    expect(main).toContain('StatWatch');
    expect(main).toContain('PLAY_ONE_MINUTE');
    expect(main).toContain('pollStatistics');
    const config = r.files.find((f) => f.path.endsWith('config.yml'))?.text ?? '';
    expect(config).toContain('minutes: 120');
  });
});

describe('buildZip：zip 结构', () => {
  it('条目数/路径/CRC 与内容逐字节一致', () => {
    const files = [
      { path: 'a/b.txt', text: '你好 zip' },
      { path: 'c.json', text: '{"x": 1}\n' }
    ];
    const entries = readZip(CORE.buildZip(files));
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ data: '你好 zip', name: 'a/b.txt' });
    expect(entries[1].name).toBe('c.json');
  });

  it('同输入输出逐字节一致（固定时间戳）', () => {
    const files = [{ path: 'a.txt', text: 'x' }];
    expect(CORE.buildZip(files)).toEqual(CORE.buildZip(files));
  });
});

describe('与可视化编辑器模型互操作', () => {
  it('buildCode 输出可被 model.parseCode 无损解析（含 frontmatter）', () => {
    const code = CORE.starterCode();
    const parsed = parseCode(code);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const graph = parsed.result.graph;
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(['block_breaker', 'first_join', 'root']);
    expect(graph.nodes.find((n) => n.id === 'block_breaker')?.shape).toBe('round');
    expect(graph.edges).toHaveLength(2);
    expect(graph.frontmatter).toContain('mcadv');
  });

  it('model.generateCode 输出可被插件 parseFlow 解析（防方言漂移）', () => {
    const parsed = parseCode(CORE.starterCode());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const regenerated = generateCode(parsed.result.graph);
    const flow = CORE.parseFlow(regenerated);
    expect(flow.nodes).toHaveLength(3);
    expect(flow.edges).toHaveLength(2);
    expect(flow.edges.map((e) => `${e.from}->${e.to}`)).toEqual([
      'root->first_join',
      'first_join->block_breaker'
    ]);
    // 画布编辑（生成）后再导出仍应成功
    expect(CORE.exportZip(regenerated).ok).toBe(true);
  });
});

describe('importDatapackZip：逆向导入', () => {
  it('自家导出的 Maven zip 完整往返（触发器/参数/栏设置无损）', async () => {
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    meta.version = '3.2.1';
    meta.nodes = {
      fisher: {
        desc: '钓鱼佬',
        icon: 'minecraft:fishing_rod',
        params: { amount: 7 },
        trigger: 'fish',
        xp: 5
      }
    };
    const original = CORE.buildCode(
      meta,
      'TD',
      [
        { id: 'root', label: '往返栏', shape: 'rect' },
        { id: 'fisher', label: '姜太公', shape: 'round' }
      ],
      [{ from: 'root', to: 'fisher' }]
    );
    const exported = CORE.exportZip(original);
    if (!exported.ok) {
      throw new Error('导出失败');
    }
    const imported = await CORE.importDatapackZip(exported.bytes);
    expect(imported).toBeDefined();
    expect(imported?.code).toContain('subgraph'); // 逆向导入产物带分组语法
    const a = CORE.analyze(imported?.code ?? '');
    expect(a.ok).toBe(true);
    expect(a.tabs).toHaveLength(1);
    expect(a.tabs[0].name).toBe('往返栏');
    const fisher = a.nodes.find((n) => n.id === 'fisher');
    expect(fisher?.meta.trigger).toBe('fish'); // 触发器经溯源还原
    expect(fisher?.params.amount).toBe(7); // 参数无损
    expect(fisher?.meta.xp).toBe(5);
    expect(fisher?.frame).toBe('goal'); // 形状由 frame 反推
    expect(a.meta.version).toBe('3.2.1'); // 全局设置无损
  });

  it('外部数据包尽力还原（结构/显示/奖励可恢复，触发器退化为命令授予）', async () => {
    const root = {
      criteria: { tick: { trigger: 'minecraft:tick' } },
      display: {
        background: 'minecraft:textures/block/stone.png',
        description: { text: '外部栏' },
        icon: { id: 'minecraft:compass' },
        title: { text: '外部成就栏' }
      }
    };
    const child = {
      criteria: { done: { trigger: 'minecraft:impossible' } },
      display: {
        description: { text: '外部子成就' },
        frame: 'challenge',
        icon: { id: 'minecraft:diamond' },
        title: { text: '外部挑战' }
      },
      parent: 'foreign:root',
      rewards: { experience: 42 }
    };
    const bytes = CORE.buildZip([
      { path: 'pack.mcmeta', text: '{"pack":{"pack_format":94}}' },
      { path: 'data/foreign/advancement/root.json', text: JSON.stringify(root) },
      { path: 'data/foreign/advancement/challenge.json', text: JSON.stringify(child) }
    ]);
    const imported = await CORE.importDatapackZip(bytes);
    expect(imported).toBeDefined();
    const a = CORE.analyze(imported?.code ?? '');
    expect(a.ok).toBe(true);
    expect(a.meta.namespace).toBe('foreign');
    expect(a.tabs).toHaveLength(1);
    expect(a.tabs[0].name).toBe('外部成就栏');
    const node = a.nodes.find((n) => n.id === 'challenge');
    expect(node?.parent).toBe('root');
    expect(node?.frame).toBe('challenge');
    expect(node?.meta.desc).toBe('外部子成就');
    expect(node?.meta.icon).toBe('minecraft:diamond');
    expect(node?.meta.xp).toBe(42);
    expect(node?.meta.trigger).toBe('manual'); // impossible 无法反推
    const tabMeta = (a.meta.tabs as Record<string, { background?: string }>).root;
    expect(tabMeta?.background).toBe('minecraft:textures/block/stone.png');
  });

  it('非数据包 zip 返回 undefined（放行给内置解析器）', async () => {
    const bytes = CORE.buildZip([{ path: 'hello.txt', text: 'hi' }]);
    expect(await CORE.importDatapackZip(bytes)).toBeUndefined();
    expect(await CORE.importDatapackZip(new Uint8Array([1, 2, 3]))).toBeUndefined();
  });

  it('readZipEntries 解析自家 store zip 的全部条目', async () => {
    const bytes = CORE.buildZip([
      { path: 'a.txt', text: '你好' },
      { path: 'dir/b.json', text: '{"x":1}' }
    ]);
    const entries = await CORE.readZipEntries(bytes);
    expect([...entries.keys()].sort()).toEqual(['a.txt', 'dir/b.json']);
    expect(new TextDecoder().decode(entries.get('a.txt') ?? new Uint8Array())).toBe('你好');
  });

  it('readZipEntries 拒绝膨胀超限的 zip（32MB 护栏）', async () => {
    const huge = CORE.buildZip([
      // 单条 33MB store 条目：任何真实成就数据包都远小于此
      { path: 'bomb.bin', text: 'x'.repeat(33 * 1024 * 1024) }
    ]);
    await expect(CORE.readZipEntries(huge)).rejects.toThrow('ZIP_TOO_LARGE');
    // 超限 zip 整体放弃导入（放行给内置解析器）
    expect(await CORE.importDatapackZip(huge)).toBeUndefined();
  });
});

describe('subgraph 成就栏（循环 11）', () => {
  const groupedCode = `flowchart TD
    subgraph adv_main["冒险栏"]
        mine[挖矿达人]
        mine --> fight[战斗狂人]
    end
    subgraph life["生活栏"]
        cook[干饭人]
    end
`;

  it('parseFlow 解析 subgraph：组归属/标题/组内外边', () => {
    const flow = CORE.parseFlow(groupedCode);
    expect(flow.groups).toEqual([
      { id: 'adv_main', label: '冒险栏' },
      { id: 'life', label: '生活栏' }
    ]);
    expect(flow.groupOf.get('mine')).toBe('adv_main');
    expect(flow.groupOf.get('cook')).toBe('life');
    expect(flow.edges).toEqual([{ from: 'mine', label: '', to: 'fight' }]);
  });

  it('analyze：subgraph = 成就栏（组 id 为根、标题为栏名）', () => {
    const a = CORE.analyze(groupedCode);
    expect(a.ok).toBe(true);
    expect(a.tabs).toHaveLength(2);
    expect(a.tabs.map((t) => t.name)).toEqual(['冒险栏', '生活栏']);
    expect(a.tabs[0].rootId).toBe('adv_main');
    expect(a.tabs[0].members).toContain('mine');
    expect(a.tabs[0].members).toContain('fight');
    expect(a.nodes.find((n) => n.id === 'fight')?.parent).toBe('mine');
    expect(a.nodes.find((n) => n.id === 'cook')?.tab).toBe('life');
  });

  it('跨 subgraph 连线被忽略并给出警告（成员回落到组根）', () => {
    const cross = `${groupedCode}    cook --> mine\n`;
    const a = CORE.analyze(cross);
    expect(a.ok).toBe(true);
    expect(a.warnings.some((w) => w.msg.includes('跨成就栏'))).toBe(true);
    // 跨栏边未建立承接——mine 归属冒险栏（挂组根，而非 cook）
    expect(a.nodes.find((n) => n.id === 'mine')?.parent).toBe('adv_main');
    expect(a.nodes.find((n) => n.id === 'mine')?.tab).toBe('adv_main');
  });

  it('subgraph 与游离节点混用：游离节点仍按连通分量成栏', () => {
    const mixed = `${groupedCode}    loner_root[孤栏]\n    loner_root --> loner_child[孤民]\n`;
    const a = CORE.analyze(mixed);
    expect(a.ok).toBe(true);
    expect(a.tabs).toHaveLength(3);
    expect(a.tabs.map((t) => t.name)).toContain('孤栏');
  });

  it('buildCode(groups) ↔ analyze 往返不动点（subgraph 形态保持）', () => {
    const first = CORE.analyze(groupedCode);
    if (!first.ok) {
      throw new Error('预分析失败');
    }
    const nodes = first.nodes.map((n) => ({ id: n.id, label: n.label, shape: n.shape }));
    const groups = first.tabs.map((t) => ({
      id: t.rootId,
      label: t.name,
      memberIds: t.members
    }));
    const rebuilt = CORE.buildCode(first.meta, 'TD', nodes, first.edges, groups);
    expect(rebuilt).toContain('subgraph adv_main["冒险栏"]');
    const second = CORE.analyze(rebuilt);
    expect(second.ok).toBe(true);
    expect(second.tabs.map((t) => t.name)).toEqual(['冒险栏', '生活栏']);
    expect(second.tabs[0].members).toEqual(first.tabs[0].members);
  });

  it('subgraph 组内环报错；未连线成员自动挂到组根（subgraph 已表达归属）', () => {
    const cycle =
      'flowchart TD\n    subgraph g["栏"]\n        a[甲]\n        a --> b[乙]\n        b --> a\n    end\n';
    const a = CORE.analyze(cycle);
    expect(a.ok).toBe(false);
    expect(a.errors.some((e) => e.msg.includes('subgraph「栏」内存在环'))).toBe(true);

    const plain = 'flowchart TD\n    subgraph g["栏"]\n        a[甲]\n        b[乙]\n    end\n';
    const ok = CORE.analyze(plain);
    expect(ok.ok).toBe(true); // 未连线成员自动挂根，不报多根
    expect(ok.nodes.find((n) => n.id === 'a')?.parent).toBe('g');
    expect(ok.nodes.find((n) => n.id === 'b')?.parent).toBe('g');
  });

  it('生成的 subgraph 代码可被可视化编辑器导入（画布兼容取舍不阻塞）', () => {
    const a = CORE.analyze(groupedCode);
    if (!a.ok) {
      throw new Error('预分析失败');
    }
    const rebuilt = CORE.buildCode(
      a.meta,
      'TD',
      a.nodes.map((n) => ({ id: n.id, label: n.label, shape: n.shape })),
      a.edges,
      a.tabs.map((t) => ({ id: t.rootId, label: t.name, memberIds: t.members }))
    );
    const parsed = parseCode(rebuilt);
    expect(parsed.ok).toBe(true);
  });
});

describe('循环 49：新参数边界探针', () => {
  it('小写枚举建议规范（文案不再错报「降级为任意」）；cause 域外值为错误', () => {
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    meta.nodes = {
      t: { params: { amount: 1, profession: 'farmer' }, trigger: 'trade' },
      k: { params: { amount: 1, cause: 'NUKE', entity: '' }, trigger: 'kill' }
    };
    const a = CORE.analyze(
      CORE.buildCode(
        meta,
        'TD',
        [
          { id: 'root', label: '根', shape: 'rect' },
          { id: 't', label: '商', shape: 'rect' },
          { id: 'k', label: '猎', shape: 'rect' }
        ],
        [
          { from: 'root', to: 't' },
          { from: 'root', to: 'k' }
        ]
      )
    );
    const enumWarn = a.warnings.find((w) => w.msg.includes('建议用标准枚举名'));
    expect(enumWarn?.msg).toContain('大小写不敏感仍可匹配');
    expect(a.warnings.some((w) => w.msg.includes('降级'))).toBe(false); // 旧文案不再出现
    expect(a.errors.some((e) => e.msg.includes('不在 any/melee/projectile'))).toBe(true);
    expect(a.ok).toBe(false); // cause 域外阻断导出
  });
});

describe('循环 48', () => {
  it('kill 伤害方式过滤（cause 下拉 + DamageSource 判定）', () => {
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    meta.nodes = {
      hunter: { params: { amount: 5, cause: 'projectile', entity: '' }, trigger: 'kill' }
    };
    const r = CORE.exportZip(
      CORE.buildCode(
        meta,
        'TD',
        [
          { id: 'root', label: '根', shape: 'rect' },
          { id: 'hunter', label: '猎手', shape: 'rect' }
        ],
        [{ from: 'root', to: 'hunter' }]
      )
    );
    if (!r.ok) {
      throw new Error(r.errors.map((e) => e.msg).join('; '));
    }
    const listener = r.files.find((f) => f.path.endsWith('AchievementListener.java'))?.text ?? '';
    expect(listener).toContain('event.getDamageSource().getDirectEntity()');
    expect(listener).toContain('instanceof org.bukkit.entity.Projectile');
    expect(listener).toContain('"melee".equalsIgnoreCase(cause)');
    const config = r.files.find((f) => f.path.endsWith('config.yml'))?.text ?? '';
    expect(config).toContain('cause: "projectile"');
  });
});

describe('循环 47', () => {
  it('break_block 工具过滤（主手材质比对）+ 文档表参数同步', () => {
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    meta.nodes = {
      miner: {
        params: { amount: 3, material: 'minecraft:diamond_ore', tool: 'IRON_PICKAXE' },
        trigger: 'break_block'
      }
    };
    const r = CORE.exportZip(
      CORE.buildCode(
        meta,
        'TD',
        [
          { id: 'root', label: '根', shape: 'rect' },
          { id: 'miner', label: '矿工', shape: 'rect' }
        ],
        [{ from: 'root', to: 'miner' }]
      )
    );
    if (!r.ok) {
      throw new Error(r.errors.map((e) => e.msg).join('; '));
    }
    const listener = r.files.find((f) => f.path.endsWith('AchievementListener.java'))?.text ?? '';
    expect(listener).toContain(
      'Material held = player.getInventory().getItemInMainHand().getType();'
    );
    expect(listener).toContain('tool.equalsIgnoreCase(held.name())');
    const config = r.files.find((f) => f.path.endsWith('config.yml'))?.text ?? '';
    expect(config).toContain('tool: "IRON_PICKAXE"');
  });
});

describe('循环 46', () => {
  it('trade 职业过滤 + projectile 类型过滤（参数/分支/枚举校验）', () => {
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    meta.nodes = {
      t: { params: { amount: 5, profession: 'FARMER' }, trigger: 'trade' },
      p: { params: { amount: 3, projectile: 'ARROW' }, trigger: 'projectile_hit' }
    };
    const r = CORE.exportZip(
      CORE.buildCode(
        meta,
        'TD',
        [
          { id: 'root', label: '根', shape: 'rect' },
          { id: 't', label: '商', shape: 'rect' },
          { id: 'p', label: '猎', shape: 'rect' }
        ],
        [
          { from: 'root', to: 't' },
          { from: 'root', to: 'p' }
        ]
      )
    );
    if (!r.ok) {
      throw new Error(r.errors.map((e) => e.msg).join('; '));
    }
    const listener = r.files.find((f) => f.path.endsWith('AchievementListener.java'))?.text ?? '';
    expect(listener).toContain('instanceof org.bukkit.entity.Villager villager');
    expect(listener).toContain('prof.equalsIgnoreCase(villager.getProfession().name())');
    expect(listener).toContain('String projType = event.getEntity().getType().name()');
    expect(listener).toContain('want.equalsIgnoreCase(projType)');
    const config = r.files.find((f) => f.path.endsWith('config.yml'))?.text ?? '';
    expect(config).toContain('profession: "FARMER"');
    expect(config).toContain('projectile: "ARROW"');
    // 枚举格式校验：小写值给警告
    const bad = CORE.analyze(
      CORE.buildCode(
        (() => {
          const m = CORE.readMeta(CORE.starterCode()).meta;
          m.nodes = { t: { params: { amount: 1, profession: 'farmer' }, trigger: 'trade' } };
          return m;
        })(),
        'TD',
        [
          { id: 'root', label: '根', shape: 'rect' },
          { id: 't', label: '商', shape: 'rect' }
        ],
        [{ from: 'root', to: 't' }]
      )
    );
    expect(bad.warnings.some((w) => w.msg.includes('建议用标准枚举名'))).toBe(true); // 循环 49 文案修正后
  });
});

describe('循环 43-45 补测（此前 anchor 失配未落盘）', () => {
  it('43：完成度汇总 + 树行 title tooltip', () => {
    const r = CORE.exportZip(CORE.starterCode());
    if (!r.ok) {
      throw new Error('导出失败');
    }
    const cmd = r.files.find((f) => f.path.endsWith('Command.java'))?.text ?? '';
    expect(cmd).toContain('int doneCount = 0;');
    expect(cmd).toContain('"完成度： " + doneCount + " / " + total');
    const html = decodeURIComponent(
      plugin.frontend.url.replace('data:text/html;charset=utf-8,', '')
    );
    expect(html).toContain('title=' + String.raw`"' + esc(n.label`);
  });

  it('44：降级提示（registered < total 时玩家可见）', () => {
    const r = CORE.exportZip(CORE.starterCode());
    if (!r.ok) {
      throw new Error('导出失败');
    }
    const cmd = r.files.find((f) => f.path.endsWith('Command.java'))?.text ?? '';
    expect(cmd).toContain('service.registeredCount()');
    expect(cmd).toContain('未能从数据包加载');
  });

  it('45：config.yml 逐键注释（成就名+参数含义）', () => {
    const r = CORE.exportZip(CORE.starterCode());
    if (!r.ok) {
      throw new Error('导出失败');
    }
    const config = r.files.find((f) => f.path.endsWith('config.yml'))?.text ?? '';
    expect(config).toContain('# 你好，世界！（加入服务器）');
    expect(config).toContain('# 仅首次加入');
    expect(config).toContain('# 累计数量');
  });
});

describe('循环 42', () => {
  it('countUp 溢出语义安全（Java int 绕回为负 → 永不误授）', () => {
    const r = CORE.exportZip(CORE.starterCode());
    if (!r.ok) {
      throw new Error('导出失败');
    }
    const listener = r.files.find((f) => f.path.endsWith('AchievementListener.java'))?.text ?? '';
    const store = r.files.find((f) => f.path.endsWith('ProgressStore.java'))?.text ?? '';
    // merge(key, delta, Integer::sum) 溢出绕回负值：>= target 恒 false——
    // 最坏影响是成就不可达（安全方向），无负值误授路径
    expect(store).toContain('map.merge(key, delta, Integer::sum)');
    expect(listener).toContain('int target = Math.max(1, amount(');
  });

  it('非 ASCII 节点 id 的行不再静默丢弃（汇总警告提示改 id）', () => {
    const a = CORE.analyze('flowchart TD\n r[根]\n r --> 甲[中文id甲]\n');
    expect(a.warnings.some((w) => w.msg.includes('无法解析') && w.msg.includes('[a-z0-9_]'))).toBe(
      true
    );
    // 兼容手写形态断言不回归（skipped 仍计数）
    expect(a.skipped).toBeGreaterThanOrEqual(1);
  });
});

describe('revoke 撤销命令（循环 41）', () => {
  it('生成的 Java 含对称 revoke 分支与 Service.revoke', () => {
    const r = CORE.exportZip(CORE.starterCode());
    if (!r.ok) {
      throw new Error('导出失败');
    }
    const cmd = r.files.find((f) => f.path.endsWith('Command.java'))?.text ?? '';
    const svc = r.files.find((f) => f.path.endsWith('AchievementService.java'))?.text ?? '';
    expect(cmd).toContain('"revoke".equalsIgnoreCase(args[0])');
    expect(cmd).toContain('用法: /myach revoke <在线玩家> <成就id>');
    expect(cmd).toContain('service.revoke(target, achievement)');
    expect(cmd).toContain('List.of("grant", "revoke").stream().filter(matches).toList()');
    expect(cmd).toContain('grant/revoke 子命令除外');
    expect(svc).toContain('progress.revokeCriteria(criterion)');
    const yml = r.files.find((f) => f.path.endsWith('paper-plugin.yml'))?.text ?? '';
    expect(yml).toContain('grant/revoke 手动授予与撤销成就');
  });
});

describe('循环 40', () => {
  it('onEnable 重建 Service/Store（/reload 无陈旧缓存引用）', () => {
    const r = CORE.exportZip(CORE.starterCode());
    if (!r.ok) {
      throw new Error('导出失败');
    }
    const main = r.files.find((f) => f.path.endsWith('Plugin.java'))?.text ?? '';
    // 每次 enable 新实例：Advancement 对象在 /reload 后由服务端重建，
    // 旧缓存引用会失效——new 语句必须位于 onEnable 内
    const enablePos = main.indexOf('public void onEnable()');
    const servicePos = main.indexOf('new AchievementService()');
    const storePos = main.indexOf('ProgressStore.load(this)');
    expect(enablePos).toBeGreaterThan(-1);
    expect(servicePos).toBeGreaterThan(enablePos);
    expect(storePos).toBeGreaterThan(enablePos);
  });
});

describe('循环 38 三项核验', () => {
  it('suggest 与 thresholds 同源（均用 achievement.id()）', () => {
    const r = CORE.exportZip(CORE.starterCode());
    if (!r.ok) {
      throw new Error('导出失败');
    }
    const cmd = r.files.find((f) => f.path.endsWith('Command.java'))?.text ?? '';
    const listener = r.files.find((f) => f.path.endsWith('AchievementListener.java'))?.text ?? '';
    expect(cmd).toContain('.map(Achievement::id)'); // suggest 列表源
    expect(listener).toContain('"thresholds." + achievement.id()'); // config 键源
    // 同一枚举 id() → 两处天然一致（无独立键表可漂移）
  });

  it('外部 rewards.function 指向不影响 loot 还原（以 loot_table 文件为准）', async () => {
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    meta.nodes = {
      treasure: { loot: [{ item: 'minecraft:diamond', max: 1, min: 1 }], trigger: 'break_block' }
    };
    const exported = CORE.exportZip(
      CORE.buildCode(
        meta,
        'TD',
        [
          { id: 'root', label: '根', shape: 'rect' },
          { id: 'treasure', label: '寻宝', shape: 'rect' }
        ],
        [{ from: 'root', to: 'treasure' }]
      )
    );
    if (!exported.ok) {
      throw new Error('导出失败');
    }
    const entries = await CORE.readZipEntries(exported.bytes);
    // 篡改 advancement JSON 的 rewards.function 指向 minecraft: 外部函数
    const files = [...entries.entries()].map(([name, data]) => {
      let text = new TextDecoder().decode(data);
      if (name.endsWith('advancement/treasure.json')) {
        const json = JSON.parse(text);
        json.rewards = { function: 'minecraft:builtin/entity' }; // 外部指向
        text = JSON.stringify(json);
      }
      return { path: name, text };
    });
    const imported = await CORE.importDatapackZip(
      CORE.buildZip(files.filter((f) => !f.path.endsWith('flow-editor.json')))
    );
    expect(imported).toBeDefined();
    const a = CORE.analyze(imported?.code ?? '');
    // loot 仍按 loot_table 文件还原（不受 function 指向篡改影响）
    expect(a.nodes.find((n) => n.id === 'treasure')?.meta.loot).toEqual([
      { item: 'minecraft:diamond', max: 1, min: 1 }
    ]);
  });
});

describe('循环 37', () => {
  it('save 失败时 dirty 保持（仅成功后才清）', () => {
    const r = CORE.exportZip(CORE.starterCode());
    if (!r.ok) {
      throw new Error('导出失败');
    }
    const store = r.files.find((f) => f.path.endsWith('ProgressStore.java'))?.text ?? '';
    // dirty = false 必须位于 yaml.save(file) 之后（try 块内成功路径）
    const savePos = store.indexOf('yaml.save(file);');
    const dirtyPos = store.indexOf('dirty = false;');
    expect(savePos).toBeGreaterThan(-1);
    expect(dirtyPos).toBeGreaterThan(savePos);
    // catch 存在（失败不清 dirty，saveIfDirty 下轮重试）
    expect(store).toContain('} catch (IOException | RuntimeException e) {');
  });
});

describe('多命名空间溯源缺失回落（循环 35）', () => {
  it('溯源 ns 不在包内 → 回落最大命名空间并警告', async () => {
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    meta.namespace = 'ghost_ns'; // 溯源指向不存在的 ns
    const exported = CORE.exportZip(CORE.starterCode());
    if (!exported.ok) {
      throw new Error('导出失败');
    }
    const entries = await CORE.readZipEntries(exported.bytes);
    // 构造双 ns 数据包：把 myach 复制为 big_ns（多条目）+ tiny_ns（1 条）
    const files = [...entries.entries()].map(([name, data]) => ({
      path: name,
      text: new TextDecoder().decode(data)
    }));
    const tiny = files.filter(
      (f) => f.path.endsWith('advancement/root.json') && f.path.includes('myach')
    );
    const pack = files.concat([
      ...files
        .filter((f) => f.path.includes('/myach/'))
        .map((f) => ({ ...f, path: f.path.replace('myach', 'big_ns') })),
      ...tiny.map((f) => ({ ...f, path: f.path.replace('myach', 'tiny_ns') }))
    ]);
    // big_ns 加一条额外进度使其严格最大（否则与 myach 平手回落插入序）
    const extra = pack.find(
      (f) => f.path.endsWith('advancement/root.json') && f.path.includes('myach')
    );
    if (extra) {
      pack.push({
        ...extra,
        path: extra.path.replace('myach', 'big_ns').replace('root.json', 'bonus.json'),
        text: extra.text.replace('"minecraft:tick"', '"minecraft:impossible"')
      });
    }
    const stripped = CORE.buildZip(pack.filter((f) => !f.path.endsWith('flow-editor.json')));
    const imported = await CORE.importDatapackZip(stripped);
    expect(imported).toBeDefined();
    const a = CORE.analyze(imported?.code ?? '');
    expect(a.ok).toBe(true);
    expect(a.meta.namespace).toBe('big_ns'); // 最大者胜出
  });
});

describe('循环 34 三项核验', () => {
  it('statWatches 在 onEnable 无条件重建（/reload 后随新 config 重填）', () => {
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    meta.nodes = { farmer: { params: { minutes: 30 }, trigger: 'playtime' } };
    const r = CORE.exportZip(
      CORE.buildCode(
        meta,
        'TD',
        [
          { id: 'root', label: '根', shape: 'rect' },
          { id: 'farmer', label: '老', shape: 'rect' }
        ],
        [{ from: 'root', to: 'farmer' }]
      )
    );
    if (!r.ok) {
      throw new Error('导出失败');
    }
    const main = r.files.find((f) => f.path.endsWith('Plugin.java'))?.text ?? '';
    expect(main).toContain('statWatches = new java.util.ArrayList<>();'); // onEnable 内重建
  });

  it('lang 键随根改名重建（旧键不残留）', () => {
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    meta.localization = 'on';
    const code = CORE.buildCode(
      meta,
      'TD',
      [
        { id: 'root', label: '旧栏', shape: 'rect' },
        { id: 'a', label: '甲', shape: 'rect' }
      ],
      [{ from: 'root', to: 'a' }]
    );
    // 模拟改名：root → new_root（元数据键迁移 + 节点更名后重建代码）
    const parsed = CORE.analyze(code);
    if (!parsed.ok) {
      throw new Error('预分析失败');
    }
    parsed.meta.nodes = { ...(parsed.meta.nodes as Record<string, unknown>) };
    const renamed = CORE.buildCode(
      parsed.meta,
      'TD',
      [
        { id: 'new_root', label: '新栏', shape: 'rect' },
        { id: 'a', label: '甲', shape: 'rect' }
      ],
      [{ from: 'new_root', to: 'a' }]
    );
    const r = CORE.exportZip(renamed);
    if (!r.ok) {
      throw new Error('重导出失败');
    }
    const zh = r.files.find((f) => f.path.endsWith('zh_cn.json'))?.text ?? '';
    expect(zh).not.toContain('"myach.advancement.root.title"'); // 旧键不残留
    expect(zh).toContain('"myach.advancement.new_root.title"');
  });
});

describe('AsyncChat 闭包提取与覆盖确认（循环 32）', () => {
  it('message/player 在 runTask 之前提取（不捕获可变 event）', () => {
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    meta.nodes = { c: { params: { keyword: 'hi' }, trigger: 'chat_keyword' } };
    const r = CORE.exportZip(
      CORE.buildCode(
        meta,
        'TD',
        [
          { id: 'root', label: '根', shape: 'rect' },
          { id: 'c', label: '聊', shape: 'rect' }
        ],
        [{ from: 'root', to: 'c' }]
      )
    );
    if (!r.ok) {
      throw new Error('导出失败');
    }
    const listener = r.files.find((f) => f.path.endsWith('AchievementListener.java'))?.text ?? '';
    const extractPos = listener.indexOf('String message = PlainTextComponentSerializer');
    const runPos = listener.indexOf('runTask(plugin, () -> {');
    expect(extractPos).toBeGreaterThan(-1);
    expect(runPos).toBeGreaterThan(extractPos); // 提取在调度前
  });

  it('前端内嵌脚本：覆盖确认文案列出丢失项', () => {
    const html = decodeURIComponent(
      plugin.frontend.url.replace('data:text/html;charset=utf-8,', '')
    );
    expect(html).toContain('触发器、战利品、本地化、样式等所有设置都会丢失');
  });
});

describe('可取消事件 ignoreCancelled（循环 31）', () => {
  it('trade/tame/breed/chat 四个 Cancellable 事件带 ignoreCancelled', () => {
    const mk = (trigger: string) => {
      const meta = CORE.readMeta(CORE.starterCode()).meta;
      meta.nodes = { x: { params: trigger === 'chat_keyword' ? { keyword: 'hi' } : {}, trigger } };
      return CORE.exportZip(
        CORE.buildCode(
          meta,
          'TD',
          [
            { id: 'root', label: '根', shape: 'rect' },
            { id: 'x', label: '甲', shape: 'rect' }
          ],
          [{ from: 'root', to: 'x' }]
        )
      );
    };
    const expectIc = (trigger: string, method: string) => {
      const r = mk(trigger);
      if (!r.ok) {
        throw new Error(`${trigger} 导出失败`);
      }
      const listener = r.files.find((f) => f.path.endsWith('AchievementListener.java'))?.text ?? '';
      expect(listener, trigger).toContain(`@EventHandler(ignoreCancelled = true)
    public void ${method}`);
    };
    expectIc('trade', 'onTrade');
    expectIc('tame', 'onTame');
    expectIc('breed', 'onBreed');
    expectIc('chat_keyword', 'onChat');
  });
});

describe('本地化关闭时英文忽略提示（循环 30）', () => {
  it('off + 含 en 字段 → 一条汇总警告；on 时无此警告', () => {
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    meta.localization = 'off';
    meta.nodes = { a: { en: 'Alpha', trigger: 'manual' } };
    const code = CORE.buildCode(
      meta,
      'TD',
      [
        { id: 'root', label: '根', shape: 'rect' },
        { id: 'a', label: '甲', shape: 'rect' }
      ],
      [{ from: 'root', to: 'a' }]
    );
    const off = CORE.analyze(code);
    expect(off.warnings.some((w) => w.msg.includes('本地化未开启'))).toBe(true);

    meta.localization = 'on';
    const on = CORE.analyze(
      CORE.buildCode(
        meta,
        'TD',
        [
          { id: 'root', label: '根', shape: 'rect' },
          { id: 'a', label: '甲', shape: 'rect' }
        ],
        [{ from: 'root', to: 'a' }]
      )
    );
    expect(on.warnings.some((w) => w.msg.includes('本地化未开启'))).toBe(false);
  });
});

describe('delete/reparent 同步与保留名（循环 28）', () => {
  it('Windows 保留名 id 报错（con/nul/com1）', () => {
    const a = CORE.analyze('flowchart TD\n r[根]\n r --> con\n r --> nul[甲]\n con[乙]\n');
    expect(a.ok).toBe(false);
    const reserved = a.errors.filter((e) => e.msg.includes('Windows 保留名'));
    expect(reserved.length).toBeGreaterThanOrEqual(2);
  });

  it('ProgressStore.load 对损坏 YAML 容错（catch IllegalArgumentException 覆盖 InvalidConfigurationException）', () => {
    const r = CORE.exportZip(CORE.starterCode());
    if (!r.ok) {
      throw new Error('导出失败');
    }
    const store = r.files.find((f) => f.path.endsWith('ProgressStore.java'))?.text ?? '';
    expect(store).toContain('catch (IllegalArgumentException e)');
  });
});

describe('addNode 入组与任务取消（循环 27）', () => {
  it('生成的 Java 持有任务句柄并在 onDisable 取消', () => {
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    meta.nodes = { farmer: { params: { minutes: 60 }, trigger: 'playtime' } };
    const code = CORE.buildCode(
      meta,
      'TD',
      [
        { id: 'root', label: '根', shape: 'rect' },
        { id: 'farmer', label: '老玩家', shape: 'rect' }
      ],
      [{ from: 'root', to: 'farmer' }]
    );
    const r = CORE.exportZip(code);
    if (!r.ok) {
      throw new Error('导出失败');
    }
    const main = r.files.find((f) => f.path.endsWith('Plugin.java'))?.text ?? '';
    expect(main).toContain('private org.bukkit.scheduler.BukkitTask statTask;');
    expect(main).toContain('statTask = getServer().getScheduler().runTaskTimer');
    expect(main).toContain('saveTask = getServer().getScheduler().runTaskTimer');
    expect(main.match(/\.cancel\(\);/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('组合逆向导入（循环 26）', () => {
  it('loot + lang + subgraph 三特性同包：全部还原', async () => {
    // 构造含全部三特性的图：subgraph 栏 + 战利品 + 本地化
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    meta.localization = 'on';
    meta.nodes = {
      treasure: {
        desc: '寻宝',
        en: 'Treasure Hunter',
        loot: [{ item: 'minecraft:emerald', max: 2, min: 1 }],
        trigger: 'break_block'
      }
    };
    const code = CORE.buildCode(
      meta,
      'TD',
      [
        { id: 'adv_main', label: '冒险栏', shape: 'rect' },
        { id: 'treasure', label: '寻宝人', shape: 'round' }
      ],
      [{ from: 'adv_main', to: 'treasure' }],
      [{ id: 'adv_main', label: '冒险栏', memberIds: ['adv_main', 'treasure'] }]
    );
    const exported = CORE.exportZip(code);
    if (!exported.ok) {
      throw new Error(exported.errors.map((e) => e.msg).join('; '));
    }
    // 剥溯源 → 外部包尽力还原路径
    const entries = await CORE.readZipEntries(exported.bytes);
    const stripped = CORE.buildZip(
      [...entries.entries()]
        .filter(([name]) => !name.endsWith('flow-editor.json'))
        .map(([name, data]) => ({ path: name, text: new TextDecoder().decode(data) }))
    );
    const imported = await CORE.importDatapackZip(stripped);
    expect(imported).toBeDefined();
    const a = CORE.analyze(imported?.code ?? '');
    expect(a.ok).toBe(true);
    // subgraph 栏
    expect(a.tabs[0].name).toBe('冒险栏');
    expect(imported?.code).toContain('subgraph adv_main["冒险栏"]');
    // lang：标题还原
    expect(a.nodes.find((n) => n.id === 'treasure')?.label).toBe('寻宝人');
    // loot：条目还原
    expect(a.nodes.find((n) => n.id === 'treasure')?.meta.loot).toEqual([
      { item: 'minecraft:emerald', max: 2, min: 1 }
    ]);
  });
});

describe('模糊输入健壮性（循环 19）', () => {
  it('极端样本零异常且警告/错误有界', () => {
    const samples: [string, string][] = [
      ['超长标签 1MB', `flowchart TD\n r["${'A'.repeat(1024 * 1024)}"]\n r --> a[x]\n`],
      ['超长行（10 万链段）', `flowchart TD\n ${'a[x] --> '.repeat(100_000)}z\n`],
      [
        'subgraph 未闭合 ×1000',
        `flowchart TD\n${'    subgraph g["栏"]\n'.repeat(1000)}        a[x]\n`
      ],
      ['end 不配对 ×5000', `flowchart TD\n${'end\n'.repeat(5000)} a[x]\n`],
      ['畸形 style 行', 'flowchart TD\n r[x]\n style\n style r\n style r fill:\n'],
      ['frontmatter 半截 JSON', '---\n{"mcadv": {"plugin":\n---\nflowchart TD\n a[x]\n'],
      [
        'frontmatter 深嵌套',
        `---\n{"a":${'['.repeat(50_000)}${']'.repeat(50_000)}}\n---\nflowchart TD\n a[x]\n`
      ]
    ];
    for (const [name, code] of samples) {
      let a: Analysis | undefined;
      expect(() => {
        a = CORE.analyze(code);
      }, name).not.toThrow();
      expect(a?.warnings.length, `${name} 警告有界`).toBeLessThanOrEqual(100);
      expect(a?.errors.length, `${name} 错误有界`).toBeLessThanOrEqual(100);
    }
  });

  it('病态孤儿元数据（5 万键）警告合并 + 截断 + 耗时有界', () => {
    const orphans = Array.from(
      { length: 50_000 },
      (_, i) => `"ghost${i}":{"trigger":"manual"}`
    ).join(',');
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    meta.nodes = JSON.parse(`{${orphans}}`);
    const code = CORE.buildCode(
      meta,
      'TD',
      [
        { id: 'root', label: '根', shape: 'rect' },
        { id: 'a', label: '甲', shape: 'rect' }
      ],
      [{ from: 'root', to: 'a' }]
    );
    const t0 = performance.now();
    const a = CORE.analyze(code);
    const ms = performance.now() - t0;
    expect(a.ok).toBe(true);
    const orphanWarn = a.warnings.find((w) => w.msg.includes('已删除节点'));
    expect(orphanWarn?.msg).toContain('50000 个'); // 汇总为单条计数
    expect(a.warnings.length).toBeLessThanOrEqual(100);
    expect(ms).toBeLessThan(2000);
  });

  it('重复连线文字警告合并计数（1000 条同类 → 1 条 ×N）', () => {
    const lines = Array.from({ length: 1000 }, (_, i) => `    root -->|t${i}| n${i}[甲${i}]`).join(
      '\n'
    );
    const code = `flowchart TD\n    root[根]\n${lines}\n`;
    const a = CORE.analyze(code);
    expect(a.ok).toBe(true);
    const labeled = a.warnings.filter((w) => w.msg.includes('无对应语义'));
    expect(labeled).toHaveLength(1);
    expect(labeled[0].msg).toContain('1000 条'); // 汇总计数
  });

  it('毒 zip（EOCD 假 count）安全拒绝', async () => {
    const bad = new Uint8Array(100);
    bad.set([0x50, 0x4b, 0x05, 0x06], 78); // EOCD 签名
    bad[90] = 0xff;
    bad[91] = 0xff; // count=65535 但无内容
    await expect(CORE.importDatapackZip(bad)).resolves.toBeUndefined();
  });
});

describe('本地化 lang（循环 17）', () => {
  const locCode = () => {
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    meta.localization = 'on';
    meta.nodes = {
      block_breaker: {
        desc: '累计挖掘 200 个方块',
        en: 'Mountain Mover',
        trigger: 'break_block'
      }
    };
    meta.tabs = { root: { completionist: true, enTitle: 'Demo Tab' } };
    return CORE.buildCode(
      meta,
      'TD',
      [
        { id: 'root', label: '示例成就', shape: 'rect' },
        { id: 'first_join', label: '你好，世界！', shape: 'rect' },
        { id: 'block_breaker', label: '愚公移山', shape: 'round' }
      ],
      [
        { from: 'root', to: 'first_join' },
        { from: 'first_join', to: 'block_breaker' }
      ]
    );
  };

  it('on：advancement 走 translate；生成 zh_cn/en_us（英文缺省回填中文）', () => {
    const r = CORE.exportZip(locCode());
    if (!r.ok) {
      throw new Error(r.errors.map((e) => e.msg).join('; '));
    }
    const byPath = new Map(r.files.map((f) => [f.path, f.text]));
    const adv = JSON.parse(
      byPath.get('src/main/resources/datapack/data/myach/advancement/block_breaker.json') ?? ''
    );
    expect(adv.display.title).toEqual({ translate: 'myach.advancement.block_breaker.title' });
    expect(adv.display.description).toEqual({
      translate: 'myach.advancement.block_breaker.description'
    });

    const zh = JSON.parse(
      byPath.get('src/main/resources/datapack/data/myach/lang/zh_cn.json') ?? '{}'
    );
    const en = JSON.parse(
      byPath.get('src/main/resources/datapack/data/myach/lang/en_us.json') ?? '{}'
    );
    expect(zh['myach.advancement.block_breaker.title']).toBe('愚公移山');
    expect(en['myach.advancement.block_breaker.title']).toBe('Mountain Mover'); // 显式英文
    expect(en['myach.advancement.first_join.title']).toBe('你好，世界！'); // 缺省回填中文
    expect(en['myach.advancement.root.title']).toBe('Demo Tab'); // 栏英文
    expect(zh['myach.advancement.root_completionist.title']).toBe('大满贯！');
    expect(en['myach.advancement.root_completionist.title']).toBe('大满贯！'); // 回填
    // 生成 README 附英文名称列（on 时）
    const readme = byPath.get('README.md') ?? '';
    expect(readme).toContain('| 成就栏 | 成就 | 英文名称 | 达成条件 | 框架 |');
    expect(readme).toContain('Mountain Mover');
    // 键覆盖全部成就（含栏根、大满贯）
    expect(Object.keys(zh).length).toBeGreaterThanOrEqual(8);
  });

  it('off（默认）：保持硬编码 text，不生成 lang 文件', () => {
    const r = CORE.exportZip(CORE.starterCode());
    if (!r.ok) {
      throw new Error('starter 导出失败');
    }
    expect(r.files.some((f) => f.path.includes('/lang/'))).toBe(false);
    const adv = JSON.parse(
      r.files.find((f) => f.path.endsWith('advancement/first_join.json'))?.text ?? ''
    );
    expect(adv.display.title).toEqual({ text: '你好，世界！' });
  });

  it('外部数据包：translate 标题经 lang/zh_cn.json 还原为可读名称', async () => {
    const r = CORE.exportZip(locCode());
    if (!r.ok) {
      throw new Error('导出失败');
    }
    const entries = await CORE.readZipEntries(r.bytes);
    const stripped = CORE.buildZip(
      [...entries.entries()]
        .filter(([name]) => !name.endsWith('flow-editor.json'))
        .map(([name, data]) => ({ path: name, text: new TextDecoder().decode(data) }))
    );
    const imported = await CORE.importDatapackZip(stripped);
    expect(imported).toBeDefined();
    const a = CORE.analyze(imported?.code ?? '');
    expect(a.ok).toBe(true);
    expect(a.tabs[0].name).toBe('示例成就'); // root translate → zh_cn 还原
    expect(a.nodes.find((n) => n.id === 'block_breaker')?.label).toBe('愚公移山');
  });
});

describe('视觉样式 style 指令（循环 14）', () => {
  it('buildCode 输出 style 行；parseFlow 读回；往返保持（溯源优先）', () => {
    const nodes = [
      { id: 'root', label: '根', shape: 'rect' },
      { id: 'hero', label: '英雄', shape: 'round', style: { fill: '#ffcc00', stroke: '#333333' } }
    ];
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    meta.nodes = {};
    const code = CORE.buildCode(meta, 'TD', nodes, [{ from: 'root', to: 'hero' }]);
    expect(code).toContain('style hero fill:#ffcc00,stroke:#333333');

    const flow = CORE.parseFlow(code);
    expect(flow.styleOf.get('hero')).toEqual({ fill: '#ffcc00', stroke: '#333333' });

    // 溯源元数据里无 style → analyze 回落到代码 style 行
    const a = CORE.analyze(code);
    expect(a.ok).toBe(true);
    expect(a.nodes.find((n) => n.id === 'hero')?.meta.style).toEqual({
      fill: '#ffcc00',
      stroke: '#333333'
    });
    // 无样式的根节点没有 style 行
    const rootNode = (a.meta.nodes as Record<string, { style?: unknown }>).root;
    expect(rootNode?.style).toBeUndefined();
  });

  it('只含 fill 或只含 stroke 的样式；非法颜色值产生警告', () => {
    const nodes = [
      { id: 'root', label: '根', shape: 'rect' },
      { id: 'a', label: '甲', shape: 'rect', style: { fill: '#abc' } },
      { id: 'b', label: '乙', shape: 'rect', style: { fill: 'not a color!' } }
    ];
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    meta.nodes = {};
    const code = CORE.buildCode(meta, 'TD', nodes, [
      { from: 'root', to: 'a' },
      { from: 'root', to: 'b' }
    ]);
    expect(code).toContain('style a fill:#abc');
    const a = CORE.analyze(code);
    expect(a.ok).toBe(true);
    expect(a.warnings.some((w) => w.msg.includes('不是颜色值'))).toBe(true);
    // 命名色（gold）合法
    expect(a.warnings.some((w) => w.msg.includes('fill') && w.msg.includes('#abc'))).toBe(false);
  });

  it('与 subgraph 组合往返（成员样式保持）', () => {
    const grouped =
      'flowchart TD\n    subgraph g["栏"]\n        g["栏"]\n        a["甲"]\n    end\n    style a fill:#112233\n';
    const a = CORE.analyze(grouped);
    expect(a.ok).toBe(true);
    expect(a.nodes.find((n) => n.id === 'a')?.meta.style).toEqual({ fill: '#112233' });
    const rebuilt = CORE.buildCode(
      a.meta,
      'TD',
      a.nodes.map((n) => ({ id: n.id, label: n.label, shape: n.shape, style: n.meta.style })),
      a.edges,
      a.tabs.map((t) => ({ id: t.rootId, label: t.name, memberIds: t.members }))
    );
    expect(rebuilt).toContain('subgraph g["栏"]');
    expect(rebuilt).toContain('style a fill:#112233');
    const second = CORE.analyze(rebuilt);
    expect(second.nodes.find((n) => n.id === 'a')?.meta.style).toEqual({ fill: '#112233' });
  });
});

describe('战利品奖励（循环 13）', () => {
  const lootCode = () => {
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    meta.nodes = {
      treasure: {
        desc: '开宝箱',
        loot: [
          { item: 'minecraft:diamond', max: 3, min: 1 },
          { item: 'minecraft:gold_ingot', max: 5, min: 2, weight: 2 },
          { item: '', max: 1, min: 1 } // 空条目：导出时忽略 + 警告
        ],
        trigger: 'break_block',
        xp: 10
      }
    };
    return CORE.buildCode(
      meta,
      'TD',
      [
        { id: 'root', label: '根', shape: 'rect' },
        { id: 'treasure', label: '寻宝人', shape: 'rect' }
      ],
      [{ from: 'root', to: 'treasure' }]
    );
  };

  it('advJson 带 rewards.function（与经验并存）；生成 loot_table 与 mcfunction', () => {
    const r = CORE.exportZip(lootCode());
    if (!r.ok) {
      throw new Error(r.errors.map((e) => e.msg).join('; '));
    }
    const byPath = new Map(r.files.map((f) => [f.path, f.text]));
    const adv = JSON.parse(
      byPath.get('src/main/resources/datapack/data/myach/advancement/treasure.json') ?? ''
    );
    expect(adv.rewards).toEqual({ experience: 10, function: 'myach:treasure' });

    const table = JSON.parse(
      byPath.get('src/main/resources/datapack/data/myach/loot_table/treasure.json') ?? ''
    );
    expect(table.type).toBe('minecraft:chest');
    const entries = table.pools[0].entries;
    expect(entries).toHaveLength(2); // 空条目被忽略
    expect(entries[0]).toEqual({
      functions: [{ count: { max: 3, min: 1 }, function: 'minecraft:set_count' }],
      name: 'minecraft:diamond',
      type: 'minecraft:item'
    });
    expect(entries[1].weight).toBe(2);
    expect(table.pools[0].rolls).toBe(1);

    const fn =
      byPath.get('src/main/resources/datapack/data/myach/function/treasure.mcfunction') ?? '';
    expect(fn).toContain('loot give @p loot myach:treasure');

    // 空战利品条目产生警告；无 loot 的成就不受影响
    expect(r.analysis.warnings.some((w) => w.msg.includes('未填物品的战利品条目'))).toBe(true);
    expect(r.files.some((f) => f.path.endsWith('loot_table/root.json'))).toBe(false);
  });

  it('外部数据包逆向导入还原 loot 条目（含数量区间与权重）', async () => {
    const r = CORE.exportZip(lootCode());
    if (!r.ok) {
      throw new Error('导出失败');
    }
    // 剥掉溯源元数据 → 走外部数据包尽力还原路径
    const entries = await CORE.readZipEntries(r.bytes);
    const stripped = CORE.buildZip(
      [...entries.entries()]
        .filter(([name]) => !name.endsWith('flow-editor.json'))
        .map(([name, data]) => ({ path: name, text: new TextDecoder().decode(data) }))
    );
    const imported = await CORE.importDatapackZip(stripped);
    expect(imported).toBeDefined();
    const a = CORE.analyze(imported?.code ?? '');
    expect(a.ok).toBe(true);
    const treasure = a.nodes.find((n) => n.id === 'treasure');
    expect(treasure?.meta.loot).toEqual([
      { item: 'minecraft:diamond', max: 3, min: 1 },
      { item: 'minecraft:gold_ingot', max: 5, min: 2, weight: 2 }
    ]);
  });

  it('非物品 ID 格式的战利品条目产生警告', () => {
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    meta.nodes = { bad: { loot: [{ item: 'Not A Valid Item!' }], trigger: 'manual' } };
    const code = CORE.buildCode(
      meta,
      'TD',
      [
        { id: 'root', label: '根', shape: 'rect' },
        { id: 'bad', label: '坏条目', shape: 'rect' }
      ],
      [{ from: 'root', to: 'bad' }]
    );
    const a = CORE.analyze(code);
    expect(a.warnings.some((w) => w.msg.includes('不是合法物品 ID 格式'))).toBe(true);
  });
});

describe('buildJarRequest：桌面版离线编译请求', () => {
  it('只含 java 源与资源；paper-plugin.yml 版本占位符已置换', () => {
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    meta.version = '2.3.4';
    const nodes = [
      { id: 'root', label: '根', shape: 'rect' },
      { id: 'a', label: '甲', shape: 'rect' }
    ];
    const edges = [{ from: 'root', to: 'a' }];
    const r = CORE.buildJarRequest(CORE.buildCode(meta, 'TD', nodes, edges));
    if (!r.ok) {
      throw new Error('buildJarRequest 失败');
    }
    expect(r.filename).toBe('MyAchievements-2.3.4.jar');
    expect(r.files.some((f) => f.path === 'pom.xml')).toBe(false);
    expect(r.files.some((f) => f.path === 'README.md')).toBe(false);
    expect(r.files.every((f) => /^src\/main\/(java|resources)\//.test(f.path))).toBe(true);
    const yml = r.files.find((f) => f.path === 'src/main/resources/paper-plugin.yml')?.text ?? '';
    expect(yml).toContain("version: '2.3.4'");
    expect(yml).not.toContain('${project.version}');
    // pom.xml 虽未随编译请求下发，导出 zip 的 pom 也用同一版本号
    const full = CORE.exportZip(CORE.buildCode(meta, 'TD', nodes, edges));
    if (!full.ok) {
      throw new Error('exportZip 失败');
    }
    expect(full.files.find((f) => f.path === 'pom.xml')?.text).toContain(
      '<version>2.3.4</version>'
    );
  });

  it('校验失败时返回错误而非请求', () => {
    expect(CORE.buildJarRequest('pie title x\n  "a": 1\n').ok).toBe(false);
  });
});

describe('插件导出钩子', () => {
  const ctx = () => {
    const messages: string[] = [];
    return { messages, notify: (m: string) => messages.push(m) };
  };

  it('合法图返回 zip blob', async () => {
    const c = ctx();
    const out = await plugin.exports?.[0]?.run({ code: CORE.starterCode() }, c);
    expect(out?.filename).toBe('MyAchievements.zip');
    expect(out?.blob).toBeInstanceOf(Blob);
    expect(c.messages[0]).toContain('MyAchievements.zip');
  });

  it('非法图返回 undefined 并提示首个错误', async () => {
    const c = ctx();
    const out = await plugin.exports?.[0]?.run({ code: 'pie title x\n  "a": 1\n' }, c);
    expect(out).toBeUndefined();
    expect(c.messages[0]).toContain('无法导出 MC 插件');
  });

  it('前端声明 allow-downloads（导出按钮在沙箱 iframe 内可下载）', () => {
    expect(plugin.frontend.sandbox).toContain('allow-downloads');
    expect(plugin.frontend.url.startsWith('data:text/html')).toBe(true);
  });

  it('前端页面内嵌脚本可编译（new Function 语法探针）且注入核心可用', () => {
    const html = decodeURIComponent(
      plugin.frontend.url.replace('data:text/html;charset=utf-8,', '')
    );
    const match = /<script>([\s\S]*?)<\/script>/.exec(html);
    expect(match).toBeTruthy();
    const src = match?.[1] ?? '';
    // 编译（不执行）：拦住模板字符串层面的语法错误
    expect(() => new Function(src)).not.toThrow();
    expect(src).toContain('mc_build');
    expect(src).toContain('结构异常');
    // 注入的 coreFactory 是独立可求值的工厂函数（以随后的 var CH 为右锚点，
    // 工厂体内部的 IIFE 不会截断）
    const factoryMatch = /var CORE = \((function[\s\S]*)\)\(\);\s*\n\s*var CH =/.exec(src);
    expect(factoryMatch).toBeTruthy();
    const injected = new Function(`return (${factoryMatch?.[1]})()`)() as {
      analyze: Core['analyze'];
    };
    expect(typeof injected.analyze).toBe('function');
  });
});

describe('循环 50：设计文档触发器表 ↔ TRIGGERS 注册表一致性（防漂移持久防线）', () => {
  // 循环 46-48 三度漂移（trade 缺 profession / projectile_hit 缺 projectile /
  // break_block 缺 tool / kill 缺 cause，且循环 47/48 提交信息均声称「已同步」）：
  // 循环 39 的一次性对照命令不可持续，此处固化为单测，改注册表必须同步文档表。
  const doc = readFileSync(resolve(process.cwd(), 'note/mc-advancement-plugin.md'), 'utf8');
  const rows = [...doc.matchAll(/^\|\s*\d+\s*\|\s*`([a-z_]+)`\s*\|[^|]+\|([^|]+)\|/gm)];

  it('文档表行数与注册表一致（30），无缺行/多行', () => {
    expect(rows.length).toBe(CORE.TRIGGERS.length);
    const docIds = rows.map((m) => m[1]);
    const regIds = CORE.TRIGGERS.map((t) => t.id);
    expect(docIds.sort()).toEqual(regIds.sort());
  });

  it('每个触发器的全部参数键都在文档表参数列中（backtick 形式）', () => {
    const cellOf = new Map(rows.map((m) => [m[1], m[2]] as const));
    for (const t of CORE.TRIGGERS) {
      const cell = cellOf.get(t.id);
      expect(cell, `文档表缺少触发器 ${t.id} 的行`).toBeDefined();
      for (const p of t.params) {
        expect(
          cell?.includes(`\`${p.key}\``),
          `${t.id} 的参数 ${p.key} 未出现在文档表参数列（实现改了文档没改——先改 note/mc-advancement-plugin.md）`
        ).toBe(true);
      }
    }
  });
});

describe('循环 51：全局设置校验完善（命令/包名/packFormat）', () => {
  const analyzeWith = (metaPatch: Record<string, unknown>) => {
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    Object.assign(meta, metaPatch);
    return CORE.analyze(
      CORE.buildCode(
        meta,
        'TD',
        [
          { id: 'root', label: '根', shape: 'rect' },
          { id: 'a', label: '甲', shape: 'rect' }
        ],
        [{ from: 'root', to: 'a' }]
      )
    );
  };

  it('命令与原版命令同名 → 遮蔽警告；命令/包名规范化不再静默', () => {
    const r = CORE.analyze(
      CORE.buildCode(
        (() => {
          const m = CORE.readMeta(CORE.starterCode()).meta;
          m.command = '1kill';
          m.packageName = 'My.Pkg';
          return m;
        })(),
        'TD',
        [
          { id: 'root', label: '根', shape: 'rect' },
          { id: 'a', label: '甲', shape: 'rect' }
        ],
        [{ from: 'root', to: 'a' }]
      )
    );
    // 「1kill」数字开头 → 回退 namespace；回退后不再撞原版名
    expect(r.warnings.some((w) => w.msg.includes('已规范为「/') && w.msg.includes('1kill'))).toBe(
      true
    );
    expect(r.warnings.some((w) => w.msg.includes('包名「My.Pkg」已规范为'))).toBe(true);
    // 直接命中原版命令
    const r2 = analyzeWith({ command: 'kill' });
    expect(
      r2.warnings.some((w) => w.msg.includes('/kill 与原版命令同名') && w.msg.includes('遮蔽'))
    ).toBe(true);
    // 常规命令无此警告
    const r3 = analyzeWith({ command: 'myach' });
    expect(r3.warnings.some((w) => w.msg.includes('原版命令同名'))).toBe(false);
  });

  it('packFormat 非整数截断告警；0/负值告警数据包无法加载', () => {
    const r = analyzeWith({ packFormat: 94.5 });
    expect(r.meta.packFormat).toBe(94);
    expect(r.warnings.some((w) => w.msg.includes('94.5」不是整数'))).toBe(true);
    const r2 = analyzeWith({ packFormat: 0 });
    expect(r2.warnings.some((w) => w.msg.includes('数据包格式版本 0 无效'))).toBe(true);
    expect(r2.meta.packFormat).toBe(0); // 不静默改值，仅提示
  });
});

describe('循环 52：图标 datalist 修复（占位符从未被替换）', () => {
  it('四个图标/物品输入的 datalist 有实际选项，占位符注释不再存在', () => {
    const html = decodeURIComponent(
      plugin.frontend.url.replace('data:text/html;charset=utf-8,', '')
    );
    expect(html).not.toContain('<!--ICONS-->'); // 旧缺陷：占位符从未被替换，datalist 为空
    const options = [...html.matchAll(/<option value="minecraft:([a-z_]+)">/g)];
    expect(options.length).toBeGreaterThanOrEqual(60);
    // 框架默认图标与栏/大满贯默认图标都在候选中（book/compass/dragon_egg/nether_star）
    const vals = new Set(options.map((m) => m[1]));
    for (const want of ['book', 'compass', 'dragon_egg', 'nether_star']) {
      expect(vals.has(want), `datalist 缺少默认图标 ${want}`).toBe(true);
    }
    // datalist 挂载点：成就图标 / 战利品物品 / 栏图标 / 大满贯图标
    expect((html.match(/list="icons"/g) ?? []).length).toBe(4);
    // 循环 65 整合：单一静态源——运行时 ICON_SUGGESTIONS 覆盖已删除
    //（旧覆盖曾把静态 68 项换成 25 项小表；且旧数组 8 个独有项已并入）
    expect(html).not.toContain('ICON_SUGGESTIONS.map');
    for (const old of ['beacon', 'cake', 'tnt', 'clock']) {
      expect(vals.has(old), `旧候选 ${old} 并入后不得丢失`).toBe(true);
    }
  });
});

describe('循环 52（续）：背景纹理 datalist 与提示', () => {
  it('背景输入有 datalist 候选与格式 placeholder', () => {
    const html = decodeURIComponent(
      plugin.frontend.url.replace('data:text/html;charset=utf-8,', '')
    );
    const bgs = [...html.matchAll(/<option value="(minecraft:textures\/block\/[a-z_]+\.png)">/g)];
    expect(bgs.length).toBeGreaterThanOrEqual(15);
    expect(html).toContain(
      'list="backgrounds" placeholder="minecraft:textures/block/deepslate_tiles.png（留空默认）"'
    );
  });
});

describe('循环 53：int 参数非整数显式报错（此前 2.5 放行，Java getInt 静默截断）', () => {
  it('amount=2.5 与 y=64.5 均报「整数」错误；合法整数值不受影响', () => {
    const build = (params: Record<string, unknown>, trigger: string) =>
      CORE.analyze(
        CORE.buildCode(
          (() => {
            const m = CORE.readMeta(CORE.starterCode()).meta;
            m.nodes = { a: { params, trigger } };
            return m;
          })(),
          'TD',
          [
            { id: 'root', label: '根', shape: 'rect' },
            { id: 'a', label: '甲', shape: 'rect' }
          ],
          [{ from: 'root', to: 'a' }]
        )
      );
    const r1 = build({ amount: 2.5 }, 'break_block');
    expect(r1.errors.some((e) => e.msg.includes('需要') && e.msg.includes('≥1 的整数'))).toBe(true);
    const r2 = build({ y: 64.5 }, 'reach_height');
    expect(r2.errors.some((e) => e.msg.includes('需要是整数'))).toBe(true);
    const r3 = build({ amount: 10, y: -32 }, 'reach_height');
    expect(r3.errors.length).toBe(0);
  });
});

describe('循环 54：校验面板定位跳转（全局/栏级问题）', () => {
  it('设置级问题带 scope:settings；栏级问题带 tabId', () => {
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    meta.command = 'kill'; // 原版命令冲突 → 设置级
    (meta.tabs as Record<string, { background?: string }>).root.background = 'not-a-texture-path'; // 栏级
    const r = CORE.analyze(
      CORE.buildCode(
        meta,
        'TD',
        [
          { id: 'root', label: '根', shape: 'rect' },
          { id: 'a', label: '甲', shape: 'rect' }
        ],
        [{ from: 'root', to: 'a' }]
      )
    );
    const cmdWarn = r.warnings.find((w) => w.msg.includes('与原版命令同名'));
    expect(cmdWarn?.scope).toBe('settings');
    const bgWarn = r.warnings.find((w) => w.msg.includes('背景纹理'));
    expect((bgWarn as { tabId?: string } | undefined)?.tabId).toBe('root');
  });

  it('前端脚本：可定位 issue 才可点（.issue.link），settings/tab 跳转分支在册', () => {
    const html = decodeURIComponent(
      plugin.frontend.url.replace('data:text/html;charset=utf-8,', '')
    );
    expect(html).toContain('.issue.link { cursor: pointer; }');
    expect(html).not.toContain('.issue { padding: 2px 0; cursor: pointer; }'); // 假可点光标已移除
    expect(html).toContain('data-s'); // 设置跳转分支
    expect(html).toContain("S.sel = { id: tabId, type: 'tab' }"); // 栏跳转
    expect(html).toContain("querySelectorAll('.issue.link')");
  });
});

describe('循环 55：自动保存间隔边界（负值曾致插件 onEnable 崩溃）', () => {
  it('autosaveSeconds=0/负值 → 钳制 300 + 警告；非整数截断；config.yml 不再输出非法值', () => {
    const build = (v: unknown) => {
      const meta = CORE.readMeta(CORE.starterCode()).meta;
      meta.autosaveSeconds = v;
      return CORE.exportZip(
        CORE.buildCode(
          meta,
          'TD',
          [
            { id: 'root', label: '根', shape: 'rect' },
            { id: 'a', label: '甲', shape: 'rect' }
          ],
          [{ from: 'root', to: 'a' }]
        )
      );
    };
    for (const bad of [0, -5]) {
      const r = build(bad);
      if (!r.ok) {
        throw new Error('不应阻断导出');
      }
      const cfg = r.files.find((f) => f.path.endsWith('config.yml'))?.text ?? '';
      expect(cfg).toContain('autosave-interval-seconds: 300'); // runTaskTimer 零/负周期会抛异常
      expect(
        r.analysis.warnings.some((w) => w.msg.includes('自动保存间隔') && w.msg.includes('无效'))
      ).toBe(true);
    }
    const r2 = build(120.5);
    if (!r2.ok) {
      throw new Error('导出失败');
    }
    const cfg2 = r2.files.find((f) => f.path.endsWith('config.yml'))?.text ?? '';
    expect(cfg2).toContain('autosave-interval-seconds: 120'); // 截断而非 120.5
    expect(r2.analysis.warnings.some((w: { msg: string }) => w.msg.includes('不是整数'))).toBe(
      true
    );
  });
});

describe('循环 56：战利品区间/权重与负经验值——静默行为显式化', () => {
  it('min>max 区间警告；weight=0.5 警告；xp<0 警告（生成侧钳制/忽略不再无声）', () => {
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    meta.nodes = {
      a: {
        loot: [
          { item: 'minecraft:diamond', max: 2, min: 5 },
          { item: 'minecraft:emerald', max: 3, min: 1, weight: 0.5 }
        ],
        params: {},
        trigger: 'manual',
        xp: -100
      }
    };
    const r = CORE.exportZip(
      CORE.buildCode(
        meta,
        'TD',
        [
          { id: 'root', label: '根', shape: 'rect' },
          { id: 'a', label: '甲', shape: 'rect' }
        ],
        [{ from: 'root', to: 'a' }]
      )
    );
    if (!r.ok) {
      throw new Error(r.errors.map((e) => e.msg).join(';'));
    }
    expect(r.analysis.warnings.some((w) => w.msg.includes('数量区间（5~2）无效'))).toBe(true);
    expect(r.analysis.warnings.some((w) => w.msg.includes('权重「0.5」无效'))).toBe(true);
    expect(r.analysis.warnings.some((w) => w.msg.includes('经验奖励 -100 为负数'))).toBe(true);
    // 生成侧钳制结果：diamond [5,5]（max 抬到 min），emerald 权重被忽略
    const loot =
      r.files.find((f) => f.path.includes('loot_table') && f.path.includes('a.json'))?.text ?? '';
    const parsed = JSON.parse(loot) as {
      pools: {
        entries: {
          weight?: number;
          functions: { function: string; count: { max: number; min: number } }[];
        }[];
      }[];
    };
    expect(parsed.pools[0].entries[0].functions[0].count).toEqual({ max: 5, min: 5 });
    expect(parsed.pools[0].entries[1].weight).toBeUndefined();
  });
});

describe('循环 57：栏图标与大满贯图标格式校验（此前零校验）', () => {
  it('非法栏图标/大满贯图标产生警告（带 tabId 可定位），整栏加载失败风险可见', () => {
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    (meta.tabs as Record<string, { icon?: string }>).root.icon = 'Not Valid!!';
    (meta.tabs as Record<string, { completionistIcon?: string }>).root.completionistIcon =
      '也是错的';
    const r = CORE.analyze(
      CORE.buildCode(
        meta,
        'TD',
        [
          { id: 'root', label: '根', shape: 'rect' },
          { id: 'a', label: '甲', shape: 'rect' }
        ],
        [{ from: 'root', to: 'a' }]
      )
    );
    const tWarn = r.warnings.find((w) => w.msg.includes('的图标「Not Valid!!」'));
    expect(tWarn?.msg).toContain('整个标签页可能无法加载');
    expect(tWarn?.tabId).toBe('root');
    expect(r.warnings.some((w) => w.msg.includes('大满贯图标「也是错的」'))).toBe(true);
  });
});

describe('循环 58：issue 行键盘可达（与树行同模式）+ 插件版本 1.9.0', () => {
  it('可定位 issue 带 role/tabindex 与 Enter/Space 处理；插件版本在册', () => {
    const html = decodeURIComponent(
      plugin.frontend.url.replace('data:text/html;charset=utf-8,', '')
    );
    expect(html).toContain('\' role="button" tabindex="0"'); // issueRow 输出
    expect(html).toContain("ev.key === 'Enter' || ev.key === ' '");
    expect(plugin.version).toBe('1.10.2');
  });
});

describe('循环 61：生成 README 修正（版本硬编码 + revoke 缺席）', () => {
  it('自定义版本进 README 产物文件名；命令列表含 revoke', () => {
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    meta.version = '2.3.1';
    const r = CORE.exportZip(
      CORE.buildCode(
        meta,
        'TD',
        [
          { id: 'root', label: '根', shape: 'rect' },
          { id: 'a', label: '甲', shape: 'rect' }
        ],
        [{ from: 'root', to: 'a' }]
      )
    );
    if (!r.ok) {
      throw new Error('导出失败');
    }
    const readme = r.files.find((f) => f.path === 'README.md')?.text ?? '';
    expect(readme).toContain('target/MyAchievements-2.3.1.jar'); // 曾硬编码 1.0.0
    expect(readme).not.toContain('-1.0.0.jar');
    expect(readme).toContain('revoke <玩家> <成就id>'); // 循环 41 的 revoke 曾未入 README
  });
});

describe('循环 62：大满贯负经验值如实提示（原样输出=解锁扣经验）', () => {
  it('completionistXp=-50 → 警告「扣除玩家经验」+ JSON rewards 原样 -50', () => {
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    (meta.tabs as Record<string, { completionistXp?: number }>).root.completionistXp = -50;
    const r = CORE.exportZip(
      CORE.buildCode(
        meta,
        'TD',
        [
          { id: 'root', label: '根', shape: 'rect' },
          { id: 'a', label: '甲', shape: 'rect' }
        ],
        [{ from: 'root', to: 'a' }]
      )
    );
    if (!r.ok) {
      throw new Error('导出失败');
    }
    const warn = r.analysis.warnings.find((w) => w.msg.includes('大满贯奖励经验 -50'));
    expect(warn?.msg).toContain('扣除玩家经验');
    expect(warn?.tabId).toBe('root');
    const comp = r.files.find((f) => f.path.endsWith('root_completionist.json'))?.text ?? '';
    expect(JSON.parse(comp).rewards.experience).toBe(-50); // 行为如实：原样输出
  });
});

describe('循环 63：播报格式标签语义修正', () => {
  it('留空=保留原版播报（曾误标「留空不播报」——空串实际不调用 event.message，原版消息保留）', () => {
    const html = decodeURIComponent(
      plugin.frontend.url.replace('data:text/html;charset=utf-8,', '')
    );
    expect(html).toContain('留空=保留原版播报');
    expect(html).not.toContain('留空不播报');
    // Java 侧语义锚：空 format 跳过 event.message（原版消息不被替换）
    const r = CORE.exportZip(CORE.starterCode());
    if (!r.ok) {
      throw new Error('导出失败');
    }
    const listener = r.files.find((f) => f.path.endsWith('AchievementListener.java'))?.text ?? '';
    expect(listener).toContain('!format.isEmpty()');
    expect(listener).toContain('event.message(');
  });
});

describe('循环 66：packFormat 数字输入 min 软护栏', () => {
  it('packFormat 输入带 min="1"（与 autosave 的 min=30 同款软护栏）', () => {
    const html = decodeURIComponent(
      plugin.frontend.url.replace('data:text/html;charset=utf-8,', '')
    );
    expect(html).toContain(
      "inputHtml('packFormat', '数据包格式版本（1.21.11 = 94）', String(m.packFormat), 'number', ' min=\"1\"')"
    );
  });
});

describe('循环 67：renameNode 非法 id 闸门（空格/中文曾直接产出非法 mermaid 代码）', () => {
  it('前端脚本含 [a-z0-9_] 闸门与状态提示；三个 id 入口共用 renameNode', () => {
    const html = decodeURIComponent(
      plugin.frontend.url.replace('data:text/html;charset=utf-8,', '')
    );
    expect(html).toContain('!/^[a-z0-9_]+$/.test(id)');
    expect(html).toContain('含非法字符');
    // 三个 data-k="id" 入口全部经 renameNode（节点/根/栏表单）
    expect((html.match(/renameNode\(/g) ?? []).length).toBeGreaterThanOrEqual(4); // 1 定义 + 3 调用
  });
});

describe('循环 68：statistic 统计项 datalist', () => {
  it('stats datalist 存在且 stat 输入挂载；候选含默认 walk_one_cm 与常用项', () => {
    const html = decodeURIComponent(
      plugin.frontend.url.replace('data:text/html;charset=utf-8,', '')
    );
    const opts = [...html.matchAll(/<option value="(jump|walk_one_cm|mob_kills|deaths)">/g)];
    expect(opts.length).toBeGreaterThanOrEqual(4);
    expect(html).toContain('<datalist id="stats">');
    expect(html).toContain(`' list="stats"'`);
  });
});

describe('循环 69：reach_height 越界建议性警告', () => {
  it('above 999 越界警告（措辞含「自定义维度」免责）；below -32 合法无警告；默认 300 无警告', () => {
    const build = (y: unknown, mode: string) =>
      CORE.analyze(
        CORE.buildCode(
          (() => {
            const m = CORE.readMeta(CORE.starterCode()).meta;
            m.nodes = { a: { params: { mode, y }, trigger: 'reach_height' } };
            return m;
          })(),
          'TD',
          [
            { id: 'root', label: '根', shape: 'rect' },
            { id: 'a', label: '甲', shape: 'rect' }
          ],
          [{ from: 'root', to: 'a' }]
        )
      );
    const r1 = build(999, 'above');
    expect(r1.warnings.some((w) => w.msg.includes('≥ 999') && w.msg.includes('自定义维度'))).toBe(
      true
    );
    expect(build(-32, 'below').warnings.some((w) => w.msg.includes('高度条件'))).toBe(false);
    expect(build(300, 'above').warnings.some((w) => w.msg.includes('高度条件'))).toBe(false);
  });
});

describe('循环 70：config 逐键注释对新参数自动覆盖（核验入测）', () => {
  it('tool/cause/profession/projectile 四个新参数的注释自动生成（循环 45 注册表机制）', () => {
    const meta = CORE.readMeta(CORE.starterCode()).meta;
    meta.nodes = {
      a: { params: { amount: 1, cause: 'melee' }, trigger: 'kill' },
      b: { params: { amount: 1, projectile: 'ARROW' }, trigger: 'projectile_hit' }
    };
    const r = CORE.exportZip(
      CORE.buildCode(
        meta,
        'TD',
        [
          { id: 'root', label: '根', shape: 'rect' },
          { id: 'a', label: '杀', shape: 'rect' },
          { id: 'b', label: '射', shape: 'rect' }
        ],
        [
          { from: 'root', to: 'a' },
          { from: 'root', to: 'b' }
        ]
      )
    );
    if (!r.ok) {
      throw new Error('导出失败');
    }
    const cfg = r.files.find((f) => f.path.endsWith('config.yml'))?.text ?? '';
    expect(cfg).toContain('# 伤害方式');
    expect(cfg).toContain('# 弹射物类型');
    expect(cfg).toContain('cause: "melee"');
    expect(cfg).toContain('projectile: "ARROW"');
  });
});

describe('JAR 一键导出（exports[1]，桌面直调编译链）', () => {
  const ctx = () => {
    const messages: string[] = [];
    return { messages, notify: (m: string) => messages.push(m) };
  };
  const jarRun = () => {
    const run = plugin.exports?.[1]?.run;
    if (!run) {
      throw new Error('jar export missing');
    }
    return run;
  };
  const setDesktop = (build: unknown) => {
    (window as unknown as { __FLOW_DESKTOP__?: unknown }).__FLOW_DESKTOP__ = build
      ? { mcBuild: { build } }
      : undefined;
  };

  it('manifest：exports 两项（zip 首位保持原 id，jar 第二），无旧单 export 字段', () => {
    expect(plugin.exports?.map((f) => f.id)).toEqual(['mc-plugin', 'mc-plugin-jar']);
    expect(plugin.exports?.[1]?.label).toContain('编译 .jar');
    expect((plugin as unknown as { export?: unknown }).export).toBeUndefined();
  });

  it('网页版（无桌面桥）：undefined + 引导提示（不抛错、不触发三振）', async () => {
    setDesktop(undefined);
    const c = ctx();
    const out = await jarRun()({ code: CORE.starterCode() }, c);
    expect(out).toBeUndefined();
    expect(c.messages[0]).toContain('仅在桌面版可用');
    expect(c.messages[0]).toContain('mvn package');
  });

  it('桌面无 JDK：结构化错误文案透传（主进程引导文案直达用户）', async () => {
    setDesktop(async () => ({
      error: { message: '未检测到 JDK 21+，请您自行安装（如 Eclipse Temurin）后重试' },
      ok: false
    }));
    const c = ctx();
    const out = await jarRun()({ code: CORE.starterCode() }, c);
    expect(out).toBeUndefined();
    expect(c.messages[0]).toContain('未检测到 JDK 21+');
  });

  it('桌面编译成功：base64 → Blob 下载载荷 + 成功提示含 JDK 版本', async () => {
    // mock 后端（真实 javac 链路由 installer/scripts/test-mc-build.mjs 15 项覆盖）
    setDesktop(async (request: { filename?: string }) => ({
      filename: request.filename ?? 'MyAchievements-1.0.0.jar',
      jarBase64: Buffer.from('PK-fake-jar-bytes').toString('base64'),
      jdkVersion: '21.0.5',
      ok: true
    }));
    const c = ctx();
    const out = await jarRun()({ code: CORE.starterCode() }, c);
    expect(out?.filename).toBe('MyAchievements-1.0.0.jar');
    expect(out?.blob).toBeInstanceOf(Blob);
    expect(out?.blob && (await out.blob.text())).toBe('PK-fake-jar-bytes');
    expect(c.messages[0]).toContain('已编译');
    expect(c.messages[0]).toContain('21.0.5');
    setDesktop(undefined);
  });

  it('非法图（非 flowchart）：编译前拦截并提示首个错误', async () => {
    setDesktop(async () => ({ ok: true })); // 即使桌面在也不应走到编译
    const c = ctx();
    const out = await jarRun()({ code: 'pie title x\n  "a": 1\n' }, c);
    expect(out).toBeUndefined();
    expect(c.messages[0]).toContain('无法编译');
    setDesktop(undefined);
  });
});
