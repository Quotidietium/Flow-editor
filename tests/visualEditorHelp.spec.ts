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
    // 循环 153：Enter 循环命中 + Shift+Enter 上一个
    await expect(dialog).toContainText('居中并选中命中（重复按循环下一个）');
    await expect(dialog).toContainText('上一个命中');
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

  // 循环 136：帮助内容按当前视图过滤——看板视图隐藏画布专属噪音，
  // 只留通用与看板相关项；画布视图（上方用例）仍显示全部。
  test('看板视图过滤画布专属项，显示视图徽章', async ({ page }) => {
    await page.goto('/edit');
    const editor = page.locator('.monaco-editor');
    await editor.click();
    await page.evaluate(
      (c) => navigator.clipboard.writeText(c),
      'kanban\ntodo[待办]\n  t1[甲]\n  t2[乙]\ndone[完成]\n  t3[丙]'
    );
    await page.keyboard.press('Control+KeyA');
    await page.keyboard.press('Control+V');
    await expect(editor).toContainText('kanban');

    await page.getByTestId('visual-tab').click();
    await page.getByTestId('visual-help').click();

    const dialog = page.getByTestId('visual-help-dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('visual-help-view')).toHaveText('看板');
    await expect(dialog).toContainText('画布专属操作在画布类图表下可见');

    // 通用与看板相关项保留
    await expect(dialog).toContainText('Ctrl + Z');
    await expect(dialog).toContainText('拖拽卡片');
    // 画布专属与他视图条目隐藏
    await expect(dialog).not.toContainText('框选');
    await expect(dialog).not.toContainText('克隆并连接');
    await expect(dialog).not.toContainText('大纲：Enter');
  });
});
