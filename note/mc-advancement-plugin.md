# MC 进度设计器插件（mc-advancement）设计文档

> 版本：2.0.129 引入（2.0.130 离线编译、2.0.131 持续优化循环）｜插件文件：[`plugins/examples/mc-advancement.mjs`](../plugins/examples/mc-advancement.mjs)
> 2.0.130：桌面版内置离线编译链（导出即 `.jar`，无需 Maven）；JDK 21+ 由用户自装（版权红线）
> 目标：在 Flow 编辑器里**画一张流程图，就能一键导出一个完整可编译的 Paper 成就插件**
> （Maven 工程 zip，含内置数据包 + 事件监听器 + 进度持久化 + 命令）；
> 桌面版更进一步：**一键产出可直接装入服务器的 .jar**（见 §9）。
> 参照工程：[`REF/Minecraft-Achievement-plugin`](../REF/Minecraft-Achievement-plugin/)
> （Java 21 + Paper 1.21.11，paper-plugin.yml + bootstrapper 注册内置数据包）。

## 1. 总体架构

```
flowchart（画布/代码编辑）                插件前端（frontend hook）             导出（export hook / 前端按钮）
┌──────────────────────┐   桥 get_code   ┌────────────────────────┐            ┌──────────────────────────┐
│ 节点 = 成就           │ ────────────▶ │ 属性面板：触发器/图标/   │            │ 校验 → 生成 8 类文件：     │
│ 边   = 承接(parent)   │               │ 描述/框架/隐藏/奖励      │            │ pom.xml / paper-plugin.  │
│ 形状 = 框架类型        │ ◀──────────── │ 成就栏管理 / 校验报告    │            │ yml / config.yml /       │
│ 连通分量 = 成就栏      │   桥 set_code  │ （不复制画布，结构编辑   │            │ pack.mcmeta / 成就 JSON  │
│ frontmatter = 元数据   │               │  仍回主界面画布完成）    │            │ / Java × 7 → zip 下载    │
└──────────────────────┘                └────────────────────────┘            └──────────────────────────┘
        ▲ 唯一真相源 = 图表代码（frontmatter 内嵌元数据），URL 分享/History/localStorage 自动继承
```

三条架构红线（与项目既有约束对齐）：

1. **代码是唯一真相源**：成就结构与全部元数据都存进图表代码（frontmatter），
   不写插件 storage——URL 分享链接即完整工程，History 60s 快照自动兜底。
2. **单一事实源不重复**：成就名称只取节点标签、框架类型只取节点形状、承接
   关系只取边；frontmatter 里不冗余这些字段（避免双写不一致）。
3. **前端面板不复制画布**：结构编辑（增删成就、连线）交给主界面可视化画布
   （已有多选/撤销/对齐/自动布局全套交互）；插件前端只做**元数据编辑、
   校验、导出**，经桥 `get_code`/`set_code` 双向同步。

## 2. 图 ↔ 成就映射规则

| 图中元素               | MC 概念                               | 说明                                              |
| ---------------------- | ------------------------------------- | ------------------------------------------------- |
| 节点                   | 进度（advancement）                   | 节点 id 规范化为 `[a-z0-9_]` 作为进度 id 与文件名 |
| 节点标签               | 进度标题 `display.title`              | 画布双击即可改名                                  |
| 边 `A --> B`           | 承接关系 `B.parent = A`               | 虚线/直线等同箭头（MC 只有 parent 一种语义）      |
| 形状 矩形 `[x]`        | `frame: task`（任务，默认）           | 画布「形状」按钮直接循环                          |
| 形状 圆角 `(x)`        | `frame: goal`（目标）                 |                                                   |
| 形状 菱形 `{x}`        | `frame: challenge`（挑战）            |                                                   |
| 形状 胶囊 `([x])`      | 等价 task（前端面板显示「任务」）     |                                                   |
| **无入边节点**         | **成就栏根进度（root = 标签页本身）** | 与 REF 一致：root 的标题即栏名                    |
| **连通分量**           | **成就栏（tab）**                     | 一张图里画 N 个不连通的树 = 单插件 N 个成就栏     |
| frontmatter `mcadv` 键 | 全部元数据（插件级/栏级/成就级）      | JSON 写法（YAML 子集，mermaid 实测兼容）          |

