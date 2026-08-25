import { expect, test } from './test';

test.describe('示例图表搜索', () => {
  test('按中文名/英文名/示例标题过滤', async ({ page, editPage }) => {
    // fixture 收起了示例卡片，重新展开
    await editPage.toggleSampleDiagrams();
    // 目录 chunk 异步加载：等一个已知类目出现
    await page.getByRole('button', { name: '流程图', exact: true }).waitFor();

    const search = page.getByTestId('preset-search');

    // 中文类目名
    await search.fill('思维');
    await expect(page.getByRole('button', { name: '思维导图', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '流程图', exact: true })).toHaveCount(0);

    // 英文原名（ZenUML）
    await search.fill('zenu');
    await expect(page.getByRole('button', { name: 'ZenUML', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '思维导图', exact: true })).toHaveCount(0);

    // 示例标题（ZenUML 内置示例「订单服务」）
    await search.fill('订单');
    await expect(page.getByRole('button', { name: 'ZenUML', exact: true })).toBeVisible();

    // 无匹配
    await search.fill('zzz');
    await expect(page.getByText('没有匹配「zzz」的图类型或示例。')).toBeVisible();

    // Esc 恢复全量
    await search.press('Escape');
    await expect(page.getByRole('button', { name: '流程图', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '思维导图', exact: true })).toBeVisible();
  });

  test('过滤后点击示例照常载入', async ({ page, editPage }) => {
    await editPage.toggleSampleDiagrams();
    await page.getByRole('button', { name: '流程图', exact: true }).waitFor();

    await page.getByTestId('preset-search').fill('时序');
    await page.getByRole('button', { name: '时序图', exact: true }).click();
    await editPage.checkTextNotInView('圣诞节');
  });

  test('当前图类目在网格中高亮并随载入切换', async ({ page, editPage }) => {
    await editPage.toggleSampleDiagrams();
    // 网格按钮（与最近使用行同名按钮用 flex-grow 区分——循环 24 同款）
    const gridButton = (name: string) =>
      page.getByRole('button', { exact: true, name }).and(page.locator('[class*="flex-grow"]'));
    // 默认图为流程图 → 流程图按钮高亮（aria-current + ring）
    const flowButton = gridButton('流程图');
    await flowButton.waitFor();
    await expect(flowButton).toHaveAttribute('aria-current', 'true');
    await expect(flowButton).toHaveClass(/ring-2/);

    // 载入时序图 → 高亮切换
    await gridButton('时序图').click();
    const seqButton = gridButton('时序图');
    await expect(seqButton).toHaveAttribute('aria-current', 'true');
    await expect(flowButton).not.toHaveAttribute('aria-current', 'true');
  });

  test('类目按钮悬停提示 Mermaid 关键字', async ({ page, editPage }) => {
    await editPage.toggleSampleDiagrams();
    const flowButton = page.getByRole('button', { name: '流程图', exact: true });
    await flowButton.waitFor();
    // 悬停提示展示该图类型的 Mermaid 头关键字（学习语法用）
    await expect(flowButton).toHaveAttribute('title', 'Mermaid 关键字：Flowchart');
    await expect(page.getByRole('button', { name: '时序图', exact: true })).toHaveAttribute(
      'title',
      'Mermaid 关键字：Sequence'
    );
  });
});
