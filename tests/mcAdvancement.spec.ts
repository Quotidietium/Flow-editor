import { expect, test } from './test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * MC 进度设计器插件的真实浏览器验收：安装 → 打开前端 → 初始化示例 →
 * 树/表单交互（改触发方式）→ 写回编辑器 → 导出 zip 下载。
 * 前端 iframe 内 confirm() 依赖插件声明的 allow-modals 沙箱能力。
 */
test.use({ viewport: { height: 1080, width: 1920 } });

const EXAMPLES = join(process.cwd(), 'plugins', 'examples');

// 2.0.138 起 MC 进度设计器为内置插件（默认安装）；管理器打开即见卡片。
// 文件安装同 id 插件的路径由 plugins.spec 覆盖（会被「已安装」拒绝）。
const installDesigner = async (page: import('@playwright/test').Page) => {
  await page.getByTestId('plugin-manager-open').click();
  await page.getByTestId('plugin-card-flow.mc-advancement').waitFor({ timeout: 10_000 });
};

test('MC 设计器前端：初始化示例 → 编辑触发器 → 写回编辑器', async ({ editPage, page }) => {
  await editPage.view.waitFor({ state: 'visible' });
  await installDesigner(page);

  // 前端 iframe 内的 confirm() 需要 allow-modals；接受所有确认框
  page.on('dialog', (dialog) => void dialog.accept());

  await page.getByRole('button', { name: /打开 MC 进度设计器/ }).click();
  // 管理器对话框退出动画完成前会拦截指针事件，等它真正卸载
  await expect(page.getByTestId('plugin-manager')).toHaveCount(0, { timeout: 10_000 });
  const frame = page.frameLocator('iframe[title="插件前端"]');
  await frame.getByText('MC 进度设计器').first().waitFor({ timeout: 10_000 });

  // 默认圣诞示例图不是成就图 → 校验面板有错误；初始化示例后应通过
  await frame.getByRole('button', { name: '初始化示例' }).click();
  await frame.getByText('🏆 示例成就').waitFor({ timeout: 10_000 });
  await expect(frame.locator('.node-row')).toHaveCount(2); // 你好，世界！/ 愚公移山
  await expect(frame.getByText('✓ 校验通过，可以导出')).toBeVisible();

  // 无障碍：树行键盘可达（聚焦后 Enter 即选中，不依赖鼠标）
  const firstRow = frame.locator('.node-row').first();
  await firstRow.focus();
  await firstRow.press('Enter');
  await expect(frame.getByText('成就属性')).toBeVisible(); // 键盘选中打开属性表单
  await expect(frame.locator('select[data-k="trigger"]')).toHaveValue('join');

  // 选中「愚公移山」，把触发方式改为钓鱼 + 加一条战利品奖励
  await frame.getByText('愚公移山').click();
  const triggerSelect = frame.locator('select[data-k="trigger"]');
  await expect(triggerSelect).toHaveValue('break_block');
  await triggerSelect.selectOption('fish');
  // 参数表单出现「累计数量」且默认 10
  await expect(frame.locator('input[data-p="amount"]')).toHaveValue('10');

  await frame.getByRole('button', { name: '+ 添加物品' }).click();
  await frame.locator('input[data-l="item"]').fill('minecraft:diamond');
  await frame.locator('input[data-l="max"]').fill('3');

  // 视觉样式：选一个填充色（生成 style 指令，仅影响显示）
  await frame.locator('input[data-k="styleFill"]').fill('#ffcc00');

  // 本地化：设置开启 → 成就表单出现英文输入 → 填英文名
  await frame.getByRole('button', { name: '插件设置' }).click();
  await frame.locator('select[data-k="localization"]').selectOption('on');
  await frame.getByRole('button', { name: '← 返回' }).click();
  await frame.getByText('愚公移山').click();
  await frame.locator('input[data-k="en"]').fill('Mountain Mover');

  // 写回编辑器：frontmatter 应带 fish 触发器、战利品条目、style 行与本地化
  await frame.getByRole('button', { name: '写回编辑器' }).click();
  await expect
    .poll(() => page.evaluate(() => window.__FLOW_EDITOR_STATE__?.().code ?? ''))
    .toContain('"trigger": "fish"');
  await expect
    .poll(() => page.evaluate(() => window.__FLOW_EDITOR_STATE__?.().code ?? ''))
    .toContain('"item": "minecraft:diamond"');
  await expect
    .poll(() => page.evaluate(() => window.__FLOW_EDITOR_STATE__?.().code ?? ''))
    .toContain('style block_breaker fill:#ffcc00');
  await expect
    .poll(() => page.evaluate(() => window.__FLOW_EDITOR_STATE__?.().code ?? ''))
    .toContain('"localization": "on"');
  await expect
    .poll(() => page.evaluate(() => window.__FLOW_EDITOR_STATE__?.().code ?? ''))
    .toContain('"en": "Mountain Mover"');

  // 退出前端，主界面预览渲染该流程图（frontmatter 不影响 mermaid）
  await page.getByTestId('plugin-frontend-exit').click();
  await expect(page.locator('#container')).toContainText('愚公移山', { timeout: 10_000 });
});