### 2.1 多成就栏（单个插件多个标签页）

原版机制：数据包中每个无 `parent` 的根进度自动形成一个标签页（root 的
`criteria` 用 `minecraft:tick` 自动授予，保证标签页对所有玩家可见）。
因此本插件**天然支持多成就栏**：

- 图按连通分量分组，每组必须**恰有一个**无入边节点作为该栏的根进度
  （多于一个 → 校验报错列出候选；零个（环）→ 报错）；
- 每个连通分量生成一个 root advancement JSON（`criteria: tick`，
  `show_toast/announce_to_chat: false`，`background` 纹理必填——否则
  标签页背景为紫黑棋盘）；
- 栏级元数据（栏描述/图标/背景纹理/是否生成「大满贯」汇总成就）存于
  frontmatter `tabs.<根节点id>`。

### 2.2 frontmatter 元数据格式（`mcadv` 键，JSON）

实测 mermaid 对 frontmatter 用 YAML 解析，**JSON 是 YAML 子集**，自定义
嵌套键被忽略、不影响解析与渲染（探针脚本验证通过；未加引号的
`我的成就: 第一章` 这类值在 YAML 写法下会炸，JSON 写法无此问题）——
故元数据统一用 JSON 写在 `--- … ---` 块内：

```jsonc
---
{
  "mcadv": {
    "plugin": "MyAchievements",        // 插件名（paper-plugin.yml / jar 名）
    "namespace": "myach",              // 数据包命名空间 [a-z0-9_]
    "author": "Zurker",                // authors
    "package": "dev.floweditor.myach", // Java 包名（缺省按 namespace 推导）
    "command": "myach",                // 进度查询命令名（/myach，自动生成 grant 子命令）
    "autosaveSeconds": 300,            // 计数落盘间隔
    "packFormat": 94,                  // 数据包 min/max_format（1.21.11 = 94）
    "announceFormat": "[成就] %player% 达成了 [%name%]",  // 播报格式（空串=不覆盖原版播报）
    "sound": true,                     // 达成时播放升级音效
    "tabs": {                          // 栏级元数据，键 = 根节点 id
      "root": {
        "desc": "…",                   // 栏描述（标题取根节点标签）
        "icon": "minecraft:nether_star",
        "background": "minecraft:textures/block/deepslate_tiles.png",
        "completionist": true,         // 是否自动生成「大满贯」汇总成就
        "completionistName": "大满贯！",
        "completionistDesc": "解锁本栏所有其他成就",
        "completionistIcon": "minecraft:dragon_egg",
        "completionistXp": 100
      }
    },
    "nodes": {                         // 成就级元数据，键 = 节点 id
      "first_join": {
        "desc": "第一次加入服务器",      // display.description
        "icon": "minecraft:compass",   // display.icon.id
        "trigger": "join",             // 触发方式（见 §3）
        "params": {},                  // 触发器参数（按 §3 各触发器规格）
        "hidden": false,               // display.hidden（完成前不显示）
        "toast": true,                 // show_toast
        "announce": true,              // 达成时是否播报（走 announceFormat）
        "xp": 0                        // rewards.experience（>0 才输出 rewards）
      }
    }
  }
}
---
flowchart TD
    root["示例成就"] --> first_join["你好，世界！"]
```

缺省补全：`desc` 缺省用触发器默认描述模板；`icon` 缺省按框架类型
（task→book / goal→compass / challenge→dragon_egg）；`trigger` 缺省
`manual`（仅命令授予）；`tabs` 缺省整栏缺省值。**画布编辑（拖节点、
改标签、换形状）不触碰 frontmatter**——可视化编辑器逐字节保留它
（`splitFrontmatter`，model.ts），元数据零丢失。

## 3. 触发方式注册表（30 种，对照 Paper/Bukkit API）

成就 JSON 的 criteria 一律用 `minecraft:impossible`（原版永不触发），由
导出的 Java 监听器按触发方式授予（`AdvancementProgress#awardCriteria`）——
REF 已验证此模式。触发器表同时驱动：前端下拉（**六类 optgroup 分组**）与
参数表单、config.yml 键、Java 事件方法生成（**只生成用到的触发器分支**）。

