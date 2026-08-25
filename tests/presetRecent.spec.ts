import { expect, test } from './test';

test.describe('示例图表最近使用', () => {
  test('点用后出现最近使用行，去重置顶，跨刷新保持', async ({ page, editPage }) => {
    // fixture 收起了示例卡片，重新展开（presetSearch 同款）
    await editPage.toggleSampleDiagrams();
    // 网格按钮（区别于最近使用行的同名按钮：网格按钮带 flex-grow）
    const gridButton = (name: string) =>
      page.getByRole('button', { exact: true, name }).and(page.locator('[class*="flex-grow"]'));
    // 目录就绪（chunk 到达 + 字体加载位移沉降）
    await gridButton('流程图').waitFor();
    await page.waitForTimeout(1000);
    // 初始无最近使用行
    await expect(page.getByTestId('preset-recent')).toHaveCount(0);

    // 点用时序图 → 最近使用出现
    await gridButton('时序图').click();
    await editPage.checkTextNotInView('圣诞节');
    const recentRow = page.getByTestId('preset-recent');
    await expect(recentRow).toBeVisible();
    await expect(page.getByTestId('preset-recent-Sequence')).toBeVisible();
    // 与网格按钮同款的关键字提示（循环 26 的盲区补齐）
    await expect(page.getByTestId('preset-recent-Sequence')).toHaveAttribute(
      'title',
      'Mermaid 关键字：Sequence'
    );

    // 再点用甘特图 → 甘特在前、时序在后
    await gridButton('甘特图').click();
    const buttons = recentRow.getByRole('button');
    await expect(buttons.first()).toHaveText('甘特图');
    await expect(buttons.nth(1)).toHaveText('时序图');

    // 重复点用时序图 → 去重置顶
    await gridButton('时序图').click();
    await expect(buttons.first()).toHaveText('时序图');

    // 刷新保持，且最近使用按钮可直接载入
    await page.reload();
    await page.getByRole('button', { name: '流程图', exact: true }).waitFor();
    await page.waitForTimeout(1000);
    await expect(page.getByTestId('preset-recent')).toBeVisible();
    await page.getByTestId('preset-recent-Sequence').click();
    const store = await page.evaluate(() => localStorage.getItem('codeStore'));
    expect(store).toContain('sequenceDiagram');

    // 一键清空：行消失、storage 清空、刷新不再出现
    await page.getByTestId('preset-recent-clear').click();
    await expect(page.getByTestId('preset-recent')).toHaveCount(0);
    const cleared = await page.evaluate(() => localStorage.getItem('presetRecent'));
    expect(cleared).toBeNull();
    await page.reload();
    await page.getByRole('button', { name: '流程图', exact: true }).waitFor();
    await expect(page.getByTestId('preset-recent')).toHaveCount(0);
  });
});
