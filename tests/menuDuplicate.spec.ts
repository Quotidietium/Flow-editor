import { expect, test } from './test';

// 复制副本取点击时刻的 URL：挂载期捕获的 href 在编辑后是旧图
// （循环 100 同族过期缺陷——window.location 在挂载期求值不随编辑更新）。
test.describe('主菜单复制副本', () => {
  test('编辑后复制副本打开的是当前编辑态', async ({ page, context, editPage }) => {
    await page.goto('/edit');
    await page.waitForURL(/#pako:/);

    // 修改代码（hash 随编辑更新）
    await editPage.clearEditor();
    await editPage.typeInEditor('flowchart TD\n  X[复制副本新节点] --> Y');
    await page.waitForURL(/#pako:/);

    // 点复制副本 → 新标签页
    const popupPromise = context.waitForEvent('page');
    await page.locator('nav button').first().click();
    await page.getByTestId('menu-duplicate').click();
    const popup = await popupPromise;
    await popup.waitForURL(/#pako:/);

    // 新标签页载入的是编辑后的图（而非挂载期的默认图）
    await expect(popup.locator('.monaco-editor')).toContainText('复制副本新节点', {
      timeout: 15_000
    });
    await expect(popup.locator('#container')).toContainText('复制副本新节点', {
      timeout: 15_000
    });
  });
});