test('MC 设计器识别多成就栏图（两个连通分量 = 两个标签页）', async ({ editPage, page }) => {
  await editPage.view.waitFor({ state: 'visible' });
  await installDesigner(page);
  page.on('dialog', (dialog) => void dialog.accept());

  // 双栏成就图：两组互不相连的树
  await page.evaluate(async () => {
    await window.__FLOW_EDITOR_API__?.setCode(
      'flowchart TD\n r1[冒险栏]\n r1 --> mine[挖矿达人]\n r1 --> fight[战斗狂人]\n r2[生活栏]\n r2 --> cook[干饭人]\n'
    );
  });
  await expect
    .poll(() => page.evaluate(() => window.__FLOW_EDITOR_STATE__?.().code ?? ''))
    .toContain('r2[生活栏]');

  await page.getByRole('button', { name: /打开 MC 进度设计器/ }).click();
  await expect(page.getByTestId('plugin-manager')).toHaveCount(0, { timeout: 10_000 });
  const frame = page.frameLocator('iframe[title="插件前端"]');
  await frame.getByRole('button', { name: '重新读取' }).click();
  await frame.getByText('🏆 冒险栏').waitFor({ timeout: 10_000 });

  // 两个栏头 + 各自的成员计数徽章；校验通过
  await expect(frame.getByText('🏆 生活栏')).toBeVisible();
  await expect(frame.locator('.badge', { hasText: '2 成就' })).toBeVisible();
  await expect(frame.locator('.badge', { hasText: '1 成就' })).toBeVisible();
  await expect(frame.getByText('✓ 校验通过，可以导出')).toBeVisible();

  // 选中生活栏根节点 → 面板显示栏根形态（无触发器选择）
  await frame.getByText('🏆 生活栏').click();
  await expect(frame.getByText('栏根节点')).toBeVisible();
  await expect(frame.locator('select[data-k="trigger"]')).toHaveCount(0);

  // 树搜索过滤：输入关键词即时过滤节点行（大图找成就）
  await frame.locator('#treeSearch').fill('mine');
  await expect(frame.locator('.node-row')).toHaveCount(1);
  await expect(frame.locator('.node-row')).toContainText('挖矿达人');
  await frame.locator('#treeSearch').fill('fight');
  await expect(frame.locator('.node-row')).toHaveCount(1);
  await expect(frame.locator('.node-row')).toContainText('战斗狂人');
  await frame.locator('#treeSearch').fill('zzz-no-match');
  await expect(frame.locator('.node-row')).toHaveCount(0);
  await frame.locator('#treeSearch').fill('');
  await expect(frame.locator('.node-row')).toHaveCount(3);

  // 写回编辑器：成就栏输出为 subgraph 分组语法（2.0.133）
  await frame.getByRole('button', { name: '写回编辑器' }).click();
  await expect
    .poll(() => page.evaluate(() => window.__FLOW_EDITOR_STATE__?.().code ?? ''))
    .toContain('subgraph r1["冒险栏"]');
  const written = await page.evaluate(() => window.__FLOW_EDITOR_STATE__?.().code ?? '');
  expect(written).toContain('subgraph r2["生活栏"]');

  // 根节点改名：subgraph 组 id 必须跟随（改名后根掉出分组的缺陷已修）
  await frame.locator('input[data-k="id"]').fill('life_root');
  await frame.getByRole('button', { name: '写回编辑器' }).click();
  await expect
    .poll(() => page.evaluate(() => window.__FLOW_EDITOR_STATE__?.().code ?? ''))
    .toContain('subgraph life_root["生活栏"]');
  // 重新读取并写回：分组结构与成员计数保持（改名未破坏栏）
  await frame.getByRole('button', { name: '重新读取' }).click();
  await frame.getByText('🏆 生活栏').waitFor({ timeout: 10_000 });
  await expect(frame.locator('.badge', { hasText: '1 成就' })).toBeVisible();
  await expect(frame.getByText('✓ 校验通过，可以导出')).toBeVisible();

  // 过滤激活态下添加下级：过滤被清除、新节点立即可见
  await frame.locator('#treeSearch').fill('mine');
  await expect(frame.locator('.node-row')).toHaveCount(1);
  await frame.locator('.node-row').first().click();
  await frame.getByRole('button', { name: '+ 添加下级成就' }).click();
  await frame.getByText('新成就').first().waitFor({ timeout: 5000 });
});

