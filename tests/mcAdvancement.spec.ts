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

const installDesigner = async (page: import('@playwright/test').Page) => {
  await page.getByTestId('plugin-manager-open').click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('plugin-install').click();
  const chooser = await chooserPromise;
  await chooser.setFiles(join(EXAMPLES, 'mc-advancement.mjs'));
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

  // 写回编辑器：frontmatter 应带 fish 触发器与战利品条目
  await frame.getByRole('button', { name: '写回编辑器' }).click();
  await expect
    .poll(() => page.evaluate(() => window.__FLOW_EDITOR_STATE__?.().code ?? ''))
    .toContain('"trigger": "fish"');
  await expect
    .poll(() => page.evaluate(() => window.__FLOW_EDITOR_STATE__?.().code ?? ''))
    .toContain('"item": "minecraft:diamond"');

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

  // 写回编辑器：成就栏输出为 subgraph 分组语法（2.0.133）
  await frame.getByRole('button', { name: '写回编辑器' }).click();
  await expect
    .poll(() => page.evaluate(() => window.__FLOW_EDITOR_STATE__?.().code ?? ''))
    .toContain('subgraph r1["冒险栏"]');
  const written = await page.evaluate(() => window.__FLOW_EDITOR_STATE__?.().code ?? '');
  expect(written).toContain('subgraph r2["生活栏"]');
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