| #   | trigger id         | 名称               | 参数（config.yml 可改）                                                | Paper/Bukkit 事件                                            | 计数 |
| --- | ------------------ | ------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------ | ---- |
| 1   | `join`             | 加入服务器         | `firstOnly`（默认 true，`!hasPlayedBefore`）                           | `PlayerJoinEvent`                                            | 否   |
| 2   | `break_block`      | 挖掘方块           | `material`（空=任意）、`amount`                                        | `BlockBreakEvent`（ignoreCancelled）                         | 是   |
| 3   | `place_block`      | 放置方块           | `material`、`amount`                                                   | `BlockPlaceEvent`（ignoreCancelled）                         | 是   |
| 4   | `consume`          | 食用/饮用          | `item`（空=任意）、`amount`                                            | `PlayerItemConsumeEvent`（ignoreCancelled）                  | 是   |
| 5   | `kill`             | 击杀生物           | `entity`（空=任意，`hostile`=敌对类）、`amount`                        | `EntityDeathEvent`（killer 判空）                            | 是   |
| 6   | `fish`             | 钓鱼               | `amount`                                                               | `PlayerFishEvent`（`State.CAUGHT_FISH`）                     | 是   |
| 7   | `reach_height`     | 到达高度           | `y`（允许负值，below 模式）、`mode`（above/below）                     | `PlayerMoveEvent`（节流：每玩家 5 tick 判一次）              | 否   |
| 8   | `craft`            | 合成物品           | `item`（空=任意）、`amount`                                            | `CraftItemEvent`（ignoreCancelled，按取出数量累计）          | 是   |
| 9   | `enchant`          | 附魔               | `amount`                                                               | `EnchantItemEvent`                                           | 是   |
| 10  | `trade`            | 与村民交易         | `amount`                                                               | `PlayerTradeEvent`（ignoreCancelled）                        | 是   |
| 11  | `tame`             | 驯服生物           | `entity`（空=任意）、`amount`                                          | `EntityTameEvent`（owner 为玩家）                            | 是   |
| 12  | `breed`            | 繁殖动物           | `entity`（空=任意）、`amount`                                          | `EntityBreedEvent`（breeder 为玩家）                         | 是   |
| 13  | `sleep`            | 入睡               | `amount`                                                               | `PlayerDeepSleepEvent`                                       | 是   |
| 14  | `death`            | 死亡               | `amount`                                                               | `PlayerDeathEvent`                                           | 是   |
| 15  | `reach_level`      | 经验等级达标       | `level`                                                                | `PlayerLevelChangeEvent`                                     | 否   |
| 16  | `pickup`           | 拾取物品           | `item`（空=任意）、`amount`                                            | `EntityPickupItemEvent`（按堆叠数量累计）                    | 是   |
| 17  | `chat_keyword`     | 聊天含关键词       | `keyword`                                                              | `AsyncChatEvent`（PlainTextComponentSerializer 提取）        | 否   |
| 18  | `advancement_done` | 完成原版进度       | `key`（任意命名空间，含本插件进度）                                    | `PlayerAdvancementDoneEvent`（key 匹配，先于本插件分支判定） | 否   |
| 19  | `playtime`         | 累计在线时长       | `minutes`                                                              | 定时轮询 `Statistic.PLAY_ONE_MINUTE`（tick/20/60）           | 统计 |
| 20  | `statistic`        | 原版统计达标       | `stat`（如 `walk_one_cm`）、`target`（可空 material/entity）、`amount` | 定时轮询 `Player#getStatistic`                               | 统计 |
| 21  | `shear`            | 剪羊毛             | `entity`（空=任意）、`amount`                                          | `PlayerShearEntityEvent`（ignoreCancelled）                  | 是   |
| 22  | `ride`             | 骑乘生物           | `entity`（空=任意）                                                    | `EntityMountEvent`（getEntity 为玩家）                       | 否   |
| 23  | `portal`           | 进入传送门         | —                                                                      | `EntityPortalEnterEvent`                                     | 否   |
| 24  | `damage_taken`     | 累计受伤           | `amount`                                                               | `EntityDamageEvent`（ignoreCancelled）                       | 是   |
| 25  | `projectile_hit`   | 弹射物命中         | `amount`                                                               | `ProjectileHitEvent`（命中实体 + shooter 为玩家）            | 是   |
| 26  | `glide`            | 开始滑翔           | —                                                                      | `EntityToggleGlideEvent`（isGliding）                        | 否   |
| 27  | `swim`             | 开始游泳           | —                                                                      | `EntityToggleSwimEvent`（isSwimming）                        | 否   |
| 28  | `bucket_fill`      | 装桶               | `amount`                                                               | `PlayerBucketFillEvent`（ignoreCancelled）                   | 是   |
| 29  | `xp_gain`          | 获得经验           | `amount`（经验值总量，负变动不计）                                     | `PlayerExpChangeEvent`（getAmount>0 按量累计）               | 是   |
| 30  | `manual`           | 仅命令授予（默认） | —                                                                      | 无事件；`/<command> grant <玩家> <成就id>`（op 权限）        | 否   |

