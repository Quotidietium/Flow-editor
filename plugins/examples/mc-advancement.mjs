/**
 * MC 进度设计器：把 Flow 编辑器里的流程图一键导出为可编译的 Paper 成就插件
 * （Maven 工程 zip：内置数据包 + 事件监听器 + 进度持久化 + 命令）。
 *
 * 图 ↔ 成就映射（设计文档见 note/mc-advancement-plugin.md）：
 *   节点 = 成就（标签=名称），边 = parent 承接，形状 = 框架类型
 *   （矩形=任务 / 圆角=目标 / 菱形=挑战），连通分量 = 成就栏（无入边节点=栏根），
 *   frontmatter 的 mcadv 键（JSON）= 插件级/栏级/成就级全部元数据。
 *
 * 安装后即可用：「导出 ▾ → MC 成就插件（Maven 工程 .zip）」一键导出；
 * 插件管理器「打开 MC 进度设计器」进入属性面板（触发器/图标/奖励/成就栏管理）。
 *
 * 触发器表 TRIGGERS 同时驱动前端参数表单、config.yml 键与 Java 监听器生成；
 * 导出的 Java 工程基于 REF/Minecraft-Achievement-plugin（Paper 1.21.11 +
 * paper-plugin.yml + bootstrapper 注册内置数据包）泛化而来。
 */

