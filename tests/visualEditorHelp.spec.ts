import { TID } from '$/constants';
import { expect, test } from './test';

test.describe('可视化编辑器快捷键帮助', () => {
  test('工具栏帮助按钮打开快捷键对话框', async ({ page }) => {
    await page.goto('/edit');
    await page.getByTestId(TID.visualTab).click();
    await page.getByTestId('visual-help').click();

    const dialog = page.getByTestId('visual-help-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('快捷键与操作');
    // 抽查各分组条目与实际实现一致
    await expect(dialog).toContainText('Ctrl + Z');
    await expect(dialog).toContainText('Alt + Shift + 方向键');
    await expect(dialog).toContainText('克隆并连接');
    await expect(dialog).toContainText('同级 / 缩进 / 反缩进');
    await expect(dialog).toContainText('Ctrl + 滚轮');
    // 循环 84/64/87 补的捏合/搜索/表单 Enter 已同步进帮助（防漂移）
    await expect(dialog).toContainText('双指捏合');
    await expect(dialog).toContainText('居中并选中首个命中');
    await expect(dialog).toContainText('直接提交');

    // 关闭按钮收起对话框
    await dialog.getByRole('button', { name: '关闭' }).click();
    await expect(dialog).toHaveCount(0);

    // Esc 同样可以关闭（重开后）
    await page.getByTestId('visual-help').click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
});
