import { expect, test } from './test';
import { readFileSync } from 'node:fs';
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

  // 选中「愚公移山」，把触发方式改为钓鱼
  await frame.getByText('愚公移山').click();
  const triggerSelect = frame.locator('select[data-k="trigger"]');
  await expect(triggerSelect).toHaveValue('break_block');
  await triggerSelect.selectOption('fish');
  // 参数表单出现「累计数量」且默认 10
  await expect(frame.locator('input[data-p="amount"]')).toHaveValue('10');

  // 写回编辑器：frontmatter 应带 fish 触发器
  await frame.getByRole('button', { name: '写回编辑器' }).click();
  await expect
    .poll(() => page.evaluate(() => window.__FLOW_EDITOR_STATE__?.().code ?? ''))
    .toContain('"trigger": "fish"');

  // 退出前端，主界面预览渲染该流程图（frontmatter 不影响 mermaid）
  await page.getByTestId('plugin-frontend-exit').click();
  await expect(page.locator('#container')).toContainText('愚公移山', { timeout: 10_000 });
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