test('MC 设计器：面板打开期间的外部修改受冲突保护', async ({ editPage, page }) => {
  await editPage.view.waitFor({ state: 'visible' });
  await installDesigner(page);
  // 单一 dialog 处理器：记录后接受（多处理器重复 accept 会抛 already handled）
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    void dialog.accept();
  });

  await page.getByRole('button', { name: /打开 MC 进度设计器/ }).click();
  await expect(page.getByTestId('plugin-manager')).toHaveCount(0, { timeout: 10_000 });
  const frame = page.frameLocator('iframe[title="插件前端"]');
  await frame.getByRole('button', { name: '初始化示例' }).click();
  await frame.getByText('🏆 示例成就').waitFor({ timeout: 10_000 });
  await frame.getByRole('button', { name: '写回编辑器' }).click();
  await expect
    .poll(() => page.evaluate(() => window.__FLOW_EDITOR_STATE__?.().code ?? ''))
    .toContain('示例成就');
  dialogs.length = 0; // 之前的初始化/同步确认不计入

  // 面板未关闭时主界面侧改了图表（画布编辑/粘贴链接同路径）
  await page.evaluate(async () => {
    await window.__FLOW_EDITOR_API__?.setCode('flowchart TD\n    ext[外部修改的新图]\n');
  });

  // 写回必须先弹出冲突确认（而非静默覆盖）
  await frame.getByRole('button', { name: '写回编辑器' }).click();
  await expect.poll(() => dialogs.length, { timeout: 10_000 }).toBeGreaterThan(0);
  expect(dialogs[0]).toContain('外部修改');
  await expect
    .poll(() => page.evaluate(() => window.__FLOW_EDITOR_STATE__?.().code ?? ''))
    .toContain('示例成就');
});

test('MC 插件 zip 经导出菜单一键下载', async ({ editPage, page }) => {
  await editPage.view.waitFor({ state: 'visible' });
  await installDesigner(page);
  page.on('dialog', (dialog) => void dialog.accept());

  // 先初始化示例成就图
  await page.getByRole('button', { name: /打开 MC 进度设计器/ }).click();
  await expect(page.getByTestId('plugin-manager')).toHaveCount(0, { timeout: 10_000 });
  const frame = page.frameLocator('iframe[title="插件前端"]');
  await frame.getByRole('button', { name: '初始化示例' }).click();
  await frame.getByText('🏆 示例成就').waitFor({ timeout: 10_000 });
  await frame.getByRole('button', { name: '写回编辑器' }).click();
  await expect
    .poll(() => page.evaluate(() => window.__FLOW_EDITOR_STATE__?.().code ?? ''))
    .toContain('mcadv');
  await page.getByTestId('plugin-frontend-exit').click();

  // 导出菜单 → MC 成就插件（Maven 工程 .zip）
  await editPage.ensureActionsOpen();
  await page.getByTestId('export-menu').click();
  const item = page.getByTestId('plugin-export-mc-plugin');
  await expect(item).toBeVisible();
  const dlPromise = page.waitForEvent('download');
  await item.click();
  const dl = await dlPromise;
  expect(dl.suggestedFilename()).toBe('MyAchievements.zip');
  const bytes = readFileSync((await dl.path()) as string);
  expect(bytes[0]).toBe(0x50); // PK zip 头
  expect(bytes[1]).toBe(0x4b);
  expect(bytes.length).toBeGreaterThan(5000);
});

// 与页面内 evaluate 相同的成就图源码（Node 侧用它生成导入样本 zip）
const ROUNDTRIP_CODE = [
  '---',
  '{"mcadv":{"plugin":"RoundTrip","namespace":"rt","command":"rt"}}',
  '---',
  'flowchart TD',
  '    rt_main["回环测试栏"]',
  '    rt_fish("钓鱼佬")',
  '    rt_main --> rt_fish'
].join('\n');

