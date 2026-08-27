import { TID } from '$/constants';
import { expect, test } from './test';

test.describe('插入图元搜索', () => {
  test('C4 图元列表按名称过滤，Esc 清空', async ({ page }) => {
    await page.goto('/edit');
    // 载入 C4 示例（25 种节点类型的判别性样本；示例标题无 "C4" 字样）
    await page.getByRole('button', { name: 'C4 图', exact: true }).click();
    await expect(page.locator('#container')).toContainText('Internet Banking System', {
      timeout: 15_000
    });

    await page.getByTestId(TID.visualTab).click();
    await page.getByTestId(TID.visualInsert).click();
    const menu = page.getByTestId(TID.visualInsertMenu);
    await expect(menu).toBeVisible();

    const items = menu.getByRole('button');
    const total = await items.count();
    // C4 有 6 种节点类型（项目内图元最多的类型之一）
    expect(total).toBeGreaterThanOrEqual(5);

    // 搜索「容器」：只剩匹配项
    const search = page.getByTestId('visual-insert-search');
    await search.fill('容器');
    const filtered = await items.count();
    expect(filtered).toBeLessThan(total);
    expect(filtered).toBeGreaterThan(0);
    await expect(menu).toContainText('容器');

    // 无匹配提示
    await search.fill('zzz');
    await expect(menu.getByRole('button')).toHaveCount(0);
    await expect(menu).toContainText('没有匹配「zzz」的图元。');

    // Esc 清空恢复全量
    await search.press('Escape');
    expect(await items.count()).toBe(total);

    // 循环 113：Esc 双段——清词后再按 Esc 关面板
    await search.press('Escape');
    await expect(menu).toHaveCount(0);

    // 关闭再开：搜索词已重置
    await page.getByTestId(TID.visualInsert).click();
    await expect(page.getByTestId('visual-insert-search')).toHaveValue('');
  });
});