设计要点：

- **计数类**统一走 `ProgressStore.increment(player, key) -> int`（泛化自
  REF 的固定方法），`amount` 全部进 `config.yml`（`thresholds.<成就id>`），
  服务器管理员可调；监听器启动时读取。
- **统计类**（playtime/statistic）生成一个 `runTaskTimer`（20s）轮询在线
  玩家，直接用原版统计值判定——无需自行持久化；`statistic` 的
  `target` 决定调用 `getStatistic(Stat, Material|EntityType)` 重载。
- **高频事件**（reach_height 的 PlayerMoveEvent）按 REF 要点④的告诫做
  每玩家 tick 节流（`lastCheckTick` 记忆，5 tick 一次浮点比较）。
- **敌对生物判定**（kill 的 `hostile`）沿用 REF 的 `instanceof Enemy`。
- **material/entity/item 名**：大小写不敏感，生成 Java 时
  `Material.matchMaterial` / `NamespacedKey` 解析，无法解析时按
  「匹配任意」降级并在 onEnable 打 warning（不炸插件）。

## 4. 前端面板（frontend hook，data: 内嵌单页）

整页 iframe（插件声明 `sandbox: "… allow-downloads"`，2.0.129 起 edit 页
透传该属性）。页面结构：

- **顶栏**：插件级设置（插件名/命名空间/包名/命令/作者/自动保存/
  packFormat/播报格式/音效）＋「重新读取」「写回编辑器」「导出插件 zip」
  三个主按钮；校验徽章（错误红/警告黄/通过绿）。
- **左栏——成就栏与树**：按连通分量列出全部成就栏（栏名=根节点标签），
  树形缩进展示承接关系；点选成就进右栏编辑；「新增成就」「新增成就栏」
  按钮（生成合法 id 并写回）。
- **右栏——属性表单**（选中成就后）：id（可改，级联重写边与元数据引用）、
  名称（写回节点标签）、描述、图标（自由输入 + 常用 datalist）、框架
  （下拉：任务/目标/挑战 ↔ 形状 rect/round/diamond，双向同步）、父成就
  （下拉改挂 = 重写边）、隐藏/toast/播报开关、触发器下拉 + **按 §3 动态
  生成的参数表单**（数量/物品/生物/高度/关键词等）、奖励经验。
- **栏设置**：选中栏时右栏显示栏描述/图标/背景纹理/大满贯开关与其
  名称、描述、图标、经验。
- **校验面板**：错误/警告逐条列出，点击定位到对应成就。

数据流：`get_code` → 解析（frontmatter + flowchart）→ 编辑内存模型 →
「写回编辑器」重新生成完整代码（frontmatter JSON + 规范 flowchart 文本）
→ `set_code` 经状态网关回写。打开前端时自动读取一次；写回与导出前
强制重新读取（若编辑器侧代码被外部改动则以编辑器为准并提示）。

## 5. 导出产物（zip 结构）

导出菜单项「MC 成就插件（Maven 工程 .zip）」或前端「导出插件 zip」，
产物以**插件名**为根目录、store 模式 zip（无压缩，零依赖 ~100 行
CRC32+头拼接；Java 源码与 JSON 为文本，压缩无意义）：

