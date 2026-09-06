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

  test('位图尺寸预估：随档位与倍数联动（循环 152）', async ({ page, editPage }) => {
    // 预估依赖「预览完成一次成功渲染」（内容尺寸取自其 viewBox）——
    // 冷编译下首次渲染可能数秒，先等图落地再读预估（viewPage 同款闸门）
    await expect(page.locator('#container')).toContainText('圣诞节', { timeout: 15_000 });
    await editPage.ensureActionsOpen();
    const estimate = page.getByTestId('export-size-estimate');

    // 自动模式：内容 ×2（默认图渲染完成即有读数，与实际导出同算法）
    await expect(estimate).toBeVisible();
    await expect(estimate).toContainText('输出约');

    // 宽度档 720：宽锁定 720，另一边按图比例
    await page.getByRole('radio', { name: '宽度' }).click();
    await page.getByTestId('png-size-720').click();
    await expect(estimate).toContainText('输出约 720 × ');

    // 高度档：高锁定 720
    await page.getByRole('radio', { name: '高度' }).click();
    await expect(estimate).toContainText('× 720 px');

    // 2x 倍数整体放大：高 720 → 1440
    await page.getByTestId('export-scale-2').click();
    await expect(estimate).toContainText('× 1440 px');
  });
});
