# ExampleAchievements

一个基于 **Java 21 + Paper 1.21.11** 的示例插件（Paper 插件，需
[paper-plugin.yml](https://docs.papermc.io/paper/dev/getting-started/paper-plugins/)，
不兼容 Spigot）：通过插件 jar 内置的数据包，在原版进度界面（Esc → 进度）中添加
一个**独立标签页**「示例成就」，成就由插件在游戏事件中自动授予。成就名称为
虚构，仅作演示。

## 构建

```bash
mvn package
# 产物: target/ExampleAchievements-1.0.0.jar
```

要求 JDK 21+（以 `--release 21` 产出 Java 21 字节码）。

## 安装

把 `target/ExampleAchievements-1.0.0.jar` 放入服务器的 `plugins/` 目录并重启。
数据包由插件 bootstrapper 在启动早期通过 Paper Datapack discovery API 自动注册
为 `ExampleAchievements/provided`，无需手动安装任何数据包；可用
`/datapack list enabled` 验证（应显示 `ExampleAchievements/provided (plugin)`）。

## 成就列表

| 成就             | 达成条件                        | 框架 |
| ---------------- | ------------------------------- | ---- |
| 你好，世界！     | 首次加入服务器                  | 任务 |
| 愚公移山         | 累计挖掘 200 个方块             | 目标 |
| 干饭人           | 累计进食 30 次                  | 任务 |
| 为民除害         | 击杀 30 只敌对生物              | 目标 |
| 姜太公再世       | 钓上 10 条鱼                    | 任务 |
| 平流层观光客     | 抵达 Y=300 高空                 | 目标 |
| 大满贯！（隐藏） | 集齐以上全部成就，奖励 100 经验 | 挑战 |

阈值可在 `plugins/ExampleAchievements/config.yml` 中调整。

## 命令

- `/exampleach`（别名 `/each`）：查看个人成就进度与各项计数。

## 实现原理（速览）

1. `paper-plugin.yml` 声明 `bootstrapper:`，`ExampleAchievementsBootstrap` 在
   启动早期通过 `LifecycleEvents.DATAPACK_DISCOVERY` 把 jar 内 `datapack/`
   目录注册为内置数据包（Paper 官方 Datapack discovery API；该事件只能由
   bootstrapper 注册，这也是采用 paper-plugin.yml 的原因）。
2. 数据包内 `exampleach:root` 为无 `parent` 的根进度，自动形成独立标签页；
   根进度用 `minecraft:tick` 自动授予，保证标签页可见。
3. 其余成就的 criteria 全部使用 `minecraft:impossible` 触发器（原版永不触发），
   由 `AchievementListener` 监听游戏事件并调用
   `AdvancementProgress#awardCriteria` 授予；"大满贯"以 6 个同名条件汇总。
4. 完成时通过 `PlayerAdvancementDoneEvent#message(Component)` 覆盖默认播报，
   输出中文消息并播放升级音效。
5. `/exampleach` 命令在 `LifecycleEvents.COMMANDS` 生命周期事件中以
   `BasicCommand` 形式注册。

已在 Paper 1.21.11（build 132）实测：成就全部加载（`Loaded 1592 advancements`），
数据包自动启用，命令注册成功。更多细节与踩坑记录见
[note/要点.md](note/要点.md)，版本记录见 [note/release/1.0.0.md](note/release/1.0.0.md)。

## 参考链接

- Paper Datapack discovery：<https://docs.papermc.io/paper/dev/lifecycle/datapacks/>
- Paper Lifecycle API：<https://docs.papermc.io/paper/dev/lifecycle/>
- Paper 插件（paper-plugin.yml）：<https://docs.papermc.io/paper/dev/getting-started/paper-plugins/>
- 进度定义格式：<https://minecraft.wiki/w/Advancement/JSON_format>
- 数据包 pack_format / min_format：<https://minecraft.wiki/w/Pack_format>