test('MC 设计器闭环：导出的 zip 可经「打开」逆向导入回图表', async ({ editPage, page }) => {
  test.setTimeout(60_000);
  await editPage.view.waitFor({ state: 'visible' });
  // 预热：全量顺序下 Vite 依赖预优化可能在本用例进行到一半时触发整页
  // reload（Execution context destroyed by navigation）——先主动重载一次，
  // 把冷启动重载吸收在本用例开头（既有 gotcha：cold-start reload warm-up）
  await page.reload();
  await page.locator('#view').waitFor({ state: 'visible' });
  await installDesigner(page);
  await page.getByTestId('plugin-manager').getByRole('button', { name: '关闭' }).click();
  await expect(page.getByTestId('plugin-manager')).toHaveCount(0, { timeout: 10_000 });
  page.on('dialog', (dialog) => void dialog.accept());

  // Node 侧用插件同一生成器产出 Maven 工程 zip（导出 UI 路径由上一用例覆盖；
  // 经 UI 下载会在 Chromium 留下未完成导航，阻塞本用例后续点击）
  const pluginSource = readFileSync(join(EXAMPLES, 'mc-advancement.mjs'), 'utf8');
  const mod = (await import(
    `data:text/javascript;base64,${Buffer.from(pluginSource, 'utf8').toString('base64')}`
  )) as unknown as { _core: { exportZip(code: string): { bytes: Uint8Array; ok: boolean } } };
  const exported = mod._core.exportZip(ROUNDTRIP_CODE);
  expect(exported.ok).toBe(true);
  const zipPath = join(process.cwd(), 'test-results', 'roundtrip.zip');
  writeFileSync(zipPath, exported.bytes);

  // 「打开」→ 插件 import 钩子接管 zip（真实 filechooser + bytes 通道）
  await editPage.ensureActionsOpen();
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('open-file').click();
  const fileChooser = await chooser;
  await fileChooser.setFiles(zipPath);

  // 结构与溯源元数据（插件名/命名空间）完整回来
  await expect
    .poll(() => page.evaluate(() => window.__FLOW_EDITOR_STATE__?.().code ?? ''), {
      timeout: 10_000
    })
    .toContain('rt_fish');
  const code = await page.evaluate(() => window.__FLOW_EDITOR_STATE__?.().code ?? '');
  expect(code).toContain('回环测试栏');
  expect(code).toContain('"plugin": "RoundTrip"'); // flow-editor.json 溯源还原
  expect(code).toContain('flowchart TD');
  // 全量顺序下系统负载高（autoSync 可能降级为 1s 批量渲染），放宽断言窗口
  await expect(page.locator('#container')).toContainText('回环测试栏', { timeout: 15_000 });
});

