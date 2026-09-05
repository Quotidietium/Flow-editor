import { type Page } from '@playwright/test';
import { expect, test } from './test';

const openHistory = (page: Page) => page.getByRole('button', { name: '历史记录' }).click();

test.describe('历史版本与当前对比（循环 127）', () => {
  test('收藏当前 → 改代码 → 对话框展示行级差异与增删统计', async ({ page, editPage }) => {
    // 收藏默认图为「已保存」条目
    await openHistory(page);
    await page.getByRole('button', { name: '保存当前状态' }).click();
    await expect(page.locator('#historyList li')).toHaveCount(1);

    // 修改代码：整段替换（默认图 → 新图，无公共行）
    await page.evaluate((c) => navigator.clipboard.writeText(c), 'graph TD\nX[新增节点] --> Y\n');
    await editPage.editor.click();
    await page.keyboard.press('Control+KeyA');
    await page.keyboard.press('Control+V');
    await expect(editPage.editor).toContainText('新增节点');

    // 对比：该版本（默认图）→ 当前（新图）
    await page.getByRole('button', { name: '与当前对比' }).first().click();
    const dialog = page.getByTestId('history-diff-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('圣诞节');
    await expect(dialog).toContainText('新增节点');
    // 默认图 7 行（含收尾空行）全删、新图 3 行全增
    await expect(dialog).toContainText('增 3');
    await expect(dialog).toContainText('删 7');

    // Esc 关闭（bits-ui 原生），面板仍在
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('#historyList li')).toHaveCount(1);
  });

  test('无差异的版本对比显示 0 增 0 删（逐行 same）', async ({ editPage }) => {
    // 全程走 editPage.page（导航在 editPage fixture 的 start() 里，
    // 只解构 page 会跑在 about:blank 上——循环 126 同款教训）
    const page = editPage.page;
    await openHistory(page);
    await page.getByRole('button', { name: '保存当前状态' }).click();
    await expect(page.locator('#historyList li')).toHaveCount(1);

    await page.getByRole('button', { name: '与当前对比' }).first().click();
    const dialog = page.getByTestId('history-diff-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('增 0');
    await expect(dialog).toContainText('删 0');
    await expect(dialog).toContainText('圣诞节');
  });

  test('两版本互比：对话框内把对比对象切到另一历史版本（循环 128）', async ({ page, editPage }) => {
    // 版本 A = 默认图；版本 B = 新图；先后各收藏一条
    await openHistory(page);
    await page.getByRole('button', { name: '保存当前状态' }).click();
    await expect(page.locator('#historyList li')).toHaveCount(1);

    await page.evaluate((c) => navigator.clipboard.writeText(c), 'graph TD\nX[新增节点] --> Y\n');
    await editPage.editor.click();
    await page.keyboard.press('Control+KeyA');
    await page.keyboard.press('Control+V');
    await expect(editPage.editor).toContainText('新增节点');
    await page.getByRole('button', { name: '保存当前状态' }).click();
    await expect(page.locator('#historyList li')).toHaveCount(2);

    // 从最新条目（B）打开对比：默认对比「当前编辑器」＝同为 B，零差异
    await page.getByRole('button', { name: '与当前对比' }).first().click();
    const dialog = page.getByTestId('history-diff-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('当前编辑器');
    await expect(dialog).toContainText('增 0');

    // 切换对比对象为版本 A（下拉第 3 项：当前编辑器 / B / A——名字是
    // 随机 slug，用位置选）：B → A 方向翻转，增删互换
    await page.getByTestId('history-diff-target').selectOption({ index: 2 });
    await expect(dialog).toContainText('圣诞节');
    await expect(dialog).toContainText('新增节点');
    await expect(dialog).toContainText('增 7');
    await expect(dialog).toContainText('删 3');
  });

  test('历史条目一键复制分享链接（循环 130）', async ({ editPage, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    // 全程走 editPage.page（导航在 fixture 的 start() 里——循环 126 教训）
    const page = editPage.page;
    await openHistory(page);
    await page.getByRole('button', { name: '保存当前状态' }).click();
    await expect(page.locator('#historyList li')).toHaveCount(1);

    await page.getByRole('button', { name: '复制该版本的分享链接' }).first().click();
    await expect(page.getByText('已复制该版本的分享链接')).toBeVisible();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toContain('#pako:');
    // 链接就是条目的站内分享 URL（当前页同源、同路径）
    expect(link.startsWith(page.url().split('#')[0])).toBe(true);
  });
});