```
MyAchievements/
├── pom.xml                          # paper-api 1.21.11-SNAPSHOT provided、release 21
├── README.md                        # 构建/安装/成就清单（自动生成）
└── src/main/
    ├── resources/
    │   ├── paper-plugin.yml         # name/main/bootstrapper/api-version '1.21'
    │   ├── config.yml               # thresholds.<成就id> / autosave / 播报
    │   └── datapack/
    │       ├── pack.mcmeta          # min_format/max_format = packFormat
    │       └── data/<namespace>/advancement/
    │           ├── <根id>.json       # 每栏一个：criteria tick、background 必填
    │           ├── <成就id>.json …   # criteria impossible、parent、display、rewards
    │           └── <根id>_completionist.json  # 大满贯（N 条件 + requirements + xp）
    └── java/<包路径>/
        ├── <Plugin>Plugin.java       # 主类：装配/命令/定时统计轮询/落盘
        ├── <Plugin>Bootstrap.java    # DATAPACK_DISCOVERY 注册内置数据包
        ├── Achievement.java          # 枚举（id/显示名/栏/listed），动态项
        ├── AchievementService.java   # isDone/award/awardCriterion（同 REF）
        ├── AchievementListener.java  # 只含用到的触发器分支 + 播报/音效
        ├── ProgressStore.java        # increment(player,key) 泛化 + 定时落盘
        └── <Plugin>Command.java      # /<cmd> 进度查询 + grant 子命令
```

与 REF 的实现差异（泛化点）：

| REF（固定示例）              | 本插件导出（生成器泛化）                            |
| ---------------------------- | --------------------------------------------------- |
| 单成就栏 `exampleach`        | 任意多栏（连通分量推导），命名空间可配              |
| 6 种硬编码触发               | 30 种触发器注册表，按需生成监听器分支               |
| `ProgressStore` 固定计数方法 | `increment/查询` 按 key 泛化，YAML 同构             |
| 阈值 config 固定键           | `thresholds.<成就id>.<参数>` 全量生成               |
| `/exampleach` 仅查询         | `/<cmd>` 查询 + `/<cmd> grant`（manual 触发与补授） |
| 单个大满贯                   | 每栏可选大满贯（条件 = 栏内全部非根成就）           |

## 6. 导出前校验（前端实时 + 导出阻断）

**错误**（阻断导出）：图类型非 flowchart；无节点；存在环（DFS 报出环上
节点）；某连通分量零根（纯环分量）或多根（列出候选）；节点 id 规范化后
冲突（两个节点映射到同一进度 id）；namespace/包名/命令名非法字符；
成就 id 与保留名冲突（`root` 以外与栏根同 tab 内重名）；触发器参数缺失
（如 chat_keyword 无 keyword）或非法（amount<1、y 非整数）。

**警告**（可导出）：frontmatter 引用了不存在的节点 id（孤儿元数据，忽略）；
图标/材质/生物 ID 无法识别（服务端按「任意」降级并告警）；大满贯开启但
栏内无非根成就（跳过生成）；成就缺描述（用触发器模板补）；节点标签为空
（用 id 补）；边标签存在（MC 无此语义，忽略）；completionist 命名冲突
自动加后缀。

## 7. 测试与验证

- 单测（`src/lib/plugins/mcAdvancement.example.test.ts`，动态 import
  `.mjs` 取 `_core`）：
  - flowchart 解析（可视化编辑器真实输出形态 + 手写链式/分号/注释形态）；
  - frontmatter 读写往返；id 规范化与冲突；环/多根/无根校验；
  - 成就 JSON 逐字段（parent/frame/hidden/rewards/tick root/background）；
  - 触发器→config.yml 键与 Java 监听器分支生成（30 种全量经 test-mc-build 真实 javac 编译验证）；
  - zip 结构解析校验（EOCD/中央目录/条目数/CRC 与内容逐字节一致）；
  - **与可视化编辑器模型互操作**：`parseFlow(generateCode(graph))` 对齐
    `model.ts` 的 `parseCode` 结果（防解析方言漂移）。
- 工程级冒烟：导出 zip 解包后 `mvn -q compile`（本机 JDK25 + Maven 可用，
  paper-api 走 provided 依赖，需联网拉一次依赖——本机 REF 工程已有本地
  仓库缓存）。
- e2e 可选：安装插件 → 导出菜单出现 → 点击得到下载事件（plugins.spec.ts 已有同款模式）。

## 8. 明确不做（通道 C）

