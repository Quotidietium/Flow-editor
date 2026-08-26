import { expect, test } from './test';

// 移动端配置模式 JSON 行内校验：与桌面端 Monaco json worker 的 squiggles
// 对齐（此前移动端配置错误只有横幅、没有行内定位）。
test.describe('移动端配置 JSON 行内校验', () => {
  test.use({ viewport: { height: 844, width: 390 } });

  test('损坏 JSON 出行内错误标记，回代码模式消失', async ({ page }) => {
    await page.goto('/edit');
    // 移动端滑屏：先切到编辑半屏
    await page.locator('#editorMode').click();
    await page.waitForTimeout(400);

    await page.getByRole('tab', { name: '配置' }).click();
    const editor = page.locator('.cm-content');
    await editor.click();
    await page.evaluate((c) => navigator.clipboard.writeText(c), '{ broken');
    await page.keyboard.press('Control+KeyA');
    await page.keyboard.press('Control+V');

    // 横幅 + 行内错误标记双出现（此前只有横幅）。
    // 零长诊断落 cm-lintPoint-error 类且是零宽空 span——断存在不断可见。
    await expect(page.getByText('配置 JSON 错误')).toBeVisible();
    await expect(page.locator('.cm-lintPoint-error').first()).toBeAttached();

    // 回代码模式：校验扩展随语言舱一并移除
    await page.getByRole('tab', { name: '代码' }).click();
    await expect(page.locator('.cm-lintPoint-error')).toHaveCount(0);
  });
});
