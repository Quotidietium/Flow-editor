import { expect, test } from './test';

test.describe('Monaco 小地图', () => {
  test('开关即显隐且偏好跨会话保持', async ({ page }) => {
    await page.goto('/edit');
    // 冷启动水合等待（4–6s 教训：等桥存在再交互）
    await page.waitForFunction(
      () => (window as unknown as { __FLOW_EDITOR_API__?: unknown }).__FLOW_EDITOR_API__
    );

    const minimap = page.locator('.monaco-editor .minimap');
    const toggle = page.getByTestId('editor-minimap');
    await expect(toggle).toBeVisible();
    // 默认关（容器恒在，禁用时隐藏）
    await expect(minimap).toBeHidden();

    // 开：小地图出现，偏好落盘
    await toggle.click();
    await expect(minimap).toBeVisible();
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem('editorMinimap')))
      .toBe('true');

    // 刷新后保持（构造即生效）
    await page.reload();
    await expect(page.getByTestId('editor-minimap')).toHaveAttribute('data-state', 'on');
    await expect(minimap).toBeVisible();

    // 关：隐藏且落盘
    await toggle.click();
    await expect(minimap).toBeHidden();
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem('editorMinimap')))
      .toBe('false');
  });
});