- ~~物品/配方/自定义战利品表内容编辑~~ → **2.0.134 已实现条目化战利品
  奖励**（物品+数量区间+权重 → 自动生成 loot_table 与发放函数，见 §12）；
  仍不做：任意 loot table JSON 原文编辑（条件/附魔函数等属数据包工程范畴）。
- 服务端侧本地化文件（成就名硬编码中文，与 REF 一致）。
- Spigot 兼容（paper-plugin.yml 为 Paper 专属，与 REF 取舍一致）。
- ~~导入既有数据包 zip 逆向成图~~ → **2.0.132 已实现**（见 §10）。

## 9. 桌面版离线编译链（2.0.130）

**目标**：导出即「可装入服务器的 .jar」，全程离线——不需要 Maven、不需要
联网拉依赖。网页版仍保留「导出 Maven 工程 zip + 自行 mvn package」路径。

### 9.1 链路

```
插件前端「编译导出 jar」
  → CORE.buildJarRequest(code)     # 只取 src/main/java + src/main/resources，
                                    # 并把 paper-plugin.yml 的 ${project.version}
                                    # 置换为实际版本（javac 路径没有 Maven 资源过滤）
  → 桥 tools/call mc_build          # bridge.ts；网页版返回「仅桌面版可用」
  → window.__FLOW_DESKTOP__.mcBuild # preload.cjs（contextBridge，仅此一个方法）
  → 主进程 mc-build.cjs：
      校验（路径白名单 ^src/main/(java|resources)/…，禁 .. 与绝对路径；
            条目数/单文件 1MB/总量 8MB 上限）
      → 定位 JDK（JAVA_HOME → Program Files 常见根（含 latest/jdk-XX 嵌套）
                  → scoop → PATH；要求 javac 与 jar 同目录配对的完整 JDK，
                    版本 ≥ 21；Oracle javapath shim 无 jar.exe 会被跳过）
      → javac -encoding UTF-8 --release 21 -cp toolchain/lib/*（@argfile）
      → 资源 staging 进 classes/ → jar --create 打包
      → base64 回传页面 → 前端 Blob 下载 <插件名>-<版本>.jar
```

### 9.2 工具链（installer/toolchain/，随安装包分发）

javac 实测得出的**最小 compile classpath** 共 12 个 jar（约 6.6MB）：
paper-api 2.7MB + guava 3MB + brigadier / bungeecord-chat / slf4j-api /
adventure-api·key·serializer-plain·logger-slf4j / examination-api·string /
jetbrains-annotations。由 `installer/scripts/fetch-toolchain.mjs` 拉取
（优先本机 ~/.m2 复制——构建机离线可用；缺失回退 repo.papermc.io），
`THIRD_PARTY_NOTICES.txt` 随包分发（许可证经各项目官方仓库/pom 原文核实：
GPL-3.0 / MIT / Apache-2.0 / BSD-3-Clause）。**不含任何 Mojang 代码或资产**
（paper-api 为纯 API 面）；**不含 JDK/JRE**。

### 9.3 版权红线：JDK 由用户自行安装

- 应用**不捆绑、不自动下载**任何 JDK/JRE（避免 Oracle/OpenJDK 发行版的
  再分发争议）；检测不到 JDK ≥ 21 时返回结构化错误
  （JDK_NOT_FOUND / JDK_TOO_OLD），前端展示引导文案
  「请您自行安装 JDK 21 或更高版本（如 Eclipse Temurin）」。
- 生成的插件 jar 以 `--release 21` 产出 Java 21 字节码（高版本 JDK 编译
  也保持 21 目标），与 REF 工程的 maven.compiler.release=21 一致。

### 9.4 安全面

- `mc_build` 也经 MCP HTTP 服务暴露（回环、默认关闭，与既有信任模型一致）。
- 渲染进程传入的一切仅作**数据**落盘（javac argfile + 源文件），永不以
  代码身份求值；spawn 全部参数数组、无 shell；工作目录为系统临时目录
  mkdtemp，用完即删。
- MCP 执行器超时从 15s 放宽到 60s（javac 冷编译在慢盘上可能超 15s）。
- 冒烟：`installer/scripts/test-mc-build.mjs`（Node 级：校验面 6 项 +
  真实编译 + jar 结构/版本置换断言，build.ps1 打包前必跑）；
  `smoke.mjs` 新增 mc_build 端到端探针（HTTP→页面桥→IPC→javac，无 JDK
  机器按引导文案跳过）。

