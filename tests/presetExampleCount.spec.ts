import { expect, test } from './test';

// 示例数角标：多示例类目的下拉触发钮带数量角标（aria-hidden 渲染。
// 角标必须在触发钮内而非主钮——主钮 textContent 被 getByText(exact)
// 选择器精确匹配，污染即撞 loadSite/actions，双实证）。
test.describe('示例数角标', () => {
  test('角标数字与下拉项数一致，主钮文本不受影响', async ({ page, editPage }) => {
    await editPage.toggleSampleDiagrams();
    const gridButton = (name: string) =>
      page.getByRole('button', { exact: true, name }).and(page.locator('[class*="flex-grow"]'));
    await gridButton('流程图').waitFor();

    // 主钮回归网①：按名选择器照原样命中（循环 31 的回归网）
    await expect(gridButton('时序图')).toHaveCount(1);
    // 主钮回归网②：fixture 的 getByText(exact) 路径照原样命中（本轮实证修复）
    await expect(page.getByText('实体关系图', { exact: true })).toHaveCount(1);
    await expect(page.getByText('饼图', { exact: true })).toHaveCount(1);

    // 至少一个类目带角标；取首个角标，其数字必等于相邻下拉项数
    const badges = page.locator(
      '.flex.min-w-20.flex-grow [aria-label$="示例"] span[aria-hidden="true"]'
    );
    expect(await badges.count()).toBeGreaterThan(0);
    const firstBadge = badges.first();
    const count = Number.parseInt((await firstBadge.textContent()) ?? '0', 10);
    expect(count).toBeGreaterThan(1);

    // 角标所在按钮组的下拉：项数与角标一致（不变式）
    const group = firstBadge.locator('xpath=ancestor::div[contains(@class,"flex-grow")][1]');
    await group.getByRole('button', { name: /选择.*示例/ }).click();
    const options = page.locator('[data-popover-content] button');
    await expect.poll(async () => options.count()).toBe(count);
  });
});