test.describe('窄视口', () => {
  test.use({ viewport: { height: 800, width: 768 } }); // md 断点：640-768 灰区修复后的桌面下限
  test('MC 设计器可用（768px 宽：树与属性面板可达）', async ({ editPage, page }) => {
    await editPage.view.waitFor({ state: 'visible' });
    await installDesigner(page);
    page.on('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: /打开 MC 进度设计器/ }).click();
    await expect(page.getByTestId('plugin-manager')).toHaveCount(0, { timeout: 10_000 });
    const frame = page.frameLocator('iframe[title="插件前端"]');
    await frame.getByRole('button', { name: '初始化示例' }).click();
    await frame.getByText('🏆 示例成就').waitFor({ timeout: 10_000 });
    // 树可见且不溢出视口；选中成就后属性表单在窄宽度下可滚动可达
    const tree = frame.locator('#tree');
    await expect(tree).toBeVisible();
    const box = await tree.boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect(box?.width).toBeLessThanOrEqual(320);
    await frame.getByText('愚公移山').click();
    await expect(frame.getByText('成就属性')).toBeVisible();
    await expect(frame.locator('select[data-k="trigger"]')).toBeVisible();
  });
});

test('MC 设计器：校验面板问题点击/键盘定位（循环 54/58）', async ({ editPage, page }) => {
  await editPage.view.waitFor({ state: 'visible' });
  await installDesigner(page);
  page.on('dialog', (dialog) => void dialog.accept());

  await page.getByRole('button', { name: /打开 MC 进度设计器/ }).click();
  await expect(page.getByTestId('plugin-manager')).toHaveCount(0, { timeout: 10_000 });
  const frame = page.frameLocator('iframe[title="插件前端"]');
  await frame.getByText('MC 进度设计器').first().waitFor({ timeout: 10_000 });

  // 初始化示例后校验通过（无 issue 可点）
  await frame.getByRole('button', { name: '初始化示例' }).click();
  await frame.getByText('✓ 校验通过，可以导出').waitFor({ timeout: 10_000 });

  // 设置命令为 kill → 出现原版命令遮蔽警告（设置级 scope）
  await frame.getByRole('button', { name: '插件设置' }).click();
  await frame.locator('input[data-k="command"]').fill('kill');
  await frame.locator('input[data-k="command"]').blur(); // 触发 onchange
  await frame.getByText('与原版命令同名').waitFor({ timeout: 5_000 });
  await frame.getByRole('button', { name: '← 返回' }).click();
  await expect(frame.getByText('成就属性')).toHaveCount(0); // 回到树视图

  // 点击警告 → 跳回设置表单（修复入口直达）
  await frame.getByText('与原版命令同名').click();
  await expect(frame.getByRole('button', { name: '← 返回' })).toBeVisible();

  // 改回合法命令 → 警告消失（不整页重渲也即时刷新）
  await frame.locator('input[data-k="command"]').fill('myach');
  await frame.locator('input[data-k="command"]').blur();
  await expect(frame.getByText('与原版命令同名')).toHaveCount(0, { timeout: 5_000 });
  await frame.getByRole('button', { name: '← 返回' }).click();

  // 再造一个设置级警告，验证键盘 Enter 同样触发定位
  await frame.getByRole('button', { name: '插件设置' }).click();
  await frame.locator('input[data-k="command"]').fill('tp');
  await frame.locator('input[data-k="command"]').blur();
  await frame.getByRole('button', { name: '← 返回' }).click();
  const issueRow = frame.locator('.issue.link', { hasText: '与原版命令同名' });
  await issueRow.focus();
  await issueRow.press('Enter');
  await expect(frame.getByRole('button', { name: '← 返回' })).toBeVisible();
});

test('MC 设计器：重新读取丢弃未写回修改前先确认（循环 64）', async ({ editPage, page }) => {
  await editPage.view.waitFor({ state: 'visible' });
  await installDesigner(page);

  // 记录 confirm 对话框（初始化示例与重新读取都会弹；区分靠消息文本）
  const confirms: string[] = [];
  page.on('dialog', (dialog) => {
    confirms.push(dialog.message());
    void dialog.accept();
  });

  await page.getByRole('button', { name: /打开 MC 进度设计器/ }).click();
  await expect(page.getByTestId('plugin-manager')).toHaveCount(0, { timeout: 10_000 });
  const frame = page.frameLocator('iframe[title="插件前端"]');
  await frame.getByText('MC 进度设计器').first().waitFor({ timeout: 10_000 });

  await frame.getByRole('button', { name: '初始化示例' }).click();
  await frame.getByText('✓ 校验通过，可以导出').waitFor({ timeout: 10_000 });

  // 面板内改一个字段（未写回编辑器）→ 重新读取必须先弹「丢弃修改」确认
  await frame.getByText('愚公移山').click();
  await frame.locator('input[data-k="desc"]').fill('未写回的描述修改');
  await frame.getByRole('button', { name: '重新读取' }).click();
  await expect.poll(() => confirms.some((m) => m.includes('未写回编辑器的修改'))).toBe(true);
  // 接受后确实重读：重新选中节点，描述已回到原始值（修改被丢弃）
  await frame.getByText('✓ 校验通过，可以导出').waitFor({ timeout: 5_000 });
  await frame.getByText('愚公移山').click();
  await expect(frame.locator('input[data-k="desc"]')).toBeVisible();
  await expect(frame.locator('input[data-k="desc"]')).not.toHaveValue('未写回的描述修改');
});

test('MC 设计器：节点 id 非法字符被闸门拦截（循环 67）', async ({ editPage, page }) => {
  await editPage.view.waitFor({ state: 'visible' });
  await installDesigner(page);
  page.on('dialog', (dialog) => void dialog.accept());

  await page.getByRole('button', { name: /打开 MC 进度设计器/ }).click();
  await expect(page.getByTestId('plugin-manager')).toHaveCount(0, { timeout: 10_000 });
  const frame = page.frameLocator('iframe[title="插件前端"]');
  await frame.getByText('MC 进度设计器').first().waitFor({ timeout: 10_000 });

  await frame.getByRole('button', { name: '初始化示例' }).click();
  await frame.getByText('✓ 校验通过，可以导出').waitFor({ timeout: 10_000 });

  // 选中节点，把 id 改成带空格的非法值 → 状态栏提示 + 代码不含该 id
  await frame.getByText('愚公移山').click();
  await frame.locator('input[data-k="id"]').fill('my ach');
  await frame.locator('input[data-k="id"]').blur();
  await expect(frame.locator('#status')).toContainText('非法字符');
  await expect
    .poll(() => page.evaluate(() => window.__FLOW_EDITOR_STATE__?.().code ?? ''))
    .not.toContain('my ach');
  // 合法 id 仍可正常改名（级联更新）
  await frame.locator('input[data-k="id"]').fill('yugong');
  await frame.locator('input[data-k="id"]').blur();
  await frame.getByRole('button', { name: '写回编辑器' }).click();
  await expect
    .poll(() => page.evaluate(() => window.__FLOW_EDITOR_STATE__?.().code ?? ''))
    .toContain('yugong');
});

test('MC 插件 JAR 导出项：菜单可见，网页版点击给出桌面版引导（2.0.137）', async ({
  editPage,
  page
}) => {
  await editPage.view.waitFor({ state: 'visible' });
  await installDesigner(page);
  page.on('dialog', (dialog) => void dialog.accept());

  // 准备一张合法成就图（经设计器初始化示例并写回）
  await page.getByRole('button', { name: /打开 MC 进度设计器/ }).click();
  await expect(page.getByTestId('plugin-manager')).toHaveCount(0, { timeout: 10_000 });
  const frame = page.frameLocator('iframe[title="插件前端"]');
  await frame.getByRole('button', { name: '初始化示例' }).click();
  await frame.getByText('🏆 示例成就').waitFor({ timeout: 10_000 });
  await frame.getByRole('button', { name: '写回编辑器' }).click();
  await expect
    .poll(() => page.evaluate(() => window.__FLOW_EDITOR_STATE__?.().code ?? ''))
    .toContain('mcadv');
  await page.getByTestId('plugin-frontend-exit').click();

  // 导出菜单出现两个插件导出项（zip 在前保持原 testid，jar 新增）
  await editPage.ensureActionsOpen();
  await page.getByTestId('export-menu').click();
  await expect(page.getByTestId('plugin-export-mc-plugin')).toBeVisible();
  const jarItem = page.getByTestId('plugin-export-mc-plugin-jar');
  await expect(jarItem).toBeVisible();
  await expect(jarItem).toContainText('编译 .jar');

  // 网页版（Playwright 环境）没有桌面桥：点击 → 引导提示（不下载、不崩溃）
  await jarItem.click();
  await expect(page.getByText('仅在桌面版可用').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/mvn package/).first()).toBeVisible();
});

