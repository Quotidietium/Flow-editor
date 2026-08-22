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
}
interface AnalysisNode {
  frame: string;
  id: string;
  label: string;
  nid: string;
  parent: null | string;
  shape: string;
  tab: string;
}
interface Analysis {
  edges: { from: string; label?: string; to: string }[];
  errors: Issue[];
  meta: Record<string, unknown>;
  nodes: AnalysisNode[];
  ok: boolean;
  tabs: { members: string[]; name: string; rootId: string; rootNid: string }[];
  warnings: Issue[];
}
interface Core {
  analyze(code: string): Analysis;
  buildCode(meta: unknown, direction: string, nodes: unknown[], edges: unknown[]): string;
  buildJarRequest(
    code: string
  ):
    | { analysis: Analysis; filename: string; files: { path: string; text: string }[]; ok: true }
    | { errors: Issue[]; ok: false };
  buildZip(files: { path: string; text: string }[]): Uint8Array;
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
    nodes: { id: string; label: string; shape: string }[];
    skipped: number;
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
interface PluginModule {
  _core: Core;
  default: {
    export: {
      run(
        input: { code: string },
        ctx: { notify(msg: string): void }
      ): { blob?: Blob; filename: string } | undefined;
    };
    frontend: { sandbox?: string; url: string };
    id: string;
    name: string;
    permissions: string[];
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

  it('兼容手写形态（graph 头/分号/虚线/文字边/注释与指令行跳过）', () => {
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
    expect(flow.skipped).toBeGreaterThanOrEqual(2);
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
    expect(listener).toContain('ENTITY_PLAYER_LEVELUP');
    expect(listener).toContain('store.add(player, achievement.id(), delta)');

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

  it('合法图返回 zip blob', () => {
    const c = ctx();
    const out = plugin.export.run({ code: CORE.starterCode() }, c);
    expect(out?.filename).toBe('MyAchievements.zip');
    expect(out?.blob).toBeInstanceOf(Blob);
    expect(c.messages[0]).toContain('MyAchievements.zip');
  });

  it('非法图返回 undefined 并提示首个错误', () => {
    const c = ctx();
    const out = plugin.export.run({ code: 'pie title x\n  "a": 1\n' }, c);
    expect(out).toBeUndefined();
    expect(c.messages[0]).toContain('无法导出 MC 插件');
  });

  it('前端声明 allow-downloads（导出按钮在沙箱 iframe 内可下载）', () => {
    expect(plugin.frontend.sandbox).toContain('allow-downloads');
    expect(plugin.frontend.url.startsWith('data:text/html')).toBe(true);
  });
});
