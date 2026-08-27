import { expect, test } from './test';

// 移动端「定位到错误行」（循环 107 补齐——循环 45 只给了桌面）：
// CodeMirror revealPosition 置光标于错误行并滚动居中。
test.describe('移动端定位到错误行', () => {
  test.use({ viewport: { height: 844, width: 390 } });

  test('代码错误横幅出现定位钮，点击聚焦编辑器且光标落错误行', async ({ page }) => {
    await page.goto('/edit');
    await page.locator('#editorMode').click();
    await page.waitForTimeout(400);

    // 造代码错误（桌面 errorDisplay 用例同款样本——含第三行会被
    // mermaid 容错解析为有效图）
    const editor = page.locator('.cm-content');
    await editor.click();
    await page.evaluate((c) => navigator.clipboard.writeText(c), 'graph TD\nA --> B -->');
    await page.keyboard.press('Control+KeyA');
    await page.keyboard.press('Control+V');
    // 横幅 3s 去抖 + autoSync 批处理——给足窗口
    await expect(page.getByText('图表语法错误')).toBeVisible({ timeout: 15_000 });

    // 定位钮出现（此前移动端不渲染）并点击
    const reveal = page.getByTestId('error-reveal');
    await expect(reveal).toBeVisible();
    await reveal.click();

    // 可观察结果：编辑器重新获得焦点（.cm-content 聚焦）
    await expect(editor).toBeFocused();
    // 状态栏行号随定位更新（错误在第 2 行）
    await expect(page.getByTestId('editor-status')).toContainText('行 2，');
  });
});