## 10. 逆向导入（2.0.132）

「打开」接管 `.zip`：识别 **MC 数据包布局**（`pack.mcmeta` +
`data/<ns>/advancement/*.json`）或**本插件导出的 Maven 工程 zip**
（`src/main/resources/datapack/…`），反推为成就图代码。非数据包 zip
返回 undefined 放行给内置解析器。

**往返两级**：

- **自家导出 → 完整还原**：导出时在数据包根写入 `flow-editor.json`
  （`{mcadv}` 溯源元数据；Minecraft 忽略数据包根的未知文件）。导入时
  触发器/参数/栏设置/全局设置全部无损恢复（单测断言触发器 fish、
  参数 amount、版本号逐字段等价）。
- **外部数据包 → 尽力还原**：结构（parent 树）、名称/描述/图标/框架/
  隐藏/toast/经验奖励、栏背景从 advancement JSON 恢复；`impossible`
  条件无法反推触发方式 → 退化为「仅命令授予」；大满贯按「全部条件是
  同栏其他进度 id」启发式识别；多命名空间取最大者并提示。

**平台配套**（本功能暴露的通用缺口，属插件 API 能力扩展）：

- `import` 钩子现可 **async**（rejection 与同步异常同样走三振隔离）；
- `file.bytes`（原始 `Uint8Array`）随打开事件下发——zip 等二进制格式
  此前根本无法经文本通道无损进入插件（`fileIO.openTextFile` 改为
  arrayBuffer 读取 + 双通道下发）。

zip 解析在插件内自包含实现：中央目录遍历，store 条目直读、deflate 条目
走浏览器 `DecompressionStream('deflate-raw')`（自家导出为 store 模式，
任意压缩数据包亦可导入）。

安全：zip 条目按名白名单消费（只读 advancement/pack.mcmeta/
flow-editor.json），重建只产生文本代码进状态网关，无任何求值面。

## 11. subgraph 成就栏（2.0.133）

多成就栏的第二种（推荐的）表达方式：**subgraph 即成就栏**。

```mermaid
flowchart TD
    subgraph adv_main["冒险栏"]
        mine["挖矿达人"]
        mine --> fight["战斗狂人"]
    end
    subgraph life["生活栏"]
        cook["干饭人"]
    end
```

- 组 id = 栏根进度 id；组标题 = 栏名；**组内未连线的成员自动挂到根下**
  （subgraph 已表达归属，无需画线）；跨栏连线忽略并警告（进度不能跨栏
  承接）；未入 subgraph 的游离节点仍按连通分量成栏（与 §2.1 平铺方式
  完全兼容，可混用）。
- 写回/导出/逆向导入的产物自动带 subgraph 分组语法（栏根不渲染为普通
  节点——cluster 框即栏；组 id 参与的边不输出，见下）。
- 已知 mermaid 限制（真实浏览器踩坑）：subgraph id 同时作为内部节点或
  边端点时 parse 通过但渲染期 dagre 抛 `Setting root as parent of root
would create a cycle`（画布静默保留旧图）——生成侧已排除该形态；
  手写代码遇到此报错请检查组 id 是否被当作节点/连线使用。
- 主界面可视化画布（model.ts）对 subgraph 行按不支持跳过：画布编辑会把
  图平铺化显示，但 tab 语义经连通分量完整保留（边都在），不丢数据。

## 12. 战利品奖励（2.0.134）

成就达成时发放物品（`nodes.<id>.loot = [{item, min, max, weight?}]`）：

- 生成 `loot_table/<id>.json`（单池，条目 = 物品 + `minecraft:set_count`
  数量区间，可加权；表类型 `minecraft:chest`）与
  `function/<id>.mcfunction`（`loot give @p loot <ns>:<id>`）；
  成就 JSON 的 `rewards` 同时含 `experience`（若配置）与 `function`
  （**1.21 语义**：旧 `rewards.loot` 已移除，必须走函数）。
- 前端成就表单条目化编辑；逆向导入从 loot_table 反推条目（外部包）或走
  溯源元数据无损还原（自家导出）。
- 桌面编译链路径白名单含 `.mcfunction`（发放函数随 jar 打包）。
