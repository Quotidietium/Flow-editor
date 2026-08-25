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
});
