import { expect, test } from './test';

// 示例数角标：类目按钮上的数字 = 该类目备选变体数（aria-hidden 渲染，
// 不进入可访问名——否则撞循环 31 修过的按名选择器）。
test.describe('示例数角标', () => {
  test('角标数字与下拉项数一致，可访问名不受影响', async ({ page, editPage }) => {
    await editPage.toggleSampleDiagrams();
    const gridButton = (name: string) =>
      page.getByRole('button', { exact: true, name }).and(page.locator('[class*="flex-grow"]'));
    await gridButton('流程图').waitFor();

    // aria-hidden 生效：按名选择器照原样命中（循环 31 的回归网）
    await expect(gridButton('时序图')).toHaveCount(1);

    // 至少一个类目带角标；取首个角标，其数字必等于相邻下拉项数
    const badges = page.locator('.flex.min-w-20.flex-grow button span[aria-hidden="true"]');
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
