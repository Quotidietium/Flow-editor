import { expect, test, type Page } from '@playwright/test';

// 可视化属性对话框键盘路径：Enter 即保存（IME 双守卫），Esc 取消——
// 此前输入框无键盘提交，必须挪手点「保存」（MC 设计器循环 72 同款缺陷）。
const openEditor = async (page: Page): Promise<void> => {
  await page.goto('/edit');
  await page.locator('#view').waitFor({ state: 'visible' });
  await page.waitForTimeout(1200);
  await page.goto('/edit');
  await page.locator('#view').waitFor({ state: 'visible' });
};

test.describe('可视化属性对话框键盘路径', () => {
  test('标题输入框 Enter 保存，Esc 取消', async ({ page }) => {
    await openEditor(page);
    // 甘特图（hasTitle + metaKeys 双全）
    const editor = page.locator('.monaco-editor');
    await editor.click();
    await page.evaluate(
      (c) => navigator.clipboard.writeText(c),
      'gantt\n  title 计划\n  section A\n  任务: 2024-01-01, 3d'
    );
    await page.keyboard.press('Control+KeyA');
    await page.keyboard.press('Control+V');
    await page.getByTestId('visual-tab').click();
    const codeOut = page.getByTestId('visual-code-out');
    await expect(codeOut).toBeVisible();

    // 打开属性对话框，改标题后 Enter 即保存
    await page.getByTestId('visual-meta').click();
    const titleInput = page.locator('#ve-meta-title');
    await expect(titleInput).toBeVisible();

    // 甘特 dateFormat 有常用格式建议（datalist，循环 115）
    const dateFormatInput = page.locator('#ve-meta-dateFormat');
    await expect(dateFormatInput).toBeVisible();
    await expect(dateFormatInput).toHaveAttribute('list', 've-meta-dl-dateFormat');
    const suggestions = page.locator('#ve-meta-dl-dateFormat option');
    await expect.poll(async () => suggestions.count()).toBeGreaterThanOrEqual(5);
    await expect(suggestions.first()).toHaveAttribute('value', 'YYYY-MM-DD');

    await titleInput.fill('新计划');
    await titleInput.press('Enter');
    await expect(titleInput).toHaveCount(0);
    await expect(codeOut).toContainText('title 新计划');

    // 再开：Esc 取消（改动不写入）
    await page.getByTestId('visual-meta').click();
    await page.locator('#ve-meta-title').fill('不保留');
    await page.locator('#ve-meta-title').press('Escape');
    await expect(page.locator('#ve-meta-title')).toHaveCount(0);
    await expect(codeOut).toContainText('title 新计划');
    await expect(codeOut).not.toContainText('不保留');
  });
});