test('MC 进度设计器默认安装（内置，2.0.138）：徽章在册、无卸载按钮、可直接打开', async ({
  editPage,
  page
}) => {
  await editPage.view.waitFor({ state: 'visible' });
  await page.getByTestId('plugin-manager-open').click();
  const card = page.getByTestId('plugin-card-flow.mc-advancement');
  await card.waitFor({ timeout: 10_000 });
  // 内置徽章 + 无卸载按钮（两步确认入口不存在）
  await expect(card.getByText('内置', { exact: true })).toBeVisible();
  await expect(page.getByTestId('plugin-uninstall-flow.mc-advancement')).toHaveCount(0);
  // 详情页：同样无卸载、提示仅可停用
  await page.getByTestId('plugin-info-flow.mc-advancement').click();
  await expect(page.getByText('内置插件（仅可停用）')).toBeVisible();
  await expect(page.getByTestId('plugin-uninstall-flow.mc-advancement')).toHaveCount(0);
  // 无需任何安装动作即可打开设计器（内置默认启用）
  await page.getByRole('button', { name: /打开 MC 进度设计器/ }).click();
  await expect(page.getByTestId('plugin-manager')).toHaveCount(0, { timeout: 10_000 });
  const frame = page.frameLocator('iframe[title="插件前端"]');
  await frame.getByText('MC 进度设计器').first().waitFor({ timeout: 10_000 });
  await page.getByTestId('plugin-frontend-exit').click();
});
