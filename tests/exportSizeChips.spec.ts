import { expect, test } from './test';

test.describe('PNG 尺寸快捷预设', () => {
  test('自动模式隐藏 chips，宽/高模式一键填入', async ({ page, editPage }) => {
    await editPage.ensureActionsOpen();

    // 自动模式：无 chips
    await expect(page.getByTestId('png-size-chips')).toHaveCount(0);

    // 切到宽度模式：chips 出现
    await page.getByRole('radio', { name: '宽度' }).click();
    await expect(page.getByTestId('png-size-chips')).toBeVisible();

    const sizeInput = page.locator('input[type="number"]');
    await page.getByTestId('png-size-2160').click();
    await expect(sizeInput).toHaveValue('2160');
    // 选中态高亮
    await expect(page.getByTestId('png-size-2160')).toHaveClass(/border-primary/);

    await page.getByTestId('png-size-720').click();
    await expect(sizeInput).toHaveValue('720');

    // 切到高度模式：chips 仍在，值保留
    await page.getByRole('radio', { name: '高度' }).click();
    await expect(page.getByTestId('png-size-chips')).toBeVisible();
    await expect(sizeInput).toHaveValue('720');

    // 切回自动：chips 隐藏、输入禁用
    await page.getByRole('radio', { name: '自动' }).click();
    await expect(page.getByTestId('png-size-chips')).toHaveCount(0);
    await expect(sizeInput).toBeDisabled();
  });
});
