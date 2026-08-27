import { expect, test } from './test';

// 我的示例：用户把当前图存为示例进示例卡片（整图载入），与我的配置模板
// （配置）/我的代码片段（光标插入）三足鼎立。
test.describe('我的示例', () => {
  test('保存当前图为示例、载入、删除、跨刷新保持', async ({ page, editPage }) => {
    await editPage.toggleSampleDiagrams();
    await page.getByRole('button', { name: '流程图', exact: true }).waitFor();

    // 保存当前图（默认 圣诞节 流程图）为示例
    await page.getByTestId('user-sample-save').click();
    await page.getByTestId('user-sample-save-name').fill('节日流程');
    await page.getByTestId('user-sample-save-name').press('Enter');
    await expect(page.getByText('已保存示例「节日流程」')).toBeVisible();
    // 悬停速览（循环 96）：title 含压缩后的代码开头（与历史条目同款）
    await expect(page.locator('[data-testid^="user-sample-sample-"]')).toHaveAttribute(
      'title',
      /整图替换当前文档） · flowchart TD/
    );

    // 换成时序图后从我的示例载回：整图恢复（updateCode 网关路径）
    await page.getByRole('button', { name: '时序图', exact: true }).click();
    await editPage.checkTextNotInView('圣诞节');
    const sampleButton = page.locator('[data-testid^="user-sample-sample-"]');
    await sampleButton.click();
    await editPage.checkTextInView('圣诞节');

    // 跨刷新保持，随后删除
    await page.reload();
    await page.getByRole('button', { name: '流程图', exact: true }).waitFor();
    const stored = await page.evaluate(() => {
      const list = JSON.parse(localStorage.getItem('flowUserSamples') ?? '[]') as {
        id: string;
      }[];
      return list[0]?.id;
    });
    await page.getByTestId(`user-sample-delete-${stored}`).click();
    await expect(page.getByText('已删除示例「节日流程」')).toBeVisible();
    await expect(page.locator('[data-testid^="user-sample-sample-"]')).toHaveCount(0);
  });

  test('我的示例行吃同一个搜索词（标签过滤，入口常显）', async ({ page, editPage }) => {
    await editPage.toggleSampleDiagrams();
    await page.getByRole('button', { name: '流程图', exact: true }).waitFor();

    // 存两个示例：节日流程 / 周报模板（先保存节日流程）
    await page.getByTestId('user-sample-save').click();
    await page.getByTestId('user-sample-save-name').fill('节日流程');
    await page.getByTestId('user-sample-save-name').press('Enter');
    await page.getByTestId('user-sample-save').click();
    await page.getByTestId('user-sample-save-name').fill('周报模板');
    await page.getByTestId('user-sample-save-name').press('Enter');
    await expect(page.locator('[data-testid^="user-sample-sample-"]')).toHaveCount(2);

    // 搜索「周报」：只剩匹配行；保存入口始终可见
    const search = page.getByTestId('preset-search');
    await search.fill('周报');
    await expect(page.locator('[data-testid^="user-sample-sample-"]')).toHaveCount(1);
    await expect(
      page.locator('[data-testid^="user-sample-sample-"]', { hasText: '周报模板' })
    ).toBeVisible();
    await expect(page.getByTestId('user-sample-save')).toBeVisible();

    // Esc 清空：两行回来
    await search.press('Escape');
    await expect(page.locator('[data-testid^="user-sample-sample-"]')).toHaveCount(2);
  });
});
