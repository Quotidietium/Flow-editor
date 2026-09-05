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

  test('尺寸模式与值跨刷新保持；导出倍数保持会话级（循环 133）', async ({ page, editPage }) => {
    await editPage.ensureActionsOpen();

    // 宽度模式 + 1440 + 2x 倍数
    await page.getByRole('radio', { name: '宽度' }).click();
    const sizeInput = page.locator('input[type="number"]');
    await page.getByTestId('png-size-1440').click();
    await expect(sizeInput).toHaveValue('1440');
    await page.getByTestId('export-scale-2').click();
    await expect(page.getByTestId('export-scale-2')).toHaveClass(/border-primary/);

    await page.reload();
    await editPage.ensureActionsOpen();

    // 模式与尺寸值跨会话保持
    await expect(page.getByRole('radio', { name: '宽度' })).toHaveAttribute('data-state', 'on');
    await expect(page.getByTestId('png-size-chips')).toBeVisible();
    await expect(page.locator('input[type="number"]')).toHaveValue('1440');
    await expect(page.getByTestId('png-size-1440')).toHaveClass(/border-primary/);

    // 倍数是会话级（持久化被遗忘的 4x 会在下次会话产出意外巨型文件）
    await expect(page.getByTestId('export-scale-1')).toHaveClass(/border-primary/);
    await expect(page.getByTestId('export-scale-2')).not.toHaveClass(/border-primary/);
  });
});
