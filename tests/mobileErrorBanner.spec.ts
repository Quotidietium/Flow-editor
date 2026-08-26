import { expect, test } from './test';

// 移动端错误横幅防溢出：循环 75 给配置横幅加了第三钮（重置）后，
// 390px 下横幅与其按钮组必须在视口内（配置/代码两种形态）。
test.describe('移动端错误横幅', () => {
  test.use({ viewport: { height: 844, width: 390 } });

  const assertWithinViewport = async (
    page: import('@playwright/test').Page,
    testid: string
  ): Promise<void> => {
    const box = await page.getByTestId(testid).boundingBox();
    if (!box) {
      throw new Error(`${testid} bounding box unavailable`);
    }
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(391);
  };

  test('配置错误横幅（重置+复制）与代码错误横幅均在视口内', async ({ page }) => {
    await page.goto('/edit');
    await page.locator('#editorMode').click();
    await page.waitForTimeout(400);

    // 配置错误：重置 + 复制（移动端无定位钮，循环 45）
    await page.getByRole('tab', { name: '配置' }).click();
    const editor = page.locator('.cm-content');
    await editor.click();
    await page.evaluate((c) => navigator.clipboard.writeText(c), '{ broken');
    await page.keyboard.press('Control+KeyA');
    await page.keyboard.press('Control+V');
    await expect(page.getByText('配置 JSON 错误')).toBeVisible();
    await assertWithinViewport(page, 'error-container');
    await assertWithinViewport(page, 'error-reset-config');
    await assertWithinViewport(page, 'error-copy');

    // 先借循环 75 的重置钮修好配置（配置错误按网关语义压过代码错误——
    // 不先复位，横幅永远停在配置 JSON 错误）
    await page.getByTestId('error-reset-config').click();
    await expect(page.getByText('已重置为默认配置')).toBeVisible();

    // 代码错误：复制（重置钮不出现，循环 75 门控）
    await page.getByRole('tab', { name: '代码' }).click();
    await editor.click();
    await page.evaluate((c) => navigator.clipboard.writeText(c), 'graph TD\nA --> B -->');
    await page.keyboard.press('Control+KeyA');
    await page.keyboard.press('Control+V');
    await expect(page.getByText('图表语法错误')).toBeVisible();
    await expect(page.getByTestId('error-reset-config')).toHaveCount(0);
    await assertWithinViewport(page, 'error-container');
    await assertWithinViewport(page, 'error-copy');
  });
});