// ============================================================================
// coreFactory：自包含核心逻辑。本函数不引用任何模块级变量——它的源码经
// Function.prototype.toString() 注入下方 FRONTEND_HTML，在插件前端 iframe
// 里再执行一次，使导出菜单与前端面板共享同一套解析/校验/生成/打包实现。
// ============================================================================
const coreFactory = function () {
  'use strict';

  // ------------------------------------------------------------------ 常量

  /** 触发器注册表：counted=需计数持久化；stat=走原版统计轮询；event=事件直授。 */
  const TRIGGERS = [
    {
      counted: false,
      desc: '加入服务器时达成',
      event: 'join',
      id: 'join',
      name: '加入服务器',
      params: [{ def: true, key: 'firstOnly', label: '仅首次加入', type: 'bool' }]
    },
    {
      counted: true,
      desc: '累计挖掘指定数量方块',
      event: 'break',
      id: 'break_block',
      name: '挖掘方块',
      params: [
        {
          def: '',
          key: 'material',
          label: '方块类型（留空=任意）',
          ph: 'minecraft:stone',
          type: 'text'
        },
        { def: 200, key: 'amount', label: '累计数量', min: 1, type: 'int' }
      ]
    },
    {
      counted: true,
      desc: '累计放置指定数量方块',
      event: 'place',
      id: 'place_block',
      name: '放置方块',
      params: [
        {
          def: '',
          key: 'material',
          label: '方块类型（留空=任意）',
          ph: 'minecraft:oak_planks',
          type: 'text'
        },
        { def: 100, key: 'amount', label: '累计数量', min: 1, type: 'int' }
      ]
    },
    {
      counted: true,
      desc: '累计进食/饮用指定次数',
      event: 'consume',
      id: 'consume',
      name: '食用 / 饮用',
      params: [
        { def: '', key: 'item', label: '物品（留空=任意）', ph: 'minecraft:bread', type: 'text' },
        { def: 30, key: 'amount', label: '累计数量', min: 1, type: 'int' }
      ]
    },
    {
      counted: true,
      desc: '累计击杀指定数量生物',
      event: 'kill',
      id: 'kill',
      name: '击杀生物',
      params: [
        {
          def: 'hostile',
          key: 'entity',
          label: '生物类型（hostile=敌对，留空=任意非玩家）',
          ph: 'minecraft:zombie',
          type: 'text'
        },
        { def: 30, key: 'amount', label: '累计数量', min: 1, type: 'int' }
      ]
    },
    {
      counted: true,
      desc: '累计钓上指定数量鱼',
      event: 'fish',
      id: 'fish',
      name: '钓鱼',
      params: [{ def: 10, key: 'amount', label: '累计数量', min: 1, type: 'int' }]
    },
    {
      counted: false,
      desc: '抵达指定 Y 高度',
      event: 'move',
      id: 'reach_height',
      name: '到达高度',
      params: [
        { def: 300, key: 'y', label: 'Y 坐标', type: 'int' },
        { def: 'above', key: 'mode', label: '方向', options: ['above', 'below'], type: 'select' }
      ]
    },
    {
      counted: true,
      desc: '累计合成指定数量物品',
      event: 'craft',
      id: 'craft',
      name: '合成物品',
      params: [
        { def: '', key: 'item', label: '物品（留空=任意）', ph: 'minecraft:cake', type: 'text' },
        { def: 10, key: 'amount', label: '累计数量', min: 1, type: 'int' }
      ]
    },
    {
      counted: true,
      desc: '累计附魔指定次数',
      event: 'enchant',
      id: 'enchant',
      name: '附魔',
      params: [{ def: 1, key: 'amount', label: '累计次数', min: 1, type: 'int' }]
    },
    {
      counted: true,
      desc: '累计与村民交易指定次数',
      event: 'trade',
      id: 'trade',
      name: '村民交易',
      params: [{ def: 10, key: 'amount', label: '累计次数', min: 1, type: 'int' }]
    },
    {
      counted: true,
      desc: '累计驯服指定数量生物',
      event: 'tame',
      id: 'tame',
      name: '驯服生物',
      params: [
        {
          def: '',
          key: 'entity',
          label: '生物类型（留空=任意）',
          ph: 'minecraft:wolf',
          type: 'text'
        },
        { def: 1, key: 'amount', label: '累计数量', min: 1, type: 'int' }
      ]
    },
    {
      counted: true,
      desc: '累计繁殖指定数量动物',
      event: 'breed',
      id: 'breed',
      name: '繁殖动物',
      params: [
        {
          def: '',
          key: 'entity',
          label: '生物类型（留空=任意）',
          ph: 'minecraft:cow',
          type: 'text'
        },
        { def: 5, key: 'amount', label: '累计数量', min: 1, type: 'int' }
      ]
    },
    {
      counted: true,
      desc: '累计入睡指定次数',
      event: 'sleep',
      id: 'sleep',
      name: '入睡',
      params: [{ def: 1, key: 'amount', label: '累计次数', min: 1, type: 'int' }]
    },
    {
      counted: true,
      desc: '累计死亡指定次数',
      event: 'death',
      id: 'death',
      name: '死亡',
      params: [{ def: 1, key: 'amount', label: '累计次数', min: 1, type: 'int' }]
    },
    {
      counted: false,
      desc: '经验等级达到指定等级',
      event: 'level',
      id: 'reach_level',
      name: '经验等级达标',
      params: [{ def: 30, key: 'level', label: '等级', min: 1, type: 'int' }]
    },
    {
      counted: true,
      desc: '累计拾取指定数量物品',
      event: 'pickup',
      id: 'pickup',
      name: '拾取物品',
      params: [
        { def: '', key: 'item', label: '物品（留空=任意）', ph: 'minecraft:diamond', type: 'text' },
        { def: 64, key: 'amount', label: '累计数量', min: 1, type: 'int' }
      ]
    },
    {
      counted: false,
      desc: '聊天内容包含指定关键词',
      event: 'chat',
      id: 'chat_keyword',
      name: '聊天关键词',
      params: [{ def: '', key: 'keyword', label: '关键词', ph: '萌新报到', type: 'text' }]
    },
    {
      counted: false,
      desc: '完成指定原版/其他进度',
      event: 'advancement',
      id: 'advancement_done',
      name: '完成其他进度',
      params: [
        {
          def: 'minecraft:story/mine_diamond',
          key: 'key',
          label: '进度 ID',
          ph: 'minecraft:story/mine_diamond',
          type: 'text'
        }
      ]
    },
    {
      counted: false,
      desc: '累计在线时长达标（原版统计，无需插件计数）',
      event: 'stat',
      id: 'playtime',
      name: '累计在线时长',
      params: [{ def: 60, key: 'minutes', label: '分钟数', min: 1, type: 'int' }],
      stat: true
    },
    {
      counted: false,
      desc: '原版统计项达标（行走距离/跳跃次数等，无需插件计数）',
      event: 'stat',
      id: 'statistic',
      name: '原版统计达标',
      params: [
        { def: 'walk_one_cm', key: 'stat', label: '统计项 ID', ph: 'walk_one_cm', type: 'text' },
        {
          def: '',
          key: 'target',
          label: '对象（可空，填物品或生物 ID）',
          ph: 'minecraft:pig',
          type: 'text'
        },
        { def: 100000, key: 'amount', label: '目标值', min: 1, type: 'int' }
      ],
      stat: true
    },
    {
      counted: true,
      desc: '累计剪羊毛指定次数',
      event: 'shear',
      id: 'shear',
      name: '剪羊毛',
      params: [
        {
          def: '',
          key: 'entity',
          label: '生物类型（留空=任意）',
          ph: 'minecraft:sheep',
          type: 'text'
        },
        { def: 10, key: 'amount', label: '累计数量', min: 1, type: 'int' }
      ]
    },
    {
      counted: false,
      desc: '骑乘任意生物（骑马/骑猪等）时达成',
      event: 'mount',
      id: 'ride',
      name: '骑乘生物',
      params: [
        {
          def: '',
          key: 'entity',
          label: '生物类型（留空=任意）',
          ph: 'minecraft:horse',
          type: 'text'
        }
      ]
    },
    {
      counted: false,
      desc: '进入下界/末地传送门时达成',
      event: 'portal',
      id: 'portal',
      name: '进入传送门',
      params: []
    },
    {
      counted: true,
      desc: '累计受伤指定次数',
      event: 'damage',
      id: 'damage_taken',
      name: '累计受伤',
      params: [{ def: 100, key: 'amount', label: '累计次数', min: 1, type: 'int' }]
    },
    {
      counted: true,
      desc: '弹射物累计命中生物（射箭/雪球/三叉戟等）',
      event: 'projectile',
      id: 'projectile_hit',
      name: '弹射物命中',
      params: [{ def: 30, key: 'amount', label: '累计命中数', min: 1, type: 'int' }]
    },
    {
      counted: false,
      desc: '开始滑翔（穿戴鞘翅飞行）时达成',
      event: 'glide',
      id: 'glide',
      name: '开始滑翔',
      params: []
    },
    {
      counted: false,
      desc: '开始游泳时达成',
      event: 'swim',
      id: 'swim',
      name: '开始游泳',
      params: []
    },
    {
      counted: true,
      desc: '累计用桶装取液体（水/岩浆等）',
      event: 'bucket',
      id: 'bucket_fill',
      name: '装桶',
      params: [{ def: 10, key: 'amount', label: '累计次数', min: 1, type: 'int' }]
    },
    {
      counted: true,
      desc: '累计获得经验值总量（附魔/熔炼/击杀经验等）',
      event: 'xp',
      id: 'xp_gain',
      name: '获得经验',
      params: [{ def: 1000, key: 'amount', label: '累计经验值', min: 1, type: 'int' }]
    },
    {
      counted: false,
      desc: '只能由管理员用 /<命令> grant 手动授予',
      event: 'manual',
      id: 'manual',
      name: '仅命令授予（默认）',
      params: []
    }
  ];

  /** 下拉分组（前端 optgroup 用）；未列出的归「其他」。 */
  const TRIGGER_GROUPS = {
    日常: ['join', 'consume', 'sleep', 'chat_keyword', 'trade', 'playtime'],
    收集与建造: ['break_block', 'place_block', 'craft', 'pickup', 'enchant', 'bucket_fill'],
    战斗与冒险: ['kill', 'death', 'damage_taken', 'projectile_hit', 'tame', 'breed', 'ride'],
    探索与世界: ['reach_height', 'portal', 'glide', 'swim', 'fish', 'shear'],
    技能与进度: ['reach_level', 'xp_gain', 'advancement_done', 'statistic'],
    手动: ['manual']
  };
  const triggerGroup = (id) => {
    for (const [group, ids] of Object.entries(TRIGGER_GROUPS)) {
      if (ids.includes(id)) {
        return group;
      }
    }
    return '其他';
  };

  const triggerById = (id) => TRIGGERS.find((t) => t.id === id) ?? TRIGGERS.at(-1);

  /** 常用图标候选（前端 datalist）。 */
  const ICON_SUGGESTIONS = [
    'minecraft:book',
    'minecraft:compass',
    'minecraft:nether_star',
    'minecraft:dragon_egg',
    'minecraft:iron_pickaxe',
    'minecraft:diamond_sword',
    'minecraft:golden_apple',
    'minecraft:cooked_beef',
    'minecraft:fishing_rod',
    'minecraft:elytra',
    'minecraft:beacon',
    'minecraft:cake',
    'minecraft:emerald',
    'minecraft:wolf_spawn_egg',
    'minecraft:hay_block',
    'minecraft:red_bed',
    'minecraft:skeleton_skull',
    'minecraft:enchanting_table',
    'minecraft:crafting_table',
    'minecraft:experience_bottle',
    'minecraft:chest',
    'minecraft:clock',
    'minecraft:map',
    'minecraft:tnt',
    'minecraft:torch'
  ];

  const SHAPE_FRAME = { diamond: 'challenge', rect: 'task', round: 'goal', stadium: 'task' };
  const FRAME_SHAPE = { challenge: 'diamond', goal: 'round', task: 'rect' };
  const FRAME_NAME = { challenge: '挑战', goal: '目标', task: '任务' };

  const DEFAULT_NODE_META = {
    announce: true,
    desc: '',
    hidden: false,
    icon: '',
    params: {},
    toast: true,
    trigger: 'manual',
    xp: 0
  };

  const defaultMeta = () => ({
    announceFormat: '[成就] %player% 达成了 [%name%]',
    author: 'Zurker',
    autosaveSeconds: 300,
    command: 'myach',
    namespace: 'myach',
    nodes: {},
    packFormat: 94,
    packageName: '',
    plugin: 'MyAchievements',
    sound: true,
    tabs: {},
    version: '1.0.0'
  });

  // ------------------------------------------------------------- 标识符规范

  /** MC 进度 id / 文件名：`[a-z0-9_]`，非法字符折叠为 _。 */
  const normId = (id) =>
    String(id ?? '')
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9_]/g, '_')
      .replaceAll(/_{2,}/g, '_')
      .replaceAll(/^_+|_+$/g, '');

  const normNamespace = (ns) => normId(ns) || 'myach';

  /** Java 包名：小写字母/数字/点/下划线，段首必须字母。 */
  const normPackage = (pkg, ns) => {
    const raw = (pkg || `dev.floweditor.${ns}`).toLowerCase().replaceAll(/[^a-z0-9_.]/g, '');
    const parts = raw
      .split('.')
      .filter(Boolean)
      .map((p) => (/^[a-z]/.test(p) ? p : `p${p}`));
    return parts.length >= 2 ? parts.join('.') : `dev.floweditor.${ns}`;
  };

  /** paper-plugin.yml 的插件名 / 类名基础：字母开头，字母数字下划线。 */
  const normPluginName = (name) => {
    const clean = String(name ?? '').replaceAll(/[^A-Za-z0-9_]/g, '');
    const withLetter = /^[A-Za-z]/.test(clean) ? clean : `Mc${clean}`;
    return (withLetter || 'MyAchievements').replace(/^./, (c) => c.toUpperCase());
  };

  const normCommand = (cmd, ns) => {
    const clean = String(cmd ?? '')
      .toLowerCase()
      .replaceAll(/[^a-z0-9_-]/g, '');
    return /^[a-z]/.test(clean) ? clean : ns;
  };

  /** Java 枚举常量名。 */
  const enumName = (nid) => {
    const up = nid.toUpperCase();
    return /^[A-Z]/.test(up) ? up : `A_${up}`;
  };

  // ------------------------------------------------------------ frontmatter

  const splitFm = (code) => {
    if (!code.startsWith('---')) {
      return { body: code, fm: null };
    }
    const end = code.indexOf('\n---', 3);
    if (end === -1) {
      return { body: code, fm: null };
    }
    const after = code.indexOf('\n', end + 1);
    return {
      body: code.slice(after === -1 ? code.length : after + 1),
      fm: code.slice(4, end).trim()
    };
  };

  /** 读取 mcadv 元数据；frontmatter 内容是 JSON（YAML 子集）。 */
  const readMeta = (code) => {
    const { body, fm } = splitFm(code);
    if (!fm) {
      return { body, meta: defaultMeta(), metaFound: false };
    }
    try {
      const parsed = JSON.parse(fm);
      const mcadv = parsed && typeof parsed === 'object' ? parsed.mcadv : undefined;
      if (!mcadv || typeof mcadv !== 'object') {
        return { body, meta: defaultMeta(), metaFound: false };
      }
      const meta = { ...defaultMeta(), ...mcadv };
      meta.nodes = mcadv.nodes && typeof mcadv.nodes === 'object' ? mcadv.nodes : {};
      meta.tabs = mcadv.tabs && typeof mcadv.tabs === 'object' ? mcadv.tabs : {};
      return { body, meta, metaFound: true };
    } catch {
      return { body, meta: defaultMeta(), metaFound: false, metaError: true };
    }
  };

  // -------------------------------------------------------- flowchart 解析

  const QUOTED = /^"((?:[^"\\]|\\.)*)"/;

  /** 在 s 的 i 处读一个节点记号：id + 可选形状标签。返回 null 表示不是节点。 */
  const readNode = (s, i) => {
    const m = /^([A-Za-z0-9_][A-Za-z0-9_.-]*)/.exec(s.slice(i));
    if (!m) {
      return null;
    }
    const id = m[1];
    let j = i + id.length;
    let label;
    let shape;
    const tail = s.slice(j);
    let openLen = 0;
    let close = '';
    if (tail.startsWith('([')) {
      openLen = 2;
      close = '])';
      shape = 'stadium';
    } else if (tail.startsWith('[')) {
      openLen = 1;
      close = ']';
      shape = 'rect';
    } else if (tail.startsWith('(')) {
      openLen = 1;
      close = ')';
      shape = 'round';
    } else if (tail.startsWith('{')) {
      openLen = 1;
      close = '}';
      shape = 'diamond';
    }
    if (openLen > 0) {
      const contentStart = j + openLen;
      const quoted = QUOTED.exec(s.slice(contentStart));
      if (quoted) {
        label = quoted[1].replaceAll('\\"', '"');
        j = contentStart + quoted[0].length;
        if (s.slice(j, j + close.length) === close) {
          j += close.length;
        }
      } else {
        const endIdx = s.indexOf(close, contentStart);
        if (endIdx === -1) {
          return { id, next: contentStart }; // 形状未闭合：按裸 id 容错
        }
        label = s.slice(contentStart, endIdx);
        j = endIdx + close.length;
      }
    }
    return { id, label, next: j, shape };
  };

  /** 在 s 的 i 处读一个连线记号（含可选文字），允许前置空白。 */
  const readEdge = (s, i) => {
    const rest = s.slice(i);
    let m = /^\s*-\.\s*([^-.]+?)\s*\.->\s*/.exec(rest);
    if (m) {
      return { label: m[1].trim(), next: i + m[0].length };
    }
    m = /^\s*--\s*([^>|]+?)\s*-->\s*/.exec(rest);
    if (m) {
      return { label: m[1].trim(), next: i + m[0].length };
    }
    m = /^\s*(?:-\.->|-->|---)\s*(?:\|([^|]*)\|\s*)?/.exec(rest);
    if (m) {
      return { label: (m[1] ?? '').trim(), next: i + m[0].length };
    }
    return null;
  };

  /**
   * 解析 flowchart/graph 代码体为节点/边模型。尽力而为：注释、subgraph、
   * style/classDef 等指令行跳过并计数。覆盖可视化编辑器生成的全部形态
   * （4 形状、引号标签、链式边、|标签|/文字边）与常见手写形态（分号、graph 头）。
   */
  const parseFlow = (code) => {
    const { body } = splitFm(code); // 防御：允许直接传入含 frontmatter 的全文
    const nodes = [];
    const edges = [];
    const byId = new Map();
    let direction = 'TD';
    let skipped = 0;
    let headerSeen = false;

    const addNode = (tok) => {
      let node = byId.get(tok.id);
      if (!node) {
        node = { id: tok.id, label: tok.label ?? tok.id, shape: tok.shape ?? 'rect' };
        byId.set(tok.id, node);
        nodes.push(node);
      } else if (tok.label !== undefined || tok.shape !== undefined) {
        if (tok.label !== undefined) {
          node.label = tok.label;
        }
        if (tok.shape !== undefined) {
          node.shape = tok.shape;
        }
      }
      return node;
    };

    const SKIP_RE =
      /^%%|^(?:subgraph|style|classDef|class|click|linkStyle|direction|title)\s|^end\s*$/;

    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }
      const head = /^(flowchart|graph)\s*(TD|TB|BT|LR|RL)?/i.exec(line);
      if (head && !headerSeen) {
        headerSeen = true;
        if (head[2] && /LR|RL/i.test(head[2])) {
          direction = 'LR';
        }
        continue;
      }
      if (SKIP_RE.test(line)) {
        skipped++;
        continue;
      }
      for (const stmt of line.split(';')) {
        const text = stmt.trim();
        if (!text) {
          continue;
        }
        let i = 0;
        let tok = readNode(text, i);
        if (!tok) {
          skipped++;
          continue;
        }
        let prev = addNode(tok);
        i = tok.next;
        let guard = 0;
        while (i < text.length && guard++ < 1000) {
          const edge = readEdge(text, i);
          if (!edge) {
            break;
          }
          const nextTok = readNode(text, edge.next);
          if (!nextTok) {
            break;
          }
          const target = addNode(nextTok);
          edges.push({ from: prev.id, label: edge.label, to: target.id });
          prev = target;
          i = nextTok.next;
        }
        if (i < text.length && text.slice(i).trim()) {
          skipped++; // 行尾不可解析残片
        }
      }
    }
    return { direction, edges, headerSeen, nodes, skipped };
  };

  // --------------------------------------------------------- 代码反向生成

  const needsQuotes = (label) => /[[\](){}|;"']/.test(label) || label.trim() === '';

  const renderNode = (node) => {
    const clean = String(node.label ?? '')
      .replaceAll('"', '')
      .replaceAll(/[\r\n]+/g, ' ')
      .trim();
    const label = clean || String(node.id);
    const text = needsQuotes(label) ? `"${label}"` : label;
    switch (node.shape) {
      case 'diamond': {
        return `${node.id}{${text}}`;
      }
      case 'round': {
        return `${node.id}(${text})`;
      }
      case 'stadium': {
        return `${node.id}([${text}])`;
      }
      default: {
        return `${node.id}[${text}]`;
      }
    }
  };

  /** 由可编辑模型生成完整图表代码（frontmatter + 规范 flowchart 文本）。 */
  const buildCode = (meta, direction, nodes, edges) => {
    const fm = `---\n${JSON.stringify({ mcadv: meta }, null, 2)}\n---\n`;
    const lines = [`flowchart ${direction === 'LR' ? 'LR' : 'TD'}`];
    for (const node of nodes) {
      lines.push(`    ${renderNode(node)}`);
    }
    for (const edge of edges) {
      const label = String(edge.label ?? '')
        .replaceAll(/[|"']/g, '')
        .trim();
      lines.push(
        label ? `    ${edge.from} -->|${label}| ${edge.to}` : `    ${edge.from} --> ${edge.to}`
      );
    }
    return `${fm}${lines.join('\n')}\n`;
  };

  // --------------------------------------------------------- 元数据存取

  const nodeMeta = (meta, nodeId) => {
    const raw = meta.nodes?.[nodeId];
    const merged = { ...DEFAULT_NODE_META, ...(raw && typeof raw === 'object' ? raw : {}) };
    merged.params = { ...(raw?.params && typeof raw.params === 'object' ? raw.params : {}) };
    return merged;
  };

  const tabMeta = (meta, rootId) => {
    const raw = meta.tabs?.[rootId];
    return {
      background: 'minecraft:textures/block/deepslate_tiles.png',
      completionist: true,
      completionistDesc: '解锁本栏所有其他成就',
      completionistIcon: 'minecraft:dragon_egg',
      completionistName: '大满贯！',
      completionistXp: 100,
      desc: '',
      icon: 'minecraft:nether_star',
      ...(raw && typeof raw === 'object' ? raw : {})
    };
  };

  /** 触发器参数有效值（注册表默认值兜底）。 */
  const triggerParams = (meta, nodeId) => {
    const nm = nodeMeta(meta, nodeId);
    const spec = triggerById(nm.trigger);
    const out = {};
    for (const p of spec.params) {
      const v = nm.params[p.key];
      out[p.key] = v === undefined || v === null || v === '' ? p.def : v;
    }
    return out;
  };

  // ------------------------------------------------------------- 模型分析

  /**
   * 全量分析：解析 → 规范化 → 校验 → 建树。
   * 返回 { ok, errors[], warnings[], meta, direction, nodes[], edges[], tabs[], skipped }。
   * nodes 项：{ id, nid, label, shape, frame, meta, params, parent(nid|null), tab(nid) }。
   * tabs 项：{ rootId, rootNid, name, meta, members[]（含根，BFS 序） }。
   */
  const analyze = (code) => {
    const errors = [];
    const warnings = [];
    const { body, meta, metaError } = readMeta(code);
    if (metaError) {
      errors.push({ msg: 'frontmatter 中的 JSON 无法解析（mcadv 元数据损坏）' });
    }
    const flow = parseFlow(body);
    if (!flow.headerSeen) {
      errors.push({ msg: '图类型必须是流程图（flowchart/graph）才能导出 MC 成就插件' });
      return { edges: [], errors, meta, nodes: [], ok: false, tabs: [], warnings };
    }
    if (flow.nodes.length === 0) {
      errors.push({ msg: '图中没有任何节点：先在画布上添加成就节点' });
      return { edges: [], errors, meta, nodes: [], ok: false, tabs: [], warnings };
    }

    // id 规范化与冲突
    const nidOf = new Map();
    const owner = new Map();
    for (const node of flow.nodes) {
      const nid = normId(node.id);
      if (!nid) {
        errors.push({
          msg: `节点「${node.id}」无法转换为合法成就 id（需要字母/数字/下划线）`,
          nodeId: node.id
        });
        continue;
      }
      const prev = owner.get(nid);
      if (prev) {
        errors.push({
          msg: `节点「${prev}」与「${node.id}」规范化后是同一个成就 id「${nid}」，请改名区分`,
          nodeId: node.id
        });
        continue;
      }
      owner.set(nid, node.id);
      nidOf.set(node.id, nid);
    }

    // 邻接（忽略自环边与完全重复的边）
    const edges = [];
    const seenEdge = new Set();
    for (const e of flow.edges) {
      if (e.from === e.to) {
        continue;
      }
      const sig = `${e.from}→${e.to}`;
      if (seenEdge.has(sig)) {
        continue;
      }
      seenEdge.add(sig);
      edges.push(e);
    }
    const indegree = new Map();
    const children = new Map();
    for (const e of edges) {
      if (!nidOf.has(e.from) || !nidOf.has(e.to)) {
        continue;
      }
      indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
      if ((indegree.get(e.to) ?? 0) === 2) {
        warnings.push({
          msg: `成就「${e.to}」有多个父级（MC 进度只支持单一 parent），导出时仅第一条连线生效`,
          nodeId: e.to
        });
      }
      if (!children.has(e.from)) {
        children.set(e.from, []);
      }
      children.get(e.from).push(e.to);
      if (e.label) {
        warnings.push({
          msg: `连线「${e.from} → ${e.to}」上的文字「${e.label}」在 MC 进度中无对应语义，导出时忽略`
        });
      }
    }

    // 环检测（DFS 三色）
    const color = new Map();
    let cycleNode = null;
    const dfs = (id) => {
      color.set(id, 1);
      for (const next of children.get(id) ?? []) {
        if (color.get(next) === 1) {
          cycleNode = next;
          return true;
        }
        if (!color.get(next) && dfs(next)) {
          return true;
        }
      }
      color.set(id, 2);
      return false;
    };
    for (const node of flow.nodes) {
      if (!color.has(node.id) && dfs(node.id)) {
        break;
      }
    }
    if (cycleNode) {
      errors.push({
        msg: `成就承接关系存在环（涉及节点「${cycleNode}」附近），MC 进度树不允许成环`,
        nodeId: cycleNode
      });
    }

    // 连通分量（并查集）
    const parent0 = new Map(flow.nodes.map((n) => [n.id, n.id]));
    const find = (x) => {
      while (parent0.get(x) !== x) {
        parent0.set(x, parent0.get(parent0.get(x)));
        x = parent0.get(x);
      }
      return x;
    };
    for (const e of edges) {
      const ra = find(e.from);
      const rb = find(e.to);
      if (ra !== rb) {
        parent0.set(rb, ra);
      }
    }
    const components = new Map();
    for (const node of flow.nodes) {
      const r = find(node.id);
      if (!components.has(r)) {
        components.set(r, []);
      }
      components.get(r).push(node.id);
    }

    // 每个分量恰一个根（无入边节点）
    const tabs = [];
    for (const memberIds of components.values()) {
      const roots = memberIds.filter((id) => (indegree.get(id) ?? 0) === 0);
      if (roots.length === 0) {
        errors.push({
          msg: `存在一个没有根成就的分组（如「${memberIds[0]}」所在的环），每个成就栏需要恰有一个无父级的根`
        });
        continue;
      }
      if (roots.length > 1) {
        errors.push({
          msg: `成就栏存在 ${roots.length} 个无父级节点（${roots.join('、')}）：同一栏内只能有一个根，请把它们连到同一个根下（需要多栏时请断开成互不相连的多棵树）`
        });
        continue;
      }
      const rootId = roots[0];
      const rootNid = nidOf.get(rootId);
      // BFS 排序成员
      const order = [];
      const queue = [rootId];
      const seen = new Set([rootId]);
      while (queue.length > 0) {
        const cur = queue.shift();
        order.push(cur);
        for (const next of children.get(cur) ?? []) {
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      tabs.push({
        members: order,
        meta: tabMeta(meta, rootId),
        name: byIdLabel(flow, rootId),
        rootId,
        rootNid
      });
    }

    const byId = new Map(flow.nodes.map((n) => [n.id, n]));
    const nodes = [];
    const buildNode = (nodeId, tabNid) => {
      const node = byId.get(nodeId);
      const nm = nodeMeta(meta, nodeId);
      const parentEdge = edges.find((e) => e.to === nodeId);
      const spec = triggerById(nm.trigger);
      if (!TRIGGERS.some((t) => t.id === nm.trigger)) {
        warnings.push({
          msg: `成就「${node.label}」的触发方式「${nm.trigger}」无法识别，按「仅命令授予」处理`,
          nodeId
        });
      }
      for (const p of spec.params) {
        if (p.type === 'int') {
          const v = Number(nm.params[p.key] ?? p.def);
          // min 仅在有声明时约束（reach_height 的 Y 允许负值——below 模式需要）
          if (!Number.isFinite(v) || (p.min !== undefined && v < p.min)) {
            errors.push({
              msg: `成就「${node.label}」的参数「${p.label}」需要${p.min === undefined ? '是数值' : ` ≥${p.min} 的整数`}`,
              nodeId
            });
          }
        }
        if (p.key === 'keyword' && !String(nm.params.keyword ?? '').trim()) {
          errors.push({ msg: `成就「${node.label}」使用聊天关键词触发，但未填写关键词`, nodeId });
        }
        // MC 资源 ID 格式（material/item/entity/stat/key/target）；entity 另允许 hostile
        if (['material', 'item', 'stat', 'key', 'target'].includes(p.key)) {
          const v = String(nm.params[p.key] ?? p.def ?? '').trim();
          if (v && !/^(minecraft:)?[a-z0-9_./-]+$/.test(v)) {
            warnings.push({
              msg: `成就「${node.label}」的参数「${p.label}」的值「${v}」不像合法的 MC 资源 ID，服务端可能按「任意」降级`,
              nodeId
            });
          }
        }
        if (p.key === 'entity') {
          const v = String(nm.params.entity ?? '').trim();
          if (v && v !== 'hostile' && !/^(minecraft:)?[a-z0-9_.]+$/.test(v)) {
            warnings.push({
              msg: `成就「${node.label}」的生物类型「${v}」无法识别，服务端将按「任意」降级`,
              nodeId
            });
          }
        }
      }
      const icon = String(nm.icon ?? '').trim();
      if (icon && !/^(minecraft:)?[a-z0-9_.]+$/.test(icon)) {
        warnings.push({
          msg: `成就「${node.label}」的图标「${icon}」不是合法物品 ID 格式`,
          nodeId
        });
      }
      nodes.push({
        frame: SHAPE_FRAME[node.shape] ?? 'task',
        id: nodeId,
        label: node.label,
        meta: nm,
        nid: nidOf.get(nodeId) ?? null,
        params: triggerParams(meta, nodeId),
        parent: parentEdge ? nidOf.get(parentEdge.from) : null,
        shape: node.shape,
        tab: tabNid
      });
    };
    const inTab = new Set();
    for (const tab of tabs) {
      for (const nodeId of tab.members) {
        inTab.add(nodeId);
        buildNode(nodeId, tab.rootNid);
      }
    }
    // 非法分量（多根/纯环/id 冲突）的节点也要进模型——否则前端面板无法选中并修复它们
    for (const node of flow.nodes) {
      if (!inTab.has(node.id)) {
        buildNode(node.id, null);
      }
    }

    // 枚举名冲突（nid 唯一但 Java 枚举常量可能同名：'1abc' 与 'a_1abc' 都映射 A_1ABC）
    const enumOwner = new Map();
    for (const [nodeId, nid] of nidOf) {
      if (!nid) {
        continue;
      }
      const en = enumName(nid);
      const prev = enumOwner.get(en);
      if (prev) {
        errors.push({
          msg: `节点「${prev}」与「${nodeId}」会生成同名 Java 枚举「${en}」，请改 id 区分`,
          nodeId
        });
      } else {
        enumOwner.set(en, nodeId);
      }
    }

    // 全局设置校验（先比对再规范化，产生告警而非静默改写）
    const rawNs = String(meta.namespace ?? '');
    meta.namespace = normNamespace(meta.namespace);
    if (rawNs && rawNs !== meta.namespace) {
      warnings.push({ msg: `命名空间「${rawNs}」已规范为「${meta.namespace}」` });
    }
    if (['bukkit', 'minecraft', 'mojang', 'paper', 'spigot'].includes(meta.namespace)) {
      errors.push({
        msg: `命名空间「${meta.namespace}」是保留命名空间，会与原版/服务端冲突，请换一个`
      });
    }
    const rawPlugin = String(meta.plugin ?? '');
    meta.plugin = normPluginName(meta.plugin);
    if (rawPlugin && rawPlugin !== meta.plugin) {
      warnings.push({
        msg: `插件名「${rawPlugin}」含非法字符，已规范为「${meta.plugin}」（仅限字母/数字/下划线）`
      });
    }
    if (meta.version && !/^[A-Za-z0-9._-]+$/.test(String(meta.version))) {
      warnings.push({
        msg: `版本号「${meta.version}」含非法字符，将作为 jar 文件名时建议只用字母/数字/._-`
      });
    }
    meta.packageName = normPackage(meta.packageName, meta.namespace);
    meta.command = normCommand(meta.command, meta.namespace);
    meta.packFormat = Number.isFinite(Number(meta.packFormat)) ? Number(meta.packFormat) : 94;

    // 孤儿元数据
    for (const key of Object.keys(meta.nodes)) {
      if (!nidOf.has(key)) {
        warnings.push({ msg: `frontmatter 中存在已删除节点「${key}」的元数据，导出时忽略` });
      }
    }
    // 成就名称可用性：空名在游戏进度界面显示为空白；同名成就玩家无法区分
    const seenLabels = new Map();
    for (const node of nodes) {
      const label = String(node.label ?? '').trim();
      if (!label) {
        warnings.push({ msg: `成就「${node.id}」没有名称，游戏里将显示为空白`, nodeId: node.id });
      } else if (seenLabels.has(label)) {
        warnings.push({
          msg: `成就「${seenLabels.get(label)}」与「${node.id}」同名（${label}），玩家将无法区分`,
          nodeId: node.id
        });
      } else {
        seenLabels.set(label, node.id);
      }
    }
    for (const tab of tabs) {
      const memberCount = tab.members.length - 1;
      if (tab.meta.completionist && memberCount === 0) {
        warnings.push({ msg: `成就栏「${tab.name}」开启了大满贯但栏内没有非根成就，跳过生成` });
      }
      const bg = String(tab.meta.background ?? '').trim();
      if (bg && !/^minecraft:textures\/[a-z0-9_/.-]+\.png$/.test(bg)) {
        warnings.push({
          msg: `成就栏「${tab.name}」的背景纹理「${bg}」不是 textures/…png 路径格式，游戏里可能显示为紫黑棋盘`
        });
      }
    }

    return {
      direction: flow.direction,
      edges,
      errors,
      meta,
      nodes,
      ok: errors.length === 0,
      skipped: flow.skipped,
      tabs,
      warnings
    };
  };

  const byIdLabel = (flow, id) => flow.nodes.find((n) => n.id === id)?.label ?? id;

  // ------------------------------------------------------------- 代码生成

  /** Java/JSON 字符串字面量（UTF-8 源码，中文直出）。 */
  const J = (s) => JSON.stringify(String(s));

  /** YAML 双引号字符串。 */
  const Y = (s) => `"${String(s).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

  const advJson = (meta, tab, node) => {
    const display = {
      announce_to_chat: false,
      description: { text: node.meta.desc || defaultDesc(node) },
      frame: node.frame,
      icon: { id: node.meta.icon || defaultIcon(node.frame) },
      show_toast: node.meta.toast !== false,
      title: { text: node.label }
    };
    if (node.meta.hidden) {
      display.hidden = true;
    }
    const out = {
      criteria: { grant: { trigger: 'minecraft:impossible' } },
      display,
      parent: `${meta.namespace}:${node.parent ?? tab.rootNid}`
    };
    const xp = Number(node.meta.xp) || 0;
    if (xp > 0) {
      out.rewards = { experience: xp };
    }
    return JSON.stringify(out, null, 2) + '\n';
  };

  const rootJson = (meta, tab) =>
    JSON.stringify(
      {
        criteria: { tick: { trigger: 'minecraft:tick' } },
        display: {
          announce_to_chat: false,
          background: tab.meta.background || 'minecraft:textures/block/deepslate_tiles.png',
          description: { color: 'gray', text: tab.meta.desc || `${meta.plugin} 提供的自定义成就` },
          icon: { id: tab.meta.icon || 'minecraft:nether_star' },
          show_toast: false,
          title: { bold: true, color: 'gold', text: tab.name }
        }
      },
      null,
      2
    ) + '\n';

  const completionistJson = (meta, tab, members) => {
    const ids = members.map((m) => m.nid);
    return (
      JSON.stringify(
        {
          criteria: Object.fromEntries(ids.map((id) => [id, { trigger: 'minecraft:impossible' }])),
          display: {
            announce_to_chat: false,
            description: { text: tab.meta.completionistDesc },
            frame: 'challenge',
            hidden: true,
            icon: { id: tab.meta.completionistIcon || 'minecraft:dragon_egg' },
            show_toast: true,
            title: { text: tab.meta.completionistName || '大满贯！' }
          },
          parent: `${meta.namespace}:${tab.rootNid}`,
          requirements: ids.map((id) => [id]),
          rewards: { experience: Number(tab.meta.completionistXp) || 0 }
        },
        null,
        2
      ) + '\n'
    );
  };

  const defaultIcon = (frame) =>
    frame === 'challenge'
      ? 'minecraft:dragon_egg'
      : frame === 'goal'
        ? 'minecraft:compass'
        : 'minecraft:book';

  const defaultDesc = (node) => {
    const p = node.params;
    const suffix = (v) => (v ? `（${v}）` : '');
    switch (node.meta.trigger) {
      case 'break_block': {
        return `累计挖掘 ${p.amount} 个方块${suffix(p.material)}`;
      }
      case 'place_block': {
        return `累计放置 ${p.amount} 个方块${suffix(p.material)}`;
      }
      case 'consume': {
        return `累计进食 ${p.amount} 次${suffix(p.item)}`;
      }
      case 'kill': {
        const what = !p.entity ? '生物' : p.entity === 'hostile' ? '敌对生物' : p.entity;
        return `累计击杀 ${p.amount} 只${what}`;
      }
      case 'fish': {
        return `累计钓上 ${p.amount} 条鱼`;
      }
      case 'reach_height': {
        return p.mode === 'below' ? `下潜至 Y=${p.y} 以下` : `抵达 Y=${p.y} 高空`;
      }
      case 'craft': {
        return `累计合成 ${p.amount} 个物品${suffix(p.item)}`;
      }
      case 'enchant': {
        return `累计附魔 ${p.amount} 次`;
      }
      case 'trade': {
        return `累计与村民交易 ${p.amount} 次`;
      }
      case 'tame': {
        return `累计驯服 ${p.amount} 只生物${suffix(p.entity)}`;
      }
      case 'breed': {
        return `累计繁殖 ${p.amount} 只动物${suffix(p.entity)}`;
      }
      case 'sleep': {
        return `累计入睡 ${p.amount} 次`;
      }
      case 'death': {
        return `累计死亡 ${p.amount} 次`;
      }
      case 'reach_level': {
        return `经验等级达到 ${p.level} 级`;
      }
      case 'pickup': {
        return `累计拾取 ${p.amount} 个物品${suffix(p.item)}`;
      }
      case 'chat_keyword': {
        return `在聊天中说出「${p.keyword}」`;
      }
      case 'advancement_done': {
        return `完成进度 ${p.key}`;
      }
      case 'playtime': {
        return `累计在线 ${p.minutes} 分钟`;
      }
      case 'statistic': {
        return `统计项 ${p.stat} 达到 ${p.amount}`;
      }
      case 'join': {
        return p.firstOnly === false ? '加入服务器' : '第一次加入服务器';
      }
      case 'shear': {
        return `累计剪羊毛 ${p.amount} 次${p.entity ? `（${p.entity}）` : ''}`;
      }
      case 'ride': {
        return p.entity ? `骑乘${p.entity}` : '骑乘任意生物';
      }
      case 'portal': {
        return '进入下界或末地传送门';
      }
      case 'damage_taken': {
        return `累计受伤 ${p.amount} 次`;
      }
      case 'projectile_hit': {
        return `弹射物累计命中生物 ${p.amount} 次`;
      }
      case 'glide': {
        return '开始滑翔';
      }
      case 'swim': {
        return '开始游泳';
      }
      case 'bucket_fill': {
        return `累计用桶装取液体 ${p.amount} 次`;
      }
      case 'xp_gain': {
        return `累计获得 ${p.amount} 点经验`;
      }
      default: {
        return '由管理员手动授予';
      }
    }
  };

  // ------------------------------------------------------------- Java 生成

  const javaBootstrap = (meta, cls) => `package ${meta.packageName};

import io.papermc.paper.datapack.DatapackRegistrar;
import io.papermc.paper.datapack.DiscoveredDatapack;
import io.papermc.paper.plugin.bootstrap.BootstrapContext;
import io.papermc.paper.plugin.bootstrap.PluginBootstrap;
import io.papermc.paper.plugin.lifecycle.event.types.LifecycleEvents;

import java.io.IOException;
import java.net.URISyntaxException;

/**
 * 引导类：在服务器加载数据包之前，把 jar 内 resources/datapack 目录
 * 注册为内置数据包。DATAPACK_DISCOVERY 只能由 BootstrapContext 注册。
 * 本文件由 Flow 编辑器「MC 进度设计器」插件生成。
 */
public final class ${cls}Bootstrap implements PluginBootstrap {

    @Override
    public void bootstrap(BootstrapContext context) {
        context.getLifecycleManager().registerEventHandler(LifecycleEvents.DATAPACK_DISCOVERY, event -> {
            try {
                DatapackRegistrar registrar = event.registrar();
                DiscoveredDatapack pack = registrar.discoverPack(
                        getClass().getResource("/datapack").toURI(), "provided");
                context.getLogger().info("数据包发现完成: "
                        + (pack != null ? pack.getName() : "null"));
            } catch (URISyntaxException | IOException e) {
                throw new IllegalStateException("注册内置数据包失败", e);
            }
        });
    }
}
`;

  const javaEnum = (a) => {
    const lines = [];
    for (const tab of a.tabs) {
      lines.push(
        `    ${enumName(tab.rootNid)}(${J(tab.rootNid)}, ${J(tab.rootNid)}, ${J(tab.name)}, false),`
      );
      for (const node of a.nodes) {
        if (node.tab === tab.rootNid && node.parent !== null) {
          lines.push(
            `    ${enumName(node.nid)}(${J(node.nid)}, ${J(tab.rootNid)}, ${J(node.label)}, true),`
          );
        }
      }
      if (tab.meta.completionist && tab.members.length > 1) {
        const cid = completionistId(a, tab);
        lines.push(
          `    ${enumName(cid)}(${J(cid)}, ${J(tab.rootNid)}, ${J(tab.meta.completionistName || '大满贯！')}, true),`
        );
      }
    }
    const body = lines.join('\n').replace(/,$/, ';');
    return `package ${a.meta.packageName};

import org.bukkit.NamespacedKey;

/**
 * 插件提供的全部成就定义，与 resources/datapack/data/${a.meta.namespace}/advancement/
 * 下的 JSON 一一对应。本文件由 Flow 编辑器「MC 进度设计器」插件生成。
 */
public enum Achievement {

${body}

    /** 数据包使用的命名空间，必须与 advancement JSON 的目录一致。 */
    public static final String NAMESPACE = ${J(a.meta.namespace)};

    private final String id;
    private final String tab;
    private final String displayName;
    /** 是否计入进度命令统计列表（根进度不计入）。 */
    private final boolean listed;

    Achievement(String id, String tab, String displayName, boolean listed) {
        this.id = id;
        this.tab = tab;
        this.displayName = displayName;
        this.listed = listed;
    }

    public String id() {
        return id;
    }

    public String tab() {
        return tab;
    }

    public String displayName() {
        return displayName;
    }

    public boolean listed() {
        return listed;
    }

    public NamespacedKey key() {
        return new NamespacedKey(NAMESPACE, id);
    }

    /** 按进度 id 查找对应枚举，找不到（不属于本插件）返回 null。 */
    public static Achievement byId(String id) {
        for (Achievement achievement : values()) {
            if (achievement.id.equals(id)) {
                return achievement;
            }
        }
        return null;
    }
}
`;
  };

  const completionistId = (a, tab) => {
    let cid = `${tab.rootNid}_completionist`;
    const takenEnum = new Set(
      [...a.nodes.map((n) => n.nid), ...a.tabs.map((t) => t.rootNid)].filter(Boolean).map(enumName)
    );
    while (
      a.nodes.some((n) => n.nid === cid) ||
      a.tabs.some((t) => t.rootNid === cid) ||
      takenEnum.has(enumName(cid))
    ) {
      cid = `${cid}_`;
    }
    return cid;
  };

  const javaService = (a) => `package ${a.meta.packageName};

import org.bukkit.Bukkit;
import org.bukkit.advancement.Advancement;
import org.bukkit.advancement.AdvancementProgress;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.Map;

/**
 * 封装对服务端 Advancement 对象的查询与授予。
 * 所有成就的条件均使用 minecraft:impossible 触发器，只能由此处调用
 * AdvancementProgress#awardCriteria(String) 授予。
 * 本文件由 Flow 编辑器「MC 进度设计器」插件生成。
 */
public final class AchievementService {

    private final Map<Achievement, Advancement> advancements = new EnumMap<>(Achievement.class);

    private Advancement advancement(Achievement achievement) {
        return advancements.computeIfAbsent(achievement, a -> Bukkit.getAdvancement(a.key()));
    }

    public boolean isDone(Player player, Achievement achievement) {
        Advancement advancement = advancement(achievement);
        return advancement != null && player.getAdvancementProgress(advancement).isDone();
    }

    /** 授予整项成就（补齐所有剩余条件）。 */
    public void award(Player player, Achievement achievement) {
        Advancement advancement = advancement(achievement);
        if (advancement == null) {
            return;
        }
        AdvancementProgress progress = player.getAdvancementProgress(advancement);
        if (progress.isDone()) {
            return;
        }
        for (String criterion : new ArrayList<>(progress.getRemainingCriteria())) {
            progress.awardCriteria(criterion);
        }
    }

    /** 只授予单个条件，用于汇总成就这类由多项条件汇总而成的成就。 */
    public void awardCriterion(Player player, Achievement achievement, String criterion) {
        Advancement advancement = advancement(achievement);
        if (advancement == null) {
            return;
        }
        AdvancementProgress progress = player.getAdvancementProgress(advancement);
        if (progress.getAwardedCriteria().contains(criterion)) {
            return;
        }
        progress.awardCriteria(criterion);
    }

    /** 服务端实际注册成功的成就数量，用于诊断内置数据包是否加载。 */
    public long registeredCount() {
        return Arrays.stream(Achievement.values()).filter(a -> advancement(a) != null).count();
    }

    public int totalCount() {
        return Achievement.values().length;
    }
}
`;

  const javaStore = (a) => `package ${a.meta.packageName};

import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.File;
import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Level;

/**
 * 以 YAML 持久化每个玩家的各项累计计数（键 = 成就 id）。
 * 计数先在内存中累加并标记脏位，由定时任务与 onDisable 统一落盘。
 * 本文件由 Flow 编辑器「MC 进度设计器」插件生成。
 */
public final class ProgressStore {

    private final JavaPlugin plugin;
    private final File file;
    private final Map<UUID, Map<String, Integer>> counts = new ConcurrentHashMap<>();
    private volatile boolean dirty;

    private ProgressStore(JavaPlugin plugin, File file) {
        this.plugin = plugin;
        this.file = file;
    }

    public static ProgressStore load(JavaPlugin plugin) {
        File file = new File(plugin.getDataFolder(), "progress.yml");
        ProgressStore store = new ProgressStore(plugin, file);
        if (!file.exists()) {
            return store;
        }
        YamlConfiguration yaml = YamlConfiguration.loadConfiguration(file);
        for (String key : yaml.getKeys(false)) {
            UUID uuid;
            try {
                uuid = UUID.fromString(key);
            } catch (IllegalArgumentException e) {
                plugin.getLogger().warning("progress.yml 中存在无法解析的键: " + key);
                continue;
            }
            Map<String, Integer> map = new ConcurrentHashMap<>();
            ConfigurationSection section = yaml.getConfigurationSection(key);
            if (section != null) {
                for (String counter : section.getKeys(false)) {
                    map.put(counter, yaml.getInt(key + "." + counter));
                }
            }
            store.counts.put(uuid, map);
        }
        return store;
    }

    public int get(UUID uuid, String key) {
        return counts.getOrDefault(uuid, Map.of()).getOrDefault(key, 0);
    }

    public int add(Player player, String key, int delta) {
        Map<String, Integer> map =
                counts.computeIfAbsent(player.getUniqueId(), u -> new ConcurrentHashMap<>());
        dirty = true;
        int next = map.getOrDefault(key, 0) + delta;
        map.put(key, next);
        return next;
    }

    public void saveIfDirty() {
        if (dirty) {
            save();
        }
    }

    public synchronized void save() {
        YamlConfiguration yaml = new YamlConfiguration();
        counts.forEach((uuid, map) ->
                map.forEach((key, value) -> yaml.set(uuid.toString() + "." + key, value)));
        try {
            yaml.save(file);
            dirty = false;
        } catch (IOException e) {
            plugin.getLogger().log(Level.WARNING, "保存 progress.yml 失败", e);
        }
    }
}
`;

  /** 监听器：只为用到的触发器生成事件分支。 */
  const javaListener = (a) => {
    const used = new Map(); // triggerId -> nodes[]
    for (const node of a.nodes) {
      if (node.parent === null) {
        continue; // 栏根是 tick 自动授予，无监听器逻辑
      }
      const tid = TRIGGERS.some((t) => t.id === node.meta.trigger) ? node.meta.trigger : 'manual';
      if (!used.has(tid)) {
        used.set(tid, []);
      }
      used.get(tid).push(node);
    }
    const has = (id) => used.has(id);
    const countedAny = [...used.keys()].some((id) => triggerById(id).counted);

    const imports = new Set([
      'net.kyori.adventure.key.Key',
      'net.kyori.adventure.text.Component',
      'org.bukkit.configuration.file.FileConfiguration',
      'org.bukkit.entity.Player',
      'org.bukkit.event.EventHandler',
      'org.bukkit.event.EventPriority',
      'org.bukkit.event.Listener',
      'org.bukkit.event.player.PlayerAdvancementDoneEvent',
      'org.bukkit.plugin.java.JavaPlugin'
    ]);
    if (has('join')) imports.add('org.bukkit.event.player.PlayerJoinEvent');
    if (has('break_block')) imports.add('org.bukkit.event.block.BlockBreakEvent');
    if (has('place_block')) imports.add('org.bukkit.event.block.BlockPlaceEvent');
    if (has('consume')) imports.add('org.bukkit.event.player.PlayerItemConsumeEvent');
    if (has('kill')) imports.add('org.bukkit.event.entity.EntityDeathEvent');
    if (has('fish')) imports.add('org.bukkit.event.player.PlayerFishEvent');
    if (has('reach_height')) imports.add('org.bukkit.event.player.PlayerMoveEvent');
    if (has('craft')) imports.add('org.bukkit.event.inventory.CraftItemEvent');
    if (has('enchant')) imports.add('org.bukkit.event.enchantment.EnchantItemEvent');
    if (has('trade')) imports.add('io.papermc.paper.event.player.PlayerTradeEvent');
    if (has('tame')) imports.add('org.bukkit.event.entity.EntityTameEvent');
    if (has('breed')) imports.add('org.bukkit.event.entity.EntityBreedEvent');
    if (has('sleep')) imports.add('io.papermc.paper.event.player.PlayerDeepSleepEvent');
    if (has('death')) imports.add('org.bukkit.event.entity.PlayerDeathEvent');
    if (has('pickup')) imports.add('org.bukkit.event.entity.EntityPickupItemEvent');
    if (has('chat_keyword')) imports.add('io.papermc.paper.event.player.AsyncChatEvent');
    if (has('chat_keyword'))
      imports.add('net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer');
    if (has('reach_height')) imports.add('org.bukkit.Location');
    if (has('shear')) imports.add('org.bukkit.event.player.PlayerShearEntityEvent');
    if (has('ride')) imports.add('org.bukkit.event.entity.EntityMountEvent');
    if (has('portal')) imports.add('org.bukkit.event.entity.EntityPortalEnterEvent');
    if (has('damage_taken')) imports.add('org.bukkit.event.entity.EntityDamageEvent');
    if (has('projectile_hit')) imports.add('org.bukkit.event.entity.ProjectileHitEvent');
    if (has('glide')) imports.add('org.bukkit.event.entity.EntityToggleGlideEvent');
    if (has('swim')) imports.add('org.bukkit.event.entity.EntityToggleSwimEvent');
    if (has('bucket_fill')) imports.add('org.bukkit.event.player.PlayerBucketFillEvent');
    if (has('xp_gain')) imports.add('org.bukkit.event.player.PlayerExpChangeEvent');
    if (
      used
        .get('kill')
        ?.some((n) => String(n.params.entity ?? '').toLowerCase() === 'hostile' || !n.params.entity)
    ) {
      imports.add('org.bukkit.entity.Enemy');
    }
    if (['break_block', 'place_block', 'consume', 'craft', 'pickup'].some((id) => has(id))) {
      imports.add('org.bukkit.Material');
    }
    if (['kill', 'tame', 'breed', 'shear', 'ride'].some((id) => has(id))) {
      imports.add('org.bukkit.entity.EntityType');
    }
    imports.add('org.bukkit.Sound');

    const blocks = [];

    // 每个成就一段事件逻辑
    const perNode = (tid, fn) =>
      (used.get(tid) ?? [])
        .map((n) => fn(n).replaceAll('§N§', `Achievement.${enumName(n.nid)}`))
        .join('\n');

    if (has('join')) {
      blocks.push(`    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();
${perNode(
  'join',
  () => `        if (!service.isDone(player, §N§)
                && (!flag(§N§, "firstOnly", true) || !player.hasPlayedBefore())) {
            service.award(player, §N§);
        }`
)}
    }`);
    }
    if (has('break_block')) {
      blocks.push(`    @EventHandler(ignoreCancelled = true)
    public void onBlockBreak(BlockBreakEvent event) {
        Player player = event.getPlayer();
        Material type = event.getBlock().getType();
${perNode(
  'break_block',
  (n) => `        if (!materialMiss(param(§N§, "material"), type)) {
            countUp(player, §N§, 1, ${Number(n.params.amount) || 200});
        }`
)}
    }`);
    }
    if (has('place_block')) {
      blocks.push(`    @EventHandler(ignoreCancelled = true)
    public void onBlockPlace(BlockPlaceEvent event) {
        Player player = event.getPlayer();
        Material type = event.getBlock().getType();
${perNode(
  'place_block',
  (n) => `        if (!materialMiss(param(§N§, "material"), type)) {
            countUp(player, §N§, 1, ${Number(n.params.amount) || 100});
        }`
)}
    }`);
    }
    if (has('consume')) {
      blocks.push(`    @EventHandler(ignoreCancelled = true)
    public void onConsume(PlayerItemConsumeEvent event) {
        Player player = event.getPlayer();
        Material type = event.getItem().getType();
${perNode(
  'consume',
  (n) => `        if (!materialMiss(param(§N§, "item"), type)) {
            countUp(player, §N§, 1, ${Number(n.params.amount) || 30});
        }`
)}
    }`);
    }
    if (has('kill')) {
      blocks.push(`    @EventHandler
    public void onEntityDeath(EntityDeathEvent event) {
        Player killer = event.getEntity().getKiller();
        if (killer == null) {
            return;
        }
${perNode(
  'kill',
  (n) => `        if (!entityMiss(param(§N§, "entity"), event.getEntityType(), event.getEntity())) {
            countUp(killer, §N§, 1, ${Number(n.params.amount) || 30});
        }`
)}
    }`);
    }
    if (has('fish')) {
      blocks.push(`    @EventHandler(ignoreCancelled = true)
    public void onFish(PlayerFishEvent event) {
        if (event.getState() != PlayerFishEvent.State.CAUGHT_FISH) {
            return;
        }
        Player player = event.getPlayer();
${perNode('fish', (n) => `        countUp(player, §N§, 1, ${Number(n.params.amount) || 10});`)}
    }`);
    }
    if (has('reach_height')) {
      blocks.push(`    @EventHandler(ignoreCancelled = true)
    public void onMove(PlayerMoveEvent event) {
        // 高频事件：每玩家每 5 tick 才判定一次（一次浮点比较）
        Player player = event.getPlayer();
        if (player.getTicksLived() % 5 != 0) {
            return;
        }
        Location to = event.getTo();
        if (to == null) {
            return;
        }
        double y = to.getY();
${perNode(
  'reach_height',
  (n) => `        if (!service.isDone(player, §N§)) {
            double target = number(§N§, "y", ${Number(n.params.y) || 300});
            boolean above = !"below".equalsIgnoreCase(param(§N§, "mode"));
            if (above ? y >= target : y <= target) {
                service.award(player, §N§);
            }
        }`
)}
    }`);
    }
    if (has('craft')) {
      blocks.push(`    @EventHandler(ignoreCancelled = true)
    public void onCraft(CraftItemEvent event) {
        if (!(event.getWhoClicked() instanceof Player player)) {
            return;
        }
        Material type = event.getRecipe().getResult().getType();
        int delta = event.getCurrentItem() == null ? 1 : Math.max(1, event.getCurrentItem().getAmount());
${perNode(
  'craft',
  (n) => `        if (!materialMiss(param(§N§, "item"), type)) {
            countUp(player, §N§, delta, ${Number(n.params.amount) || 10});
        }`
)}
    }`);
    }
    if (has('enchant')) {
      blocks.push(`    @EventHandler(ignoreCancelled = true)
    public void onEnchant(EnchantItemEvent event) {
        Player player = event.getEnchanter();
${perNode('enchant', (n) => `        countUp(player, §N§, 1, ${Number(n.params.amount) || 1});`)}
    }`);
    }
    if (has('trade')) {
      blocks.push(`    @EventHandler
    public void onTrade(PlayerTradeEvent event) {
        Player player = event.getPlayer();
${perNode('trade', (n) => `        countUp(player, §N§, 1, ${Number(n.params.amount) || 10});`)}
    }`);
    }
    if (has('tame')) {
      blocks.push(`    @EventHandler
    public void onTame(EntityTameEvent event) {
        if (!(event.getOwner() instanceof Player player)) {
            return;
        }
${perNode(
  'tame',
  (n) => `        if (!entityMiss(param(§N§, "entity"), event.getEntityType(), event.getEntity())) {
            countUp(player, §N§, 1, ${Number(n.params.amount) || 1});
        }`
)}
    }`);
    }
    if (has('breed')) {
      blocks.push(`    @EventHandler
    public void onBreed(EntityBreedEvent event) {
        if (!(event.getBreeder() instanceof Player player)) {
            return;
        }
${perNode(
  'breed',
  (n) => `        if (!entityMiss(param(§N§, "entity"), event.getEntityType(), event.getEntity())) {
            countUp(player, §N§, 1, ${Number(n.params.amount) || 5});
        }`
)}
    }`);
    }
    if (has('sleep')) {
      blocks.push(`    @EventHandler(ignoreCancelled = true)
    public void onSleep(PlayerDeepSleepEvent event) {
        Player player = event.getPlayer();
${perNode('sleep', (n) => `        countUp(player, §N§, 1, ${Number(n.params.amount) || 1});`)}
    }`);
    }
    if (has('death')) {
      blocks.push(`    @EventHandler
    public void onDeath(PlayerDeathEvent event) {
        Player player = event.getEntity();
${perNode('death', (n) => `        countUp(player, §N§, 1, ${Number(n.params.amount) || 1});`)}
    }`);
    }
    if (has('pickup')) {
      blocks.push(`    @EventHandler(ignoreCancelled = true)
    public void onPickup(EntityPickupItemEvent event) {
        if (!(event.getEntity() instanceof Player player)) {
            return;
        }
        Material type = event.getItem().getItemStack().getType();
        int delta = Math.max(1, event.getItem().getItemStack().getAmount());
${perNode(
  'pickup',
  (n) => `        if (!materialMiss(param(§N§, "item"), type)) {
            countUp(player, §N§, delta, ${Number(n.params.amount) || 64});
        }`
)}
    }`);
    }
    if (has('chat_keyword')) {
      blocks.push(`    @EventHandler
    public void onChat(AsyncChatEvent event) {
        Player player = event.getPlayer();
        String message = PlainTextComponentSerializer.plainText().serialize(event.message());
${perNode(
  'chat_keyword',
  () => `        {
            String keyword = param(§N§, "keyword");
            if (!keyword.isEmpty()
                    && message.toLowerCase(java.util.Locale.ROOT).contains(keyword.toLowerCase(java.util.Locale.ROOT))
                    && !service.isDone(player, §N§)) {
                service.award(player, §N§);
            }
        }`
)}
    }`);
    }
    if (has('shear')) {
      blocks.push(`    @EventHandler(ignoreCancelled = true)
    public void onShear(PlayerShearEntityEvent event) {
        Player player = event.getPlayer();
${perNode(
  'shear',
  (
    n
  ) => `        if (!entityMiss(param(§N§, "entity"), event.getEntity().getType(), event.getEntity())) {
            countUp(player, §N§, 1, ${Number(n.params.amount) || 10});
        }`
)}
    }`);
    }
    if (has('ride')) {
      blocks.push(`    @EventHandler(ignoreCancelled = true)
    public void onMount(EntityMountEvent event) {
        if (!(event.getEntity() instanceof Player player)) {
            return;
        }
${perNode(
  'ride',
  () => `        if (!entityMiss(param(§N§, "entity"), event.getMount().getType(), event.getMount())
                && !service.isDone(player, §N§)) {
            service.award(player, §N§);
        }`
)}
    }`);
    }
    if (has('portal')) {
      blocks.push(`    @EventHandler
    public void onPortalEnter(EntityPortalEnterEvent event) {
        if (!(event.getEntity() instanceof Player player)) {
            return;
        }
${perNode(
  'portal',
  () => `        if (!service.isDone(player, §N§)) {
            service.award(player, §N§);
        }`
)}
    }`);
    }
    if (has('damage_taken')) {
      blocks.push(`    @EventHandler(ignoreCancelled = true)
    public void onDamage(EntityDamageEvent event) {
        if (!(event.getEntity() instanceof Player player)) {
            return;
        }
${perNode(
  'damage_taken',
  (n) => `        countUp(player, §N§, 1, ${Number(n.params.amount) || 100});`
)}
    }`);
    }
    if (has('projectile_hit')) {
      blocks.push(`    @EventHandler(ignoreCancelled = true)
    public void onProjectileHit(ProjectileHitEvent event) {
        if (event.getHitEntity() == null) {
            return;
        }
        if (!(event.getEntity().getShooter() instanceof Player player)) {
            return;
        }
${perNode(
  'projectile_hit',
  (n) => `        countUp(player, §N§, 1, ${Number(n.params.amount) || 30});`
)}
    }`);
    }
    if (has('glide')) {
      blocks.push(`    @EventHandler(ignoreCancelled = true)
    public void onGlide(EntityToggleGlideEvent event) {
        if (!event.isGliding() || !(event.getEntity() instanceof Player player)) {
            return;
        }
${perNode(
  'glide',
  () => `        if (!service.isDone(player, §N§)) {
            service.award(player, §N§);
        }`
)}
    }`);
    }
    if (has('swim')) {
      blocks.push(`    @EventHandler(ignoreCancelled = true)
    public void onSwim(EntityToggleSwimEvent event) {
        if (!event.isSwimming() || !(event.getEntity() instanceof Player player)) {
            return;
        }
${perNode(
  'swim',
  () => `        if (!service.isDone(player, §N§)) {
            service.award(player, §N§);
        }`
)}
    }`);
    }
    if (has('bucket_fill')) {
      blocks.push(`    @EventHandler(ignoreCancelled = true)
    public void onBucketFill(PlayerBucketFillEvent event) {
        Player player = event.getPlayer();
${perNode(
  'bucket_fill',
  (n) => `        countUp(player, §N§, 1, ${Number(n.params.amount) || 10});`
)}
    }`);
    }
    if (has('xp_gain')) {
      blocks.push(`    @EventHandler(ignoreCancelled = true)
    public void onExpChange(PlayerExpChangeEvent event) {
        int gained = event.getAmount();
        if (gained <= 0) {
            return;
        }
        Player player = event.getPlayer();
${perNode(
  'xp_gain',
  (n) => `        countUp(player, §N§, gained, ${Number(n.params.amount) || 1000});`
)}
    }`);
    }

    // 汇总成就补条件 + 播报/音效 + advancement_done 触发
    const compEntries = a.tabs
      .filter((t) => t.meta.completionist && t.members.length > 1)
      .map(
        (t) =>
          `            map.put(${J(t.rootNid)}, Achievement.${enumName(completionistId(a, t))});`
      )
      .join('\n');
    const noAnnounce = a.nodes
      .filter((n) => n.meta.announce === false)
      .map((n) => J(n.nid))
      .join(', ');
    const advDoneChecks = perNode(
      'advancement_done',
      () => `        if (!service.isDone(player, §N§)
                && keyString.equalsIgnoreCase(param(§N§, "key"))) {
            service.award(player, §N§);
        }`
    );

    blocks.push(`    @EventHandler(priority = EventPriority.MONITOR)
    public void onAdvancementDone(PlayerAdvancementDoneEvent event) {
        Key key = event.getAdvancement().getKey();
        Player player = event.getPlayer();
        String keyString = key.namespace() + ":" + key.value();
        // 「完成其他进度」触发先判定——目标进度可以属于任意命名空间（含本插件）
${advDoneChecks || '        // 无「完成其他进度」类成就'}
        if (Achievement.NAMESPACE.equals(key.namespace())) {
            Achievement achievement = Achievement.byId(key.value());
            if (achievement != null && achievement.listed()) {
                Achievement comp = COMPLETIONIST.get(achievement.tab());
                if (comp != null && comp != achievement) {
                    service.awardCriterion(player, comp, achievement.id());
                }
            }
            if (achievement == null || !achievement.listed()) {
                return;
            }
            if (!NO_ANNOUNCE.contains(achievement.id())) {
                String format = config.getString("announce-format", ${J(a.meta.announceFormat || '[成就] %player% 达成了 [%name%]')});
                if (format != null && !format.isEmpty()) {
                    event.message(Component.text(format
                            .replace("%player%", player.getName())
                            .replace("%name%", achievement.displayName())));
                }
            }
            if (config.getBoolean("sound", true)) {
                player.playSound(player.getLocation(), Sound.ENTITY_PLAYER_LEVELUP, 1.0f, 1.0f);
            }
        }
    }`);

    const helpers = [];
    if (countedAny || has('reach_height')) {
      helpers.push(`    private int amount(Achievement achievement, String key, int def) {
        return config.getInt("thresholds." + achievement.id() + "." + key, def);
    }

    private double number(Achievement achievement, String key, double def) {
        return config.getDouble("thresholds." + achievement.id() + "." + key, def);
    }

    private String param(Achievement achievement, String key) {
        return config.getString("thresholds." + achievement.id() + "." + key, "");
    }

    private boolean flag(Achievement achievement, String key, boolean def) {
        return config.getBoolean("thresholds." + achievement.id() + "." + key, def);
    }`);
    } else {
      helpers.push(`    private String param(Achievement achievement, String key) {
        return config.getString("thresholds." + achievement.id() + "." + key, "");
    }

    private boolean flag(Achievement achievement, String key, boolean def) {
        return config.getBoolean("thresholds." + achievement.id() + "." + key, def);
    }`);
    }
    if (countedAny) {
      helpers.push(`    private void countUp(Player player, Achievement achievement, int delta, int def) {
        if (service.isDone(player, achievement)) {
            return;
        }
        if (store.add(player, achievement.id(), delta) >= amount(achievement, "amount", def)) {
            service.award(player, achievement);
        }
    }`);
    }
    if (imports.has('org.bukkit.Material')) {
      helpers.push(`    /** 期望材质为空或无法识别时不做过滤（无法识别会在 onEnable 告警）。 */
    private boolean materialMiss(String want, Material type) {
        if (want == null || want.isEmpty()) {
            return false;
        }
        Material material = Material.matchMaterial(want);
        return material != null && type != material;
    }`);
    }
    if (imports.has('org.bukkit.entity.EntityType')) {
      helpers.push(`    /** entity 期望：空=任意非玩家；hostile=敌对生物；其余按 EntityType 名匹配。 */
    private boolean entityMiss(String want, EntityType type, org.bukkit.entity.Entity entity) {
        if (want == null || want.isEmpty()) {
            return entity instanceof Player;
        }
        if ("hostile".equalsIgnoreCase(want)) {
            return !(entity instanceof ${imports.has('org.bukkit.entity.Enemy') ? 'Enemy' : 'org.bukkit.entity.Enemy'});
        }
        EntityType expected;
        try {
            expected = EntityType.valueOf(
                    want.replace("minecraft:", "").toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return false;
        }
        return type != expected;
    }`);
    }

    const compMap = compEntries
      ? `    private static final java.util.Map<String, Achievement> COMPLETIONIST = completionistMap();

    private static java.util.Map<String, Achievement> completionistMap() {
        java.util.Map<String, Achievement> map = new java.util.HashMap<>();
${compEntries}
        return java.util.Collections.unmodifiableMap(map);
    }

`
      : '    private static final java.util.Map<String, Achievement> COMPLETIONIST = java.util.Map.of();\n\n';

    return `package ${a.meta.packageName};

${[...imports]
  .sort()
  .map((i) => `import ${i};`)
  .join('\n')}

/**
 * 监听游戏事件、累计进度计数，并在达标时通过 AchievementService 授予成就。
 * 仅包含本图表实际用到的触发方式分支。
 * 本文件由 Flow 编辑器「MC 进度设计器」插件生成。
 */
public final class AchievementListener implements Listener {

${compMap}    private static final java.util.Set<String> NO_ANNOUNCE = java.util.Set.of(${noAnnounce});

    private final AchievementService service;
    private final ProgressStore store;
    private final FileConfiguration config;

    public AchievementListener(JavaPlugin plugin, AchievementService service, ProgressStore store) {
        this.service = service;
        this.store = store;
        this.config = plugin.getConfig();
    }

${helpers.join('\n\n')}

${blocks.join('\n\n')}
}
`;
  };

  const javaCommand = (a, cls) => {
    const lines = [];
    for (const tab of a.tabs) {
      const members = a.nodes.filter((n) => n.tab === tab.rootNid && n.parent !== null);
      lines.push(
        `        player.sendMessage(Component.text(${J(`【${tab.name}】`)}, NamedTextColor.YELLOW));`
      );
      for (const node of members) {
        const spec = triggerById(node.meta.trigger);
        const counter = spec.counted
          ? `store.get(player.getUniqueId(), ${J(node.nid)}) + "/" + config.getInt("thresholds.${node.nid}.amount", ${Number(node.params.amount) || 1})`
          : 'null';
        lines.push(`        sendLine(player, Achievement.${enumName(node.nid)}, ${counter});`);
      }
      if (tab.meta.completionist && tab.members.length > 1) {
        lines.push(
          `        sendLine(player, Achievement.${enumName(completionistId(a, tab))}, null);`
        );
      }
    }
    return `package ${a.meta.packageName};

import io.papermc.paper.command.brigadier.BasicCommand;
import io.papermc.paper.command.brigadier.CommandSourceStack;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import org.bukkit.Bukkit;
import org.bukkit.command.CommandSender;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;
import org.jetbrains.annotations.NotNull;

import java.util.Collection;
import java.util.List;

/**
 * /${a.meta.command}：查看成就进度；/${a.meta.command} grant <玩家> <成就id>：手动授予。
 * 本文件由 Flow 编辑器「MC 进度设计器」插件生成。
 */
public final class ${cls}Command implements BasicCommand {

    private final AchievementService service;
    private final ProgressStore store;
    private final FileConfiguration config;

    public ${cls}Command(JavaPlugin plugin, AchievementService service, ProgressStore store) {
        this.service = service;
        this.store = store;
        this.config = plugin.getConfig();
    }

    @Override
    public void execute(@NotNull CommandSourceStack stack, @NotNull String[] args) {
        CommandSender sender = stack.getSender();
        if (args.length >= 3 && "grant".equalsIgnoreCase(args[0])) {
            if (!sender.hasPermission("${a.meta.namespace}.grant")) {
                sender.sendMessage(Component.text("你没有授予成就的权限。", NamedTextColor.RED));
                return;
            }
            Player target = Bukkit.getPlayerExact(args[1]);
            Achievement achievement = Achievement.byId(args[2]);
            if (target == null || achievement == null || !achievement.listed()) {
                sender.sendMessage(Component.text("用法: /${a.meta.command} grant <在线玩家> <成就id>", NamedTextColor.RED));
                return;
            }
            service.award(target, achievement);
            sender.sendMessage(Component.text(
                    "已授予「" + achievement.displayName() + "」给 " + target.getName(), NamedTextColor.GREEN));
            return;
        }
        if (!(sender instanceof Player player)) {
            sender.sendMessage(Component.text("该命令仅玩家可用（grant 子命令除外）。", NamedTextColor.RED));
            return;
        }
        player.sendMessage(Component.text("—— ${a.meta.plugin} 成就进度 ——", NamedTextColor.GOLD, TextDecoration.BOLD));
${lines.join('\n')}
    }

    @Override
    public @NotNull Collection<String> suggest(@NotNull CommandSourceStack stack, @NotNull String[] args) {
        if (args.length == 1) {
            return List.of("grant");
        }
        if (args.length == 2 && "grant".equalsIgnoreCase(args[0])) {
            return Bukkit.getOnlinePlayers().stream().map(Player::getName).toList();
        }
        if (args.length == 3 && "grant".equalsIgnoreCase(args[0])) {
            return java.util.Arrays.stream(Achievement.values())
                    .filter(Achievement::listed)
                    .map(Achievement::id)
                    .toList();
        }
        return List.of();
    }

    private void sendLine(Player player, Achievement achievement, String counter) {
        boolean done = service.isDone(player, achievement);
        Component line = Component.text(done ? " ✔ " : " □ ", done ? NamedTextColor.GREEN : NamedTextColor.GRAY)
                .append(Component.text(achievement.displayName(), done ? NamedTextColor.AQUA : NamedTextColor.WHITE));
        if (counter != null && !done) {
            line = line.append(Component.text("  (" + counter + ")", NamedTextColor.GRAY));
        }
        player.sendMessage(line);
    }
}
`;
  };

  const javaMain = (a, cls) => {
    const statNodes = a.nodes.filter((n) => ['playtime', 'statistic'].includes(n.meta.trigger));
    const statBlock =
      statNodes.length > 0
        ? `
        statWatches = new java.util.ArrayList<>();
${statNodes
  .map((n) =>
    n.meta.trigger === 'playtime'
      ? `        addPlaytimeWatch(statWatches, Achievement.${enumName(n.nid)}, ${Number(n.params.minutes) || 60});`
      : `        addStatWatch(statWatches, Achievement.${enumName(n.nid)}, ${J(String(n.params.stat ?? 'walk_one_cm'))}, ${Number(n.params.amount) || 1});`
  )
  .join('\n')}
        getServer().getScheduler().runTaskTimer(this, this::pollStatistics, 400L, 400L);
`
        : '';
    const statMembers =
      statNodes.length > 0
        ? `
    private record StatWatch(
            Achievement achievement,
            org.bukkit.Statistic statistic,
            org.bukkit.Material material,
            org.bukkit.entity.EntityType entity,
            long amount) {}

    private java.util.List<StatWatch> statWatches = new java.util.ArrayList<>();

    private void addPlaytimeWatch(java.util.List<StatWatch> watches, Achievement achievement, int defMinutes) {
        int minutes = getConfig().getInt("thresholds." + achievement.id() + ".minutes", defMinutes);
        watches.add(new StatWatch(achievement, org.bukkit.Statistic.PLAY_ONE_MINUTE, null, null, minutes * 20L * 60L));
    }

    private void addStatWatch(java.util.List<StatWatch> watches, Achievement achievement, String defStat, int defAmount) {
        String name = getConfig().getString("thresholds." + achievement.id() + ".stat", defStat);
        String normalized = name == null ? defStat : name.trim().toLowerCase(java.util.Locale.ROOT);
        org.bukkit.NamespacedKey key = org.bukkit.NamespacedKey.fromString(
                normalized.contains(":") ? normalized : "minecraft:" + normalized);
        org.bukkit.Statistic statistic = key == null ? null : org.bukkit.Registry.STATISTIC.get(key);
        if (statistic == null) {
            getLogger().warning("成就 " + achievement.id() + " 的统计项无法识别: " + name);
            return;
        }
        String target = getConfig().getString("thresholds." + achievement.id() + ".target", "");
        org.bukkit.Material material = target == null || target.isEmpty() ? null : org.bukkit.Material.matchMaterial(target);
        org.bukkit.entity.EntityType entity = null;
        if (material == null && target != null && !target.isEmpty()) {
            try {
                entity = org.bukkit.entity.EntityType.valueOf(
                        target.replace("minecraft:", "").toUpperCase(java.util.Locale.ROOT));
            } catch (IllegalArgumentException e) {
                getLogger().warning("成就 " + achievement.id() + " 的统计对象无法识别: " + target);
            }
        }
        int amount = getConfig().getInt("thresholds." + achievement.id() + ".amount", defAmount);
        watches.add(new StatWatch(achievement, statistic, material, entity, amount));
    }

    private void pollStatistics() {
        for (org.bukkit.entity.Player player : getServer().getOnlinePlayers()) {
            for (StatWatch watch : statWatches) {
                if (achievementService.isDone(player, watch.achievement())) {
                    continue;
                }
                long value;
                try {
                    if (watch.material() != null) {
                        value = player.getStatistic(watch.statistic(), watch.material());
                    } else if (watch.entity() != null) {
                        value = player.getStatistic(watch.statistic(), watch.entity());
                    } else {
                        value = player.getStatistic(watch.statistic());
                    }
                } catch (IllegalArgumentException e) {
                    continue; // 统计项与对象类型不匹配（如无对象统计传了对象）
                }
                if (value >= watch.amount()) {
                    achievementService.award(player, watch.achievement());
                }
            }
        }
    }
`
        : '';
    return `package ${a.meta.packageName};

import io.papermc.paper.plugin.lifecycle.event.types.LifecycleEvents;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.List;

/**
 * 插件主类。成就 JSON 定义位于 resources/datapack/，由 ${cls}Bootstrap
 * 在启动早期注册为内置数据包，从而在原版进度界面中显示为独立标签页。
 * 本文件由 Flow 编辑器「MC 进度设计器」插件生成。
 */
public final class ${cls}Plugin extends JavaPlugin {
${statMembers}
    private ProgressStore progressStore;
    private AchievementService achievementService;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        this.progressStore = ProgressStore.load(this);
        this.achievementService = new AchievementService();

        getServer().getPluginManager().registerEvents(
                new AchievementListener(this, achievementService, progressStore), this);

        // Paper 插件命令：在 COMMANDS 生命周期事件中注册（支持 /reload 重新注册）
        getLifecycleManager().registerEventHandler(LifecycleEvents.COMMANDS, event -> event.registrar().register(
                ${J(a.meta.command)},
                "查看自定义成就的达成进度。",
                List.of(),
                new ${cls}Command(this, achievementService, progressStore)));

        long intervalSeconds = getConfig().getLong("autosave-interval-seconds", 300);
        getServer().getScheduler().runTaskTimer(this, progressStore::saveIfDirty,
                intervalSeconds * 20L, intervalSeconds * 20L);
${statBlock}
        long registered = achievementService.registeredCount();
        if (registered == achievementService.totalCount()) {
            getLogger().info("内置数据包加载成功，" + registered + " 个自定义成就已就绪。");
        } else {
            getLogger().warning("仅注册了 " + registered + "/" + achievementService.totalCount()
                    + " 个成就，内置数据包可能未正确加载！请检查控制台中的数据包错误。");
        }
    }

    @Override
    public void onDisable() {
        if (progressStore != null) {
            progressStore.save();
        }
    }
}
`;
  };

  // --------------------------------------------------------- 其余资源文件

  const pomXml = (a) => `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>${a.meta.packageName}</groupId>
    <artifactId>${a.meta.namespace}</artifactId>
    <version>${a.meta.version || '1.0.0'}</version>
    <packaging>jar</packaging>

    <name>${a.meta.plugin}</name>
    <description>由 Flow 编辑器「MC 进度设计器」插件生成的自定义成就插件（Paper 1.21.11）。</description>

    <properties>
        <java.version>21</java.version>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
        <maven.compiler.release>21</maven.compiler.release>
    </properties>

    <repositories>
        <repository>
            <id>papermc</id>
            <url>https://repo.papermc.io/repository/maven-public/</url>
        </repository>
    </repositories>

    <dependencies>
        <dependency>
            <groupId>io.papermc.paper</groupId>
            <artifactId>paper-api</artifactId>
            <version>1.21.11-R0.1-SNAPSHOT</version>
            <scope>provided</scope>
        </dependency>
    </dependencies>

    <build>
        <finalName>\${project.name}-\${project.version}</finalName>
        <resources>
            <resource>
                <directory>src/main/resources</directory>
                <filtering>true</filtering>
            </resource>
        </resources>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <version>3.13.0</version>
            </plugin>
        </plugins>
    </build>
</project>
`;

  const paperPluginYml = (a, cls) => `name: ${a.meta.plugin}
version: '\${project.version}'
main: ${a.meta.packageName}.${cls}Plugin
bootstrapper: ${a.meta.packageName}.${cls}Bootstrap
api-version: '1.21'
description: 通过内置数据包在原版进度界面中添加自定义成就标签页（Flow 编辑器生成）。
authors: [${a.meta.author.replaceAll(/[[\],]/g, '') || 'Zurker'}]
`;

  const configYml = (a) => {
    const lines = [
      '# 成就触发参数。修改后需重启或 /reload 生效。',
      '# 每个成就的键 = 成就 id；amount=累计数量，material/item/entity=匹配对象（留空=任意）。',
      'thresholds:'
    ];
    for (const node of a.nodes) {
      if (node.parent === null) {
        continue;
      }
      const spec = triggerById(node.meta.trigger);
      if (spec.params.length === 0) {
        continue;
      }
      lines.push(`  ${node.nid}:`);
      for (const p of spec.params) {
        const v = node.params[p.key];
        if (p.type === 'bool') {
          lines.push(`    ${p.key}: ${v ? 'true' : 'false'}`);
        } else if (p.type === 'int') {
          lines.push(`    ${p.key}: ${Number(v) || p.def}`);
        } else {
          lines.push(`    ${p.key}: ${Y(v ?? '')}`);
        }
      }
    }
    lines.push('');
    lines.push('# 进度计数自动保存间隔（秒）');
    lines.push(`autosave-interval-seconds: ${Number(a.meta.autosaveSeconds) || 300}`);
    lines.push('');
    lines.push('# 达成播报格式（%player%=玩家名，%name%=成就名；留空=不播报）');
    lines.push(`announce-format: ${Y(a.meta.announceFormat ?? '')}`);
    lines.push('');
    lines.push('# 达成时播放升级音效');
    lines.push(`sound: ${a.meta.sound === false ? 'false' : 'true'}`);
    return lines.join('\n') + '\n';
  };

  const packMcmeta = (a) =>
    JSON.stringify(
      {
        pack: {
          description: `${a.meta.plugin} 自定义成就数据包`,
          max_format: a.meta.packFormat,
          min_format: a.meta.packFormat
        }
      },
      null,
      2
    ) + '\n';

  const readmeMd = (a) => {
    const rows = [];
    for (const tab of a.tabs) {
      for (const node of a.nodes) {
        if (node.tab !== tab.rootNid || node.parent === null) {
          continue;
        }
        const cell = (s) => String(s).replaceAll('|', '／');
        rows.push(
          `| ${cell(tab.name)} | ${cell(node.label)} | ${cell(node.meta.desc || defaultDesc(node))} | ${FRAME_NAME[node.frame]} |`
        );
      }
    }
    return `# ${a.meta.plugin}

由 **Flow 编辑器「MC 进度设计器」插件**生成的 Paper 成就插件（Java 21 + Paper 1.21.11）。
通过插件 jar 内置的数据包，在原版进度界面（Esc → 进度）中添加 ${a.tabs.length} 个独立标签页：
${a.tabs.map((t) => `「${t.name}」`).join('、')}。

## 构建

\`\`\`bash
mvn package
# 产物: target/${a.meta.plugin}-1.0.0.jar
\`\`\`

要求 JDK 21+。把产物 jar 放入服务器的 \`plugins/\` 目录并重启即可；
数据包由 bootstrapper 自动注册（\`/datapack list enabled\` 应显示
\`${a.meta.plugin}/provided (plugin)\`）。

## 成就列表

| 成就栏 | 成就 | 达成条件 | 框架 |
| --- | --- | --- | --- |
${rows.join('\n')}

阈值可在 \`plugins/${a.meta.plugin}/config.yml\` 中调整（重启或 /reload 生效）。

## 命令

- \`/${a.meta.command}\`：查看个人成就进度与各项计数。
- \`/${a.meta.command} grant <玩家> <成就id>\`：手动授予（需要 \`${a.meta.namespace}.grant\` 权限，默认 OP）。
`;
  };

  // ------------------------------------------------------------- 文件清单

  /** 生成全部工程文件：[{ path, text }]。 */
  const generateFiles = (a) => {
    const cls = normPluginName(a.meta.plugin);
    const pkgPath = a.meta.packageName.replaceAll('.', '/');
    const files = [
      { path: 'pom.xml', text: pomXml(a) },
      { path: 'README.md', text: readmeMd(a) },
      { path: 'src/main/resources/paper-plugin.yml', text: paperPluginYml(a, cls) },
      { path: 'src/main/resources/config.yml', text: configYml(a) },
      { path: 'src/main/resources/datapack/pack.mcmeta', text: packMcmeta(a) },
      // 溯源元数据：逆向导入（打开 zip）时完整还原触发器/参数/栏设置。
      // 位于数据包根目录，Minecraft 忽略未知文件，不影响加载。
      {
        path: 'src/main/resources/datapack/flow-editor.json',
        text: JSON.stringify({ mcadv: a.meta }, null, 2) + '\n'
      },
      { path: `src/main/java/${pkgPath}/${cls}Plugin.java`, text: javaMain(a, cls) },
      { path: `src/main/java/${pkgPath}/${cls}Bootstrap.java`, text: javaBootstrap(a.meta, cls) },
      { path: `src/main/java/${pkgPath}/Achievement.java`, text: javaEnum(a) },
      { path: `src/main/java/${pkgPath}/AchievementService.java`, text: javaService(a) },
      { path: `src/main/java/${pkgPath}/AchievementListener.java`, text: javaListener(a) },
      { path: `src/main/java/${pkgPath}/ProgressStore.java`, text: javaStore(a) },
      { path: `src/main/java/${pkgPath}/${cls}Command.java`, text: javaCommand(a, cls) }
    ];
    for (const tab of a.tabs) {
      files.push({
        path: `src/main/resources/datapack/data/${a.meta.namespace}/advancement/${tab.rootNid}.json`,
        text: rootJson(a.meta, tab)
      });
      const members = a.nodes.filter((n) => n.tab === tab.rootNid && n.parent !== null);
      for (const node of members) {
        files.push({
          path: `src/main/resources/datapack/data/${a.meta.namespace}/advancement/${node.nid}.json`,
          text: advJson(a.meta, tab, node)
        });
      }
      if (tab.meta.completionist && members.length > 0) {
        files.push({
          path: `src/main/resources/datapack/data/${a.meta.namespace}/advancement/${completionistId(a, tab)}.json`,
          text: completionistJson(a.meta, tab, members)
        });
      }
    }
    return files;
  };

  // ------------------------------------------------------------- zip 打包

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xed_b8_83_20 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  const crc32 = (bytes) => {
    let crc = 0xff_ff_ff_ff;
    for (const byte of bytes) {
      crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xff_ff_ff_ff) >>> 0;
  };

  /**
   * 零依赖 zip 生成（store 模式不压缩；Java/JSON 文本压缩无意义）。
   * 固定 DOS 时间戳保证同输入逐字节一致。
   */
  const buildZip = (files) => {
    const encoder = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    // 2026-01-01 00:00:00 的 DOS 时间
    const dosTime = 0;
    const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;

    for (const file of files) {
      const nameBytes = encoder.encode(file.path);
      const data = encoder.encode(file.text);
      const crc = crc32(data);
      const header = new DataView(new ArrayBuffer(30));
      header.setUint32(0, 0x04_03_4b_50, true);
      header.setUint16(4, 20, true);
      header.setUint16(6, 0x08_00, true); // UTF-8 文件名
      header.setUint16(8, 0, true);
      header.setUint16(10, dosTime, true);
      header.setUint16(12, dosDate, true);
      header.setUint32(14, crc, true);
      header.setUint32(18, data.length, true);
      header.setUint32(22, data.length, true);
      header.setUint16(26, nameBytes.length, true);
      header.setUint16(28, 0, true);
      chunks.push(new Uint8Array(header.buffer), nameBytes, data);

      const entry = new DataView(new ArrayBuffer(46));
      entry.setUint32(0, 0x02_01_4b_50, true);
      entry.setUint16(4, 20, true);
      entry.setUint16(6, 20, true);
      entry.setUint16(8, 0x08_00, true);
      entry.setUint16(10, 0, true);
      entry.setUint16(12, dosTime, true);
      entry.setUint16(14, dosDate, true);
      entry.setUint32(16, crc, true);
      entry.setUint32(20, data.length, true);
      entry.setUint32(24, data.length, true);
      entry.setUint16(28, nameBytes.length, true);
      entry.setUint32(42, offset, true);
      central.push(new Uint8Array(entry.buffer), nameBytes);
      offset += 30 + nameBytes.length + data.length;
    }

    const centralStart = offset;
    let centralSize = 0;
    for (const chunk of central) {
      centralSize += chunk.length;
    }
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06_05_4b_50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, centralStart, true);

    const total = centralStart + centralSize + 22;
    const out = new Uint8Array(total);
    let pos = 0;
    for (const chunk of [...chunks, ...central, new Uint8Array(end.buffer)]) {
      out.set(chunk, pos);
      pos += chunk.length;
    }
    return out;
  };

  // ------------------------------------------------------------- zip 读取

  const inflateRaw = async (raw) => {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('DEFLATE_UNSUPPORTED');
    }
    const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  };

  /** 解析 zip：中央目录定位条目；store 直读、deflate 走 DecompressionStream。 */
  const readZipEntries = async (bytes) => {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const eocd = bytes.length - 22;
    if (eocd < 0 || view.getUint32(eocd, true) !== 0x06_05_4b_50) {
      throw new Error('NOT_ZIP');
    }
    const count = view.getUint16(eocd + 10, true);
    let p = view.getUint32(eocd + 16, true);
    const entries = new Map();
    const decoder = new TextDecoder();
    const inflaters = [];
    for (let i = 0; i < count; i++) {
      if (view.getUint32(p, true) !== 0x02_01_4b_50) {
        throw new Error('BAD_CENTRAL');
      }
      const method = view.getUint16(p + 10, true);
      const csize = view.getUint32(p + 20, true);
      const nameLen = view.getUint16(p + 28, true);
      const extraLen = view.getUint16(p + 30, true);
      const commentLen = view.getUint16(p + 32, true);
      const localOff = view.getUint32(p + 42, true);
      const name = decoder.decode(bytes.slice(p + 46, p + 46 + nameLen));
      const localNameLen = view.getUint16(localOff + 26, true);
      const localExtraLen = view.getUint16(localOff + 28, true);
      const start = localOff + 30 + localNameLen + localExtraLen;
      const raw = bytes.slice(start, start + csize);
      if (!name.endsWith('/')) {
        if (method === 0) {
          entries.set(name, raw);
        } else if (method === 8) {
          inflaters.push(inflateRaw(raw).then((data) => entries.set(name, data)));
        }
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
    await Promise.all(inflaters);
    // 膨胀护栏：与 serde 20MB 上限同类的防线——恶意 zip 可用 KB 级压缩
    // 膨胀出 GB 级条目（DecompressionStream 无原生上限）。超限整体放弃。
    let total = 0;
    for (const data of entries.values()) {
      total += data.length;
      if (total > 32 * 1024 * 1024) {
        throw new Error('ZIP_TOO_LARGE');
      }
    }
    return entries;
  };

  /**
   * 逆向导入：MC 数据包 zip（pack.mcmeta + data/<ns>/advancement/*.json）
   * 或本插件导出的 Maven 工程 zip（datapack 嵌套布局）。
   * 自家导出携带 datapack/flow-editor.json 溯源元数据 → 触发器/参数/栏
   * 设置完整还原；外部数据包尽力还原（impossible 条件无法反推触发方式，
   * 按仅命令授予；无父进度视为栏根）。
   * 返回 { code, warnings } 或 undefined（不是可识别的数据包）。
   */
  const importDatapackZip = async (bytes) => {
    let entries;
    try {
      entries = await readZipEntries(bytes);
    } catch {
      return undefined;
    }
    let base = null;
    if (entries.has('pack.mcmeta')) {
      base = '';
    } else if (entries.has('src/main/resources/datapack/pack.mcmeta')) {
      base = 'src/main/resources/datapack/';
    }
    if (base === null) {
      return undefined;
    }
    const decoder = new TextDecoder();
    const warnings = [];

    // 溯源元数据（自家导出）
    let provenance = null;
    const provEntry = entries.get(`${base}flow-editor.json`);
    if (provEntry) {
      try {
        const parsed = JSON.parse(decoder.decode(provEntry));
        if (parsed?.mcadv && typeof parsed.mcadv === 'object') {
          provenance = parsed.mcadv;
        }
      } catch {
        warnings.push('溯源元数据 flow-editor.json 无法解析，按外部数据包尽力还原');
      }
    }

    // 收集 advancement JSON（按命名空间）
    const advPrefix = `${base}data/`;
    const advSuffix = '/advancement/';
    const byNs = new Map();
    for (const [name, data] of entries) {
      if (!name.startsWith(advPrefix) || !name.endsWith('.json')) {
        continue;
      }
      const rest = name.slice(advPrefix.length, -5);
      const idx = rest.indexOf(advSuffix);
      if (idx <= 0) {
        continue;
      }
      const ns = rest.slice(0, idx);
      const nid = rest.slice(idx + advSuffix.length);
      if (!ns || !nid || nid.includes('/')) {
        continue;
      }
      try {
        const json = JSON.parse(decoder.decode(data));
        if (!json || typeof json !== 'object') {
          continue;
        }
        if (!byNs.has(ns)) {
          byNs.set(ns, new Map());
        }
        byNs.get(ns).set(nid, json);
      } catch {
        warnings.push(`进度文件 ${name} 不是合法 JSON，已跳过`);
      }
    }
    if (byNs.size === 0) {
      return undefined;
    }
    let ns = null;
    if (provenance?.namespace && byNs.has(provenance.namespace)) {
      ns = provenance.namespace;
    } else if (byNs.size === 1) {
      ns = byNs.keys().next().value;
    } else {
      const sorted = [...byNs.entries()].sort((a, b) => b[1].size - a[1].size);
      ns = sorted[0][0];
      warnings.push(`数据包含多个命名空间，仅导入「${ns}」（其余 ${byNs.size - 1} 个跳过）`);
    }
    const advs = byNs.get(ns);

    // 大满贯识别：全部条件都是同栏其他进度 id 的 impossible 条件
    let completionist = null;
    for (const [nid, json] of advs) {
      const criteria = json.criteria ?? {};
      const keys = Object.keys(criteria);
      const allOthers = keys.every(
        (k) => k !== nid && advs.has(k) && criteria[k]?.trigger === 'minecraft:impossible'
      );
      if (keys.length >= 1 && allOthers) {
        completionist = { json, nid };
        break;
      }
    }
    if (completionist) {
      advs.delete(completionist.nid);
    }

    // 重建节点与边（溯源元数据优先，缺失的节点/栏从 advancement JSON 恢复）
    const FRAME_SHAPE_IN = { challenge: 'diamond', goal: 'round', task: 'rect' };
    const meta = { ...defaultMeta(), ...(provenance ?? {}) };
    meta.nodes = { ...(provenance?.nodes ?? {}) };
    meta.tabs = { ...(provenance?.tabs ?? {}) };
    meta.namespace = ns; // 文件为准（数据包可能被外部改名）
    if (!meta.command) {
      meta.command = ns;
    }
    const nodes = [];
    const edges = [];
    const rootIds = [];
    for (const [nid, json] of advs) {
      const display = json.display ?? {};
      const pidRaw = typeof json.parent === 'string' ? json.parent : '';
      const pid = pidRaw.startsWith(`${ns}:`) ? pidRaw.slice(ns.length + 1) : '';
      const label = display.title?.text ?? nid;
      const shape = FRAME_SHAPE_IN[display.frame ?? 'task'] ?? 'rect';
      nodes.push({ id: nid, label, shape });
      if (!meta.nodes[nid] || typeof meta.nodes[nid] !== 'object') {
        meta.nodes[nid] = {
          announce: true,
          desc: display.description?.text ?? '',
          hidden: display.hidden === true,
          icon: display.icon?.id ?? '',
          params: {},
          toast: display.show_toast !== false,
          trigger: 'manual',
          xp: Number(json.rewards?.experience) || 0
        };
      }
      if (pid && advs.has(pid)) {
        edges.push({ from: pid, to: nid });
      } else {
        rootIds.push(nid);
        if (!meta.tabs[nid] || typeof meta.tabs[nid] !== 'object') {
          meta.tabs[nid] = {
            background: display.background ?? 'minecraft:textures/block/deepslate_tiles.png',
            completionist: Boolean(completionist),
            desc: display.description?.text ?? '',
            icon: display.icon?.id ?? 'minecraft:nether_star'
          };
        }
      }
    }
    if (completionist && rootIds.length > 0) {
      // 大满贯归到其 parent 所在栏（溯源缺省时）
      const parentRaw = completionist.json.parent;
      const pid =
        typeof parentRaw === 'string' && parentRaw.startsWith(`${ns}:`)
          ? parentRaw.slice(ns.length + 1)
          : '';
      let target = rootIds.includes(pid) ? pid : rootIds[0];
      if (!target) {
        target = rootIds[0];
      }
      const cDisplay = completionist.json.display ?? {};
      const base = meta.tabs[target] ?? {};
      meta.tabs[target] = {
        ...base,
        completionist: true,
        completionistDesc: cDisplay.description?.text ?? base.completionistDesc,
        completionistIcon: cDisplay.icon?.id ?? base.completionistIcon,
        completionistName: cDisplay.title?.text ?? base.completionistName,
        completionistXp: Number(completionist.json.rewards?.experience) || base.completionistXp
      };
    }
    if (nodes.length === 0) {
      return undefined;
    }

    const code = buildCode(meta, 'TD', nodes, edges);
    return { code, warnings };
  };

  /** 一键导出：分析 → 生成 → 打包。失败返回 { ok:false, errors }。 */
  const exportZip = (code) => {
    const a = analyze(code);
    if (!a.ok) {
      return { analysis: a, errors: a.errors, ok: false };
    }
    const files = generateFiles(a);
    return {
      analysis: a,
      bytes: buildZip(files),
      filename: `${a.meta.plugin}.zip`,
      files,
      ok: true
    };
  };

  /**
   * 桌面版离线编译请求：只取 javac/jar 所需的 java 源与资源文件，
   * 并把 paper-plugin.yml 的 Maven 占位符 ${project.version} 置换为实际版本
   * （直接 javac 没有 Maven 资源过滤这一步）。
   */
  const buildJarRequest = (code) => {
    const a = analyze(code);
    if (!a.ok) {
      return { analysis: a, errors: a.errors, ok: false };
    }
    const files = generateFiles(a)
      .filter(
        (f) => f.path.startsWith('src/main/java/') || f.path.startsWith('src/main/resources/')
      )
      .map((f) => ({
        path: f.path,
        text:
          f.path === 'src/main/resources/paper-plugin.yml'
            ? f.text.replaceAll('${project.version}', a.meta.version || '1.0.0')
            : f.text
      }));
    return {
      analysis: a,
      filename: `${a.meta.plugin}-${a.meta.version || '1.0.0'}.jar`,
      files,
      ok: true
    };
  };

  /** 空图/非成就图的入门模板（前端「初始化示例」按钮）。 */
  const starterCode = () => {
    const meta = defaultMeta();
    meta.tabs = {
      root: {
        completionist: true,
        desc: '由 MC 进度设计器生成的自定义成就',
        icon: 'minecraft:nether_star'
      }
    };
    meta.nodes = {
      block_breaker: {
        desc: '累计挖掘 200 个方块',
        icon: 'minecraft:iron_pickaxe',
        params: { amount: 200, material: '' },
        trigger: 'break_block'
      },
      first_join: {
        desc: '第一次加入服务器',
        icon: 'minecraft:compass',
        params: { firstOnly: true },
        trigger: 'join'
      }
    };
    return buildCode(
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

  return {
    DEFAULT_NODE_META,
    FRAME_NAME,
    FRAME_SHAPE,
    ICON_SUGGESTIONS,
    SHAPE_FRAME,
    TRIGGERS,
    analyze,
    buildCode,
    buildZip,
    buildJarRequest,
    completionistId,
    defaultMeta,
    exportZip,
    generateFiles,
    nodeMeta,
    normId,
    parseFlow,
    readMeta,
    starterCode,
    tabMeta,
    triggerById,
    triggerGroup,
    importDatapackZip,
    readZipEntries,
    triggerParams
  };
};

const CORE = coreFactory();

// ============================================================================
// 插件前端（整页替换 UI）：属性面板 + 成就栏管理 + 校验 + 导出。
// 核心逻辑经 coreFactory.toString() 注入，与 export 钩子共享同一实现。
// ============================================================================
const FRONTEND_HTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>MC 进度设计器</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: system-ui, sans-serif; margin: 0; background: #0f0f12; color: #e8e8ec; font-size: 14px; }
      header { display: flex; align-items: center; gap: 8px; padding: 10px 16px; background: #17171c; border-bottom: 1px solid #2a2a32; flex-wrap: wrap; }
      header h1 { font-size: 16px; margin: 0 12px 0 0; }
      button { background: #2a2a35; color: #e8e8ec; border: 1px solid #3a3a46; border-radius: 6px; padding: 5px 12px; cursor: pointer; font-size: 13px; }
      button:hover { background: #34343f; }
      button.primary { background: #2b5ea7; border-color: #3a76c9; }
      button.primary:hover { background: #3370c2; }
      button.danger { border-color: #7a3535; color: #e8a0a0; }
      button:disabled { opacity: 0.45; cursor: not-allowed; }
      main { display: flex; height: calc(100vh - 52px); }
      #tree { width: 300px; min-width: 300px; overflow: auto; border-right: 1px solid #2a2a32; padding: 10px; }
      #panel { flex: 1; overflow: auto; padding: 14px 18px; }
      .tab-block { margin-bottom: 10px; }
      .tab-head { font-weight: 600; padding: 6px 8px; border-radius: 6px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; }
      .tab-head:hover, .tab-head.sel { background: #23232c; }
      .badge { font-size: 11px; background: #2a2a35; border-radius: 8px; padding: 1px 7px; opacity: 0.85; }
      .node-row { padding: 3px 8px 3px 22px; border-radius: 5px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .node-row:hover { background: #1e1e26; }
      .node-row.sel { background: #2b3b57; }
      .node-row .frame { opacity: 0.55; font-size: 11px; margin-left: 4px; }
      fieldset { border: 1px solid #2a2a32; border-radius: 8px; margin: 0 0 14px; padding: 10px 14px 14px; }
      legend { padding: 0 6px; opacity: 0.8; }
      label { display: block; margin: 8px 0 3px; opacity: 0.85; }
      input[type=text], input[type=number], select, textarea { width: 100%; background: #15151a; color: #e8e8ec; border: 1px solid #3a3a46; border-radius: 6px; padding: 6px 8px; font-size: 13px; }
      input[type=checkbox] { transform: scale(1.15); margin-right: 6px; }
      .row { display: flex; gap: 10px; }
      .row > div { flex: 1; }
      .checks { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 8px; }
      .checks label { margin: 0; }
      .hint { opacity: 0.55; font-size: 12px; margin-top: 3px; }
      #issues { border-top: 1px solid #2a2a32; padding: 8px 16px; max-height: 130px; overflow: auto; }
      .issue { padding: 2px 0; cursor: pointer; }
      .issue.error { color: #f08c8c; }
      .issue.warn { color: #e8c87a; }
      .ok { color: #8ce8a0; }
      #status { margin-left: auto; opacity: 0.75; font-size: 12px; }
      .kbd { background: #23232c; border-radius: 4px; padding: 0 5px; font-size: 12px; }
    </style>
  </head>
  <body>
    <header>
      <h1>MC 进度设计器</h1>
      <button id="btnReload">重新读取</button>
      <button id="btnSave" class="primary">写回编辑器</button>
      <button id="btnExport" class="primary">导出插件 zip</button>
      <button id="btnJar" class="primary" style="display:none">编译导出 jar</button>
      <button id="btnStarter">初始化示例</button>
      <span id="status"></span>
    </header>
    <main>
      <div id="tree"></div>
      <div id="panel"></div>
    </main>
    <div id="issues"></div>
    <datalist id="icons">
      <!--ICONS-->
    </datalist>
    <script>
      var CORE = (${coreFactory.toString()})();
      var CH = 'flow-editor';
      var msgId = 0;
      var call = function (method, params, timeoutMs) {
        return new Promise(function (resolve, reject) {
          var mid = ++msgId;
          var timer = setTimeout(function () {
            window.removeEventListener('message', onMsg);
            reject(new Error('bridge timeout'));
          }, timeoutMs || 5000);
          var onMsg = function (e) {
            if (e.data && e.data.channel === CH && e.data.id === mid) {
              clearTimeout(timer);
              window.removeEventListener('message', onMsg);
              if (e.data.error) { reject(new Error(e.data.error.message)); } else { resolve(e.data.result); }
            }
          };
          window.addEventListener('message', onMsg);
          parent.postMessage({ channel: CH, id: mid, jsonrpc: '2.0', method: method, params: params }, '*');
        });
      };
      var tool = function (name, args, timeoutMs) {
        return call('tools/call', { name: name, arguments: args || {} }, timeoutMs).then(function (r) {
          return r && r.content && r.content[0] ? r.content[0].text : '';
        });
      };

      var S = { analysis: null, code: '', mcBuild: false, sel: null, settings: false };

      var $ = function (id) { return document.getElementById(id); };
      var esc = function (s) {
        return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
      };
      var setStatus = function (text) { $('status').textContent = text; };

      // 上次与编辑器同步的代码基线：用于检测「面板打开期间主界面/URL 的外部改动」，
      // 避免写回时静默覆盖（面板自身的 rebuildCode 漂移不算外部变化）
      var lastSynced = '';

      function load() {
        return tool('get_code').then(function (code) {
          S.code = code;
          lastSynced = code;
          S.analysis = CORE.analyze(code);
          render();
          if (S.analysis.errors.length > 0) {
            setStatus('当前图表还不是有效的成就图（可点「初始化示例」）');
          } else {
            setStatus('已读取：' + S.analysis.tabs.length + ' 个成就栏 / ' + S.analysis.nodes.length + ' 个成就');
          }
        });
      }

      function save() {
        // 先确认编辑器侧没有外部修改（画布编辑/粘贴分享链接），有则让用户选择
        return tool('get_code').then(function (editorCode) {
          if (editorCode !== lastSynced) {
            var overwrite = confirm(
              '编辑器中的图表在面板打开期间被外部修改（如主界面画布编辑）。\\n' +
                '「确定」= 用面板内容覆盖外部修改；「取消」= 放弃面板未写回的修改并重新读取外部版本。'
            );
            if (!overwrite) {
              return load().then(function () {
                setStatus('已重新读取编辑器版本（面板未写回的修改已放弃）');
              });
            }
          }
          rebuildCode();
          return tool('set_code', { code: S.code }).then(function () {
            lastSynced = S.code;
            setStatus('已写回编辑器 ' + new Date().toLocaleTimeString());
          });
        });
      }

      function rebuildCode() {
        var a = S.analysis;
        var nodes = a.nodes.map(function (n) { return { id: n.id, label: n.label, shape: n.shape }; });
        S.code = CORE.buildCode(a.meta, a.direction, nodes, a.edges);
        S.analysis = CORE.analyze(S.code);
      }

      function findNode(id) {
        return S.analysis.nodes.find(function (n) { return n.id === id; });
      }

      function render() {
        renderTree();
        renderPanel();
        renderIssues();
      }

      function renderTree() {
        var a = S.analysis;
        var html = '';
        if (a.tabs.length === 0) {
          html = '<p class="hint">尚无成就栏。点「初始化示例」或在主界面画布上画出成就树后点「重新读取」。</p>';
        }
        a.tabs.forEach(function (tab) {
          var selTab = S.sel && S.sel.type === 'tab' && S.sel.id === tab.rootId;
          html += '<div class="tab-block">';
          html += '<div class="tab-head' + (selTab ? ' sel' : '') + '" data-tab="' + esc(tab.rootId) + '">'
            + '<span>🏆 ' + esc(tab.name) + '</span><span class="badge">' + (tab.members.length - 1) + ' 成就</span></div>';
          var depth = {};
          depth[tab.rootId] = 0;
          tab.members.forEach(function (id) {
            if (id === tab.rootId) { return; }
            var n = findNode(id);
            if (!n) { return; }
            var parentId = (S.analysis.edges.find(function (e) { return e.to === id; }) || {}).from;
            depth[id] = (depth[parentId] === undefined ? 0 : depth[parentId]) + 1;
            var sel = S.sel && S.sel.type === 'node' && S.sel.id === id;
            html += '<div class="node-row' + (sel ? ' sel' : '') + '" data-node="' + esc(id) + '" style="padding-left:' + (22 + (depth[id] - 1) * 16) + 'px">'
              + esc(n.label) + '<span class="frame">' + (CORE.FRAME_NAME[n.frame] || '') + ' · ' + esc(n.meta.trigger) + '</span></div>';
          });
          html += '</div>';
        });
        // 结构异常（多根/纯环/id 冲突）的节点：单独成组，可选中后改挂父级修复
        var orphans = a.nodes.filter(function (n) { return n.tab === null; });
        if (orphans.length > 0) {
          html += '<div class="tab-block"><div class="tab-head" style="color:#f08c8c">⚠ 结构异常（未入栏，需修复后才能导出）</div>';
          orphans.forEach(function (n) {
            var sel = S.sel && S.sel.type === 'node' && S.sel.id === n.id;
            html += '<div class="node-row' + (sel ? ' sel' : '') + '" data-node="' + esc(n.id) + '">'
              + esc(n.label) + '<span class="frame">' + esc(n.id) + '</span></div>';
          });
          html += '</div>';
        }
        html += '<div style="margin-top:10px"><button id="btnAddTab">+ 新增成就栏</button></div>';
        $('tree').innerHTML = html;
        Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (el) {
          el.onclick = function () { S.sel = { id: el.getAttribute('data-tab'), type: 'tab' }; render(); };
        });
        Array.prototype.forEach.call(document.querySelectorAll('[data-node]'), function (el) {
          el.onclick = function () { S.sel = { id: el.getAttribute('data-node'), type: 'node' }; render(); };
        });
        $('btnAddTab').onclick = addTab;
      }

      function renderPanel() {
        if (S.settings) { renderSettings(); return; }
        if (!S.sel) {
          $('panel').innerHTML = '<p class="hint">在左侧选择成就或成就栏进行编辑。结构（增删、连线）推荐回主界面可视化画布操作；此处编辑名称、图标、触发方式、奖励等全部元数据。</p>'
            + '<p class="hint">提示：画布里节点的<b>形状</b>对应框架类型（矩形=任务 / 圆角=目标 / 菱形=挑战），<b>连线</b>对应承接关系。</p>';
          return;
        }
        if (S.sel.type === 'tab') { renderTabForm(S.sel.id); return; }
        renderNodeForm(S.sel.id);
      }

      function inputHtml(key, labelText, value, type, extra) {
        return '<div><label>' + esc(labelText) + '</label>'
          + '<input type="' + type + '" data-k="' + key + '" value="' + esc(value) + '"' + (extra || '') + ' /></div>';
      }

      function renderNodeForm(id) {
        var n = findNode(id);
        if (!n) { S.sel = null; renderPanel(); return; }
        // 栏根节点（成就栏本身）：承接/触发/框架等均不适用，只编辑名称与 id
        if (n.tab !== null && n.parent === null) {
          var rhtml = '<fieldset><legend>栏根节点</legend>';
          rhtml += '<div class="row">'
            + inputHtml('label', '成就栏名称（= 画布根节点标签）', n.label, 'text')
            + inputHtml('id', '根节点 id', n.id, 'text')
            + '</div>';
          rhtml += '<p class="hint">该节点是成就栏的标签页本身，由服务端自动授予（tick）；'
            + '触发方式、框架类型、父级承接、隐藏/播报等只作用于普通成就，对栏根不适用。'
            + '栏图标、背景纹理、大满贯汇总成就请在左侧点击栏名进入「成就栏设置」编辑。</p>';
          rhtml += '</fieldset>';
          $('panel').innerHTML = rhtml;
          Array.prototype.forEach.call($('panel').querySelectorAll('[data-k]'), function (el) {
            el.onchange = function () {
              var k = el.getAttribute('data-k');
              if (k === 'label') { n.label = el.value; }
              if (k === 'id') { renameNode(n, el.value); return; }
              rebuildCode();
              render();
            };
          });
          return;
        }
        var spec = CORE.triggerById(n.meta.trigger);
        var parentEdge = S.analysis.edges.find(function (e) { return e.to === id; });
        var html = '<fieldset><legend>成就属性</legend>';
        html += '<div class="row">'
          + inputHtml('label', '成就名称', n.label, 'text')
          + inputHtml('id', '成就 id（[a-z0-9_]，改名会级联更新）', n.id, 'text')
          + '</div>';
        html += inputHtml('desc', '描述（留空按触发方式自动生成）', n.meta.desc, 'text');
        html += '<div class="row">'
          + inputHtml('icon', '图标物品 ID', n.meta.icon, 'text', ' list="icons" placeholder="留空按框架默认"')
          + '<div><label>框架类型（= 画布节点形状）</label><select data-k="frame">'
          + ['task', 'goal', 'challenge'].map(function (f) {
            return '<option value="' + f + '"' + (n.frame === f ? ' selected' : '') + '>' + CORE.FRAME_NAME[f] + '</option>';
          }).join('')
          + '</select></div>'
          + '<div><label>父成就（承接关系）</label><select data-k="parent">'
          + parentOptions(n, parentEdge ? parentEdge.from : null)
          + '</select></div>'
          + '</div>';
        html += '<div class="checks">'
          + '<label><input type="checkbox" data-k="hidden"' + (n.meta.hidden ? ' checked' : '') + '/>隐藏成就</label>'
          + '<label><input type="checkbox" data-k="toast"' + (n.meta.toast !== false ? ' checked' : '') + '/>弹出提示（toast）</label>'
          + '<label><input type="checkbox" data-k="announce"' + (n.meta.announce !== false ? ' checked' : '') + '/>聊天播报</label>'
          + '</div>';
        html += inputHtml('xp', '奖励经验值（0 = 无奖励）', String(n.meta.xp || 0), 'number', ' min="0"');
        html += '</fieldset>';

        html += '<fieldset><legend>触发方式</legend>';
        var triggerGroups = {};
        CORE.TRIGGERS.forEach(function (t) {
          var g = CORE.triggerGroup(t.id);
          (triggerGroups[g] = triggerGroups[g] || []).push(t);
        });
        html += '<label>触发器</label><select data-k="trigger">'
          + Object.keys(triggerGroups).map(function (g) {
            return '<optgroup label="' + esc(g) + '">'
              + triggerGroups[g].map(function (t) {
                return '<option value="' + t.id + '"' + (spec.id === t.id ? ' selected' : '') + '>' + esc(t.name) + '</option>';
              }).join('')
              + '</optgroup>';
          }).join('')
          + '</select><div class="hint">' + esc(spec.desc) + '</div>';
        spec.params.forEach(function (p) {
          var v = n.meta.params[p.key] === undefined ? p.def : n.meta.params[p.key];
          if (p.type === 'bool') {
            html += '<label style="margin-top:10px"><input type="checkbox" data-p="' + p.key + '"' + (v ? ' checked' : '') + '/>' + esc(p.label) + '</label>';
          } else if (p.type === 'select') {
            html += '<label>' + esc(p.label) + '</label><select data-p="' + p.key + '">'
              + p.options.map(function (o) { return '<option' + (o === v ? ' selected' : '') + '>' + o + '</option>'; }).join('')
              + '</select>';
          } else {
            html += '<label>' + esc(p.label) + '</label><input type="' + (p.type === 'int' ? 'number' : 'text') + '" data-p="' + p.key + '" value="' + esc(v) + '"'
              + (p.ph ? ' placeholder="' + esc(p.ph) + '"' : '') + (p.min !== undefined ? ' min="' + p.min + '"' : '') + ' />';
          }
        });
        html += '</fieldset>';

        html += '<button class="danger" id="btnDelNode">删除此成就</button> ';
        html += '<button id="btnAddChild">+ 添加下级成就</button>';
        $('panel').innerHTML = html;
        bindNodeForm(n);
      }

      function parentOptions(n, currentParent) {
        // 排除自身与全部后代，避免改挂出环
        var descendants = {};
        var queue = [n.id];
        descendants[n.id] = true;
        while (queue.length > 0) {
          var cur = queue.shift();
          S.analysis.edges.forEach(function (e) {
            if (e.from === cur && !descendants[e.to]) {
              descendants[e.to] = true;
              queue.push(e.to);
            }
          });
        }
        var out = [];
        S.analysis.tabs.forEach(function (tab) {
          // 孤儿节点（tab 为 null）可挂到任意栏根；栏内节点限本栏
          if ((n.tab === null || tab.rootNid === n.tab) && !descendants[tab.rootId]) {
            out.push('<option value="' + esc(tab.rootId) + '"' + (currentParent === tab.rootId ? ' selected' : '') + '>' + esc(tab.name) + '（栏根）</option>');
          }
        });
        S.analysis.nodes.forEach(function (other) {
          if ((n.tab === null || other.tab === n.tab) && !descendants[other.id] && other.parent !== null) {
            out.push('<option value="' + esc(other.id) + '"' + (currentParent === other.id ? ' selected' : '') + '>' + esc(other.label) + '</option>');
          }
        });
        return out.join('');
      }

      function bindNodeForm(n) {
        var a = S.analysis;
        var meta = a.meta.nodes[n.id] || (a.meta.nodes[n.id] = {});
        Array.prototype.forEach.call($('panel').querySelectorAll('[data-k]'), function (el) {
          el.onchange = function () {
            var k = el.getAttribute('data-k');
            if (k === 'label') { n.label = el.value; }
            if (k === 'id') { renameNode(n, el.value); return; }
            if (k === 'desc') { meta.desc = el.value; }
            if (k === 'icon') { meta.icon = el.value; }
            if (k === 'frame') { n.shape = CORE.FRAME_SHAPE[el.value] || 'rect'; }
            if (k === 'hidden') { meta.hidden = el.checked; }
            if (k === 'toast') { meta.toast = el.checked; }
            if (k === 'announce') { meta.announce = el.checked; }
            if (k === 'xp') { meta.xp = Math.max(0, parseInt(el.value, 10) || 0); }
            if (k === 'parent') { reparent(n, el.value); return; }
            rebuildCode();
            render();
          };
        });
        Array.prototype.forEach.call($('panel').querySelectorAll('[data-p]'), function (el) {
          el.onchange = function () {
            var k = el.getAttribute('data-p');
            if (!meta.params) { meta.params = {}; }
            var spec = CORE.triggerById(meta.trigger || 'manual');
            var pspec = spec.params.find(function (p) { return p.key === k; });
            if (el.type === 'checkbox') { meta.params[k] = el.checked; }
            else if (pspec && pspec.type === 'int') { meta.params[k] = parseInt(el.value, 10) || 0; }
            else { meta.params[k] = el.value; }
            rebuildCode();
            renderIssues();
          };
        });
        var triggerSel = $('panel').querySelector('[data-k="trigger"]');
        triggerSel.onchange = function () {
          meta.trigger = triggerSel.value;
          meta.params = {};
          rebuildCode();
          render();
        };
        $('btnDelNode').onclick = function () { deleteNode(n); };
        $('btnAddChild').onclick = function () { addNode(n); };
      }

      function renameNode(n, newId) {
        var a = S.analysis;
        var id = newId.trim();
        if (!id || id === n.id) { render(); return; }
        if (findNode(id)) { setStatus('id「' + id + '」已存在'); render(); return; }
        a.edges.forEach(function (e) {
          if (e.from === n.id) { e.from = id; }
          if (e.to === n.id) { e.to = id; }
        });
        if (a.meta.nodes[n.id]) { a.meta.nodes[id] = a.meta.nodes[n.id]; delete a.meta.nodes[n.id]; }
        var tab = a.tabs.find(function (t) { return t.rootId === n.id; });
        if (tab && a.meta.tabs[n.id]) { a.meta.tabs[id] = a.meta.tabs[n.id]; delete a.meta.tabs[n.id]; }
        n.id = id;
        S.sel = { id: id, type: 'node' };
        rebuildCode();
        render();
      }

      function reparent(n, newParentId) {
        var a = S.analysis;
        a.edges = a.edges.filter(function (e) { return e.to !== n.id; });
        a.edges.push({ from: newParentId, to: n.id });
        rebuildCode();
        render();
      }

      function nextId(base) {
        var id = base;
        var i = 1;
        while (findNode(id)) { id = base + '_' + i++; }
        return id;
      }

      function addNode(parentNode) {
        var a = S.analysis;
        var id = nextId('advancement');
        var nid = CORE.normId(id);
        a.nodes.push({
          frame: 'task', id: id, label: '新成就', meta: { announce: true, desc: '', hidden: false, icon: '', params: {}, toast: true, trigger: 'manual', xp: 0 },
          nid: nid, params: {}, parent: parentNode.nid, shape: 'rect', tab: parentNode.tab
        });
        a.edges.push({ from: parentNode.id, to: id });
        S.sel = { id: id, type: 'node' };
        rebuildCode();
        render();
      }

      function deleteNode(n) {
        var a = S.analysis;
        if (n.tab !== null && n.parent === null) {
          setStatus('根节点代表成就栏本身，请在栏设置里用「删除整个成就栏」');
          return;
        }
        if (!confirm('删除成就「' + n.label + '」？其下级成就会转挂到它的父级。')) { return; }
        var parentEdge = a.edges.find(function (e) { return e.to === n.id; });
        var childIds = a.edges.filter(function (e) { return e.from === n.id; }).map(function (e) { return e.to; });
        a.edges = a.edges.filter(function (e) { return e.from !== n.id && e.to !== n.id; });
        if (parentEdge) {
          childIds.forEach(function (cid) { a.edges.push({ from: parentEdge.from, to: cid }); });
        }
        a.nodes = a.nodes.filter(function (o) { return o.id !== n.id; });
        delete a.meta.nodes[n.id];
        S.analysis.nodes = a.nodes;
        S.sel = null;
        rebuildCode();
        render();
      }

      function addTab() {
        var a = S.analysis;
        var id = nextId('tab_root');
        var label = '新成就栏';
        a.meta.tabs[id] = { completionist: true, desc: '', icon: 'minecraft:nether_star' };
        var nid = CORE.normId(id);
        a.tabs.push({ members: [id], meta: CORE.tabMeta(a.meta, id), name: label, rootId: id, rootNid: nid });
        a.nodes.push({
          frame: 'task', id: id, label: label, meta: { announce: false, desc: '', hidden: false, icon: '', params: {}, toast: false, trigger: 'manual', xp: 0 },
          nid: nid, params: {}, parent: null, shape: 'rect', tab: nid
        });
        S.sel = { id: id, type: 'tab' };
        rebuildCode();
        render();
      }

      function renderTabForm(rootId) {
        var a = S.analysis;
        var tab = a.tabs.find(function (t) { return t.rootId === rootId; });
        if (!tab) { S.sel = null; renderPanel(); return; }
        var tm = a.meta.tabs[rootId] || (a.meta.tabs[rootId] = {});
        var v = function (k) { return tm[k] === undefined ? tab.meta[k] : tm[k]; };
        var root = findNode(rootId);
        var html = '<fieldset><legend>栏根节点（成就栏本身，服务端自动授予）</legend>';
        if (root) {
          html += '<div class="row">'
            + inputHtml('label', '成就栏名称', root.label, 'text')
            + inputHtml('id', '根节点 id', root.id, 'text')
            + '</div>';
        }
        html += '<p class="hint">触发方式、框架类型、父级承接等只作用于普通成就，对栏根不适用。</p>';
        html += '</fieldset>';
        html += '<fieldset><legend>成就栏设置</legend>';
        html += inputHtml('tdesc', '栏描述', v('desc'), 'text');
        html += '<div class="row">'
          + inputHtml('ticon', '栏图标物品 ID', v('icon'), 'text', ' list="icons"')
          + inputHtml('tbg', '标签页背景纹理路径', v('background'), 'text')
          + '</div>';
        html += '<div class="checks"><label><input type="checkbox" data-k="completionist"' + (v('completionist') !== false ? ' checked' : '') + '/>自动生成「大满贯」汇总成就</label></div>';
        html += '<div class="row">'
          + inputHtml('cname', '大满贯名称', v('completionistName'), 'text')
          + inputHtml('cdesc', '大满贯描述', v('completionistDesc'), 'text')
          + '</div>';
        html += '<div class="row">'
          + inputHtml('cicon', '大满贯图标', v('completionistIcon'), 'text', ' list="icons"')
          + inputHtml('cxp', '大满贯奖励经验', String(v('completionistXp')), 'number', ' min="0"')
          + '</div>';
        html += '</fieldset>';
        html += '<button id="btnAddToTab">+ 在此栏添加成就</button> ';
        html += '<button class="danger" id="btnDelTab">删除整个成就栏</button>';
        $('panel').innerHTML = html;
        Array.prototype.forEach.call($('panel').querySelectorAll('[data-k]'), function (el) {
          el.onchange = function () {
            var k = el.getAttribute('data-k');
            var map = { tdesc: 'desc', ticon: 'icon', tbg: 'background', cname: 'completionistName', cdesc: 'completionistDesc', cicon: 'completionistIcon' };
            if (k === 'label') { root.label = el.value; }
            else if (k === 'id') { renameNode(root, el.value); return; }
            else if (k === 'completionist') { tm.completionist = el.checked; }
            else if (k === 'cxp') { tm.completionistXp = Math.max(0, parseInt(el.value, 10) || 0); }
            else { tm[map[k]] = el.value; }
            rebuildCode();
            render();
          };
        });
        $('btnAddToTab').onclick = function () {
          var root = findNode(rootId);
          if (root) { addNode(root); }
        };
        $('btnDelTab').onclick = function () {
          if (!confirm('删除整个成就栏「' + tab.name + '」及其全部 ' + (tab.members.length - 1) + ' 个成就？')) { return; }
          var ids = {};
          tab.members.forEach(function (id) { ids[id] = true; });
          a.nodes = a.nodes.filter(function (n) { return !ids[n.id]; });
          a.edges = a.edges.filter(function (e) { return !ids[e.from] && !ids[e.to]; });
          tab.members.forEach(function (id) { delete a.meta.nodes[id]; });
          delete a.meta.tabs[rootId];
          S.analysis.nodes = a.nodes;
          S.analysis.edges = a.edges;
          S.sel = null;
          rebuildCode();
          render();
        };
      }

      function renderSettings() {
        var m = S.analysis.meta;
        var html = '<fieldset><legend>插件设置</legend>';
        html += '<div class="row">'
          + inputHtml('plugin', '插件名（英文，作为 jar/类名）', m.plugin, 'text')
          + inputHtml('namespace', '数据包命名空间（[a-z0-9_]）', m.namespace, 'text')
          + '</div>';
        html += '<div class="row">'
          + inputHtml('packageName', 'Java 包名（留空自动推导）', m.packageName, 'text')
          + inputHtml('command', '进度查询命令名', m.command, 'text')
          + '</div>';
        html += '<div class="row">'
          + inputHtml('author', '作者', m.author, 'text')
          + inputHtml('version', '插件版本号', m.version || '1.0.0', 'text')
          + '</div>';
        html += '<div class="row">'
          + inputHtml('packFormat', '数据包格式版本（1.21.11 = 94）', String(m.packFormat), 'number')
          + inputHtml('autosaveSeconds', '计数自动保存间隔（秒）', String(m.autosaveSeconds), 'number', ' min="30"')
          + '</div>';
        html += '<div class="row">'
          + inputHtml('announceFormat', '播报格式（%player%/%name%，留空不播报）', m.announceFormat, 'text')
          + '</div>';
        html += '<div class="checks"><label><input type="checkbox" data-k="sound"' + (m.sound !== false ? ' checked' : '') + '/>达成时播放升级音效</label></div>';
        html += '</fieldset><button id="btnBack">← 返回</button>';
        $('panel').innerHTML = html;
        Array.prototype.forEach.call($('panel').querySelectorAll('[data-k]'), function (el) {
          el.onchange = function () {
            var k = el.getAttribute('data-k');
            if (k === 'sound') { m.sound = el.checked; }
            else if (k === 'autosaveSeconds' || k === 'packFormat') { m[k] = parseInt(el.value, 10) || 0; }
            else { m[k] = el.value; }
            rebuildCode();
            renderIssues();
          };
        });
        $('btnBack').onclick = function () { S.settings = false; render(); };
      }

      function renderIssues() {
        var a = S.analysis;
        var html = '';
        a.errors.forEach(function (i) { html += '<div class="issue error" data-n="' + esc(i.nodeId || '') + '">✗ ' + esc(i.msg) + '</div>'; });
        a.warnings.forEach(function (i) { html += '<div class="issue warn" data-n="' + esc(i.nodeId || '') + '">⚠ ' + esc(i.msg) + '</div>'; });
        if (!html) { html = '<div class="issue ok">✓ 校验通过，可以导出</div>'; }
        $('issues').innerHTML = html;
        $('btnExport').disabled = a.errors.length > 0;
        Array.prototype.forEach.call($('issues').querySelectorAll('[data-n]'), function (el) {
          var nid = el.getAttribute('data-n');
          if (!nid) { return; }
          el.onclick = function () {
            if (findNode(nid)) { S.settings = false; S.sel = { id: nid, type: 'node' }; render(); }
          };
        });
      }

      function exportZipFile() {
        save().then(function () {
          var result = CORE.exportZip(S.code);
          if (!result.ok) {
            setStatus('导出失败：' + (result.errors[0] ? result.errors[0].msg : '未知错误'));
            return;
          }
          var blob = new Blob([result.bytes], { type: 'application/zip' });
          var url = URL.createObjectURL(blob);
          var link = document.createElement('a');
          link.href = url;
          link.download = result.filename;
          link.click();
          setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
          setStatus('已导出 ' + result.filename + '（' + result.files.length + ' 个文件）');
        });
      }

      function b64ToBytes(b64) {
        var bin = atob(b64);
        var out = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) { out[i] = bin.charCodeAt(i); }
        return out;
      }

      function exportJarFile() {
        var btn = $('btnJar');
        if (btn.disabled) {
          return; // 编译进行中，防连点
        }
        btn.disabled = true;
        setStatus('正在编译（调用本机 JDK）…');
        var done = function (msg) {
          setStatus(msg);
          btn.disabled = false;
        };
        save().then(function () {
          var request = CORE.buildJarRequest(S.code);
          if (!request.ok) {
            done('无法编译：' + (request.errors[0] ? request.errors[0].msg : '未知错误'));
            return;
          }
          tool('mc_build', { filename: request.filename, files: request.files }, 90000).then(function (text) {
            var payload = JSON.parse(text);
            var blob = new Blob([b64ToBytes(payload.jarBase64)], { type: 'application/java-archive' });
            var url = URL.createObjectURL(blob);
            var link = document.createElement('a');
            link.href = url;
            link.download = payload.filename;
            link.click();
            setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
            done('已编译并导出 ' + payload.filename + '（' + (payload.jdkVersion || '') + '）——直接放入服务器 plugins/ 即可');
          }).catch(function (error) {
            var msg = String(error && error.message ? error.message : error);
            if (/JDK|Java|javac/i.test(msg)) {
              done(msg + ' ［提示：编译功能要求您自行安装 JDK 21+（如 Eclipse Temurin），本应用不捆绑 Java］');
            } else {
              done('编译失败：' + msg);
            }
          });
        });
      }

      $('btnReload').onclick = load;
      $('btnSave').onclick = save;
      $('btnExport').onclick = exportZipFile;
      $('btnJar').onclick = exportJarFile;
      $('btnStarter').onclick = function () {
        if (!confirm('用示例成就图替换当前图表内容？')) { return; }
        tool('set_code', { code: CORE.starterCode() }).then(load);
      };
      // 设置入口放在 header 最右
      (function () {
        var btn = document.createElement('button');
        btn.textContent = '插件设置';
        btn.onclick = function () { S.settings = true; render(); };
        document.querySelector('header').insertBefore(btn, $('status'));
      })();
      // 图标 datalist
      $('icons').innerHTML = CORE.ICON_SUGGESTIONS.map(function (i) { return '<option value="' + i + '"></option>'; }).join('');

      call('initialize', {}).then(function (info) {
        // 桌面版（capabilities.experimental['flow-editor/mcBuild']）才显示编译按钮
        var caps = info && info.capabilities && info.capabilities.experimental;
        if (caps && caps['flow-editor/mcBuild'] === true) {
          S.mcBuild = true;
          $('btnJar').style.display = '';
          $('btnJar').title = '桌面版离线编译为可安装的 .jar（需要本机自装 JDK 21+）';
        }
        return load();
      });
    </script>
  </body>
</html>`;

const FRONTEND_URL = `data:text/html;charset=utf-8,${encodeURIComponent(FRONTEND_HTML)}`;

/** @satisfies {import('../flow-plugin.d.ts').FlowPlugin} */
export default {
  description:
    '把流程图变成 Paper 成就插件：节点=成就、连线=承接、形状=框架类型、连通分量=成就栏；' +
    '元数据（触发方式/图标/奖励等）存于 frontmatter 并经前端面板编辑；一键导出 Maven 工程 zip；' +
    '打开 zip 可逆向导入回图表（自家导出完整还原，外部数据包尽力还原）；' +
    '桌面版还可离线编译为可安装的 .jar（内置 Paper 编译工具链，需本机自装 JDK 21+，应用不捆绑 Java）。',
  export: {
    id: 'mc-plugin',
    label: 'MC 成就插件（Maven 工程 .zip）',
    run({ code }, ctx) {
      const result = CORE.exportZip(code);
      if (!result.ok) {
        const first = result.errors[0]?.msg ?? '图表不符合成就图结构';
        ctx.notify(
          `无法导出 MC 插件：${first}${result.errors.length > 1 ? `（另有 ${result.errors.length - 1} 个问题，详见设计器面板）` : ''}`
        );
        return undefined;
      }
      ctx.notify(
        `已生成 ${result.filename}：${result.analysis.tabs.length} 个成就栏 / ${result.analysis.nodes.length} 个成就 / ${result.files.length} 个文件`
      );
      return {
        blob: new Blob([result.bytes], { type: 'application/zip' }),
        filename: result.filename,
        mime: 'application/zip'
      };
    }
  },
  frontend: {
    sandbox:
      'allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals',
    url: FRONTEND_URL
  },
  // 逆向导入：接管 .zip（数据包布局或本插件导出的 Maven 工程）；非成就
  // 数据包返回 undefined 放行给内置解析器。需要宿主提供 bytes（2.0.132+）。
  import: {
    async import(file, ctx) {
      if (!file.bytes) {
        return undefined; // 旧宿主只给文本通道，二进制无法可靠承载
      }
      try {
        const result = await CORE.importDatapackZip(file.bytes);
        if (!result) {
          return undefined;
        }
        for (const warning of result.warnings) {
          ctx.notify(`导入提示：${warning}`);
        }
        return { code: result.code };
      } catch {
        return undefined;
      }
    },
    extensions: ['zip'],
    name: 'MC 数据包 / Maven 工程（.zip）'
  },
  id: 'flow.mc-advancement',
  name: 'MC 进度设计器',
  permissions: ['import:file', 'export:format', 'ui:frontend'],
  version: '1.4.0'
};

// 单测钩子（不改变插件运行时行为）
export const _core = CORE;
