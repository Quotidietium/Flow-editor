import { expect, test } from './test';

// 移动端（390px）历史条目按钮行（循环 138）：条目最多 6 个图标按钮
// （新标签/复制链接/对比/恢复/收藏/删除），桌面单行布局在小屏与
// whitespace-nowrap 的时间戳互相挤压——小屏改两行（名称块在上、
// 按钮组整行右对齐），sm 及以上保持原单行。
test.describe('移动端历史条目按钮行', () => {
  test.use({ viewport: { height: 844, width: 390 } });

  test('收藏一条后按钮组不撑破视口，全部按钮可达', async ({ page }) => {
    await page.goto('/edit');
    await page.getByRole('button', { name: '历史记录' }).click();
    // 「已保存」空态的引导按钮
    await page.getByTestId('history-empty-save').click();
    await expect(page.locator('#historyList li')).toHaveCount(1);

    // 无水平溢出（条目行不再把页面撑宽）
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        )
      )
      .toBe(0);

    // 五个操作按钮全部可见可达（「已保存」条目无收藏钮——那是时间线专属）
    for (const name of ['复制该版本的分享链接', '与当前对比', '恢复此版本', '删除此版本']) {
      await expect(page.getByRole('button', { name }).first()).toBeVisible();
    }
  });

  test('时间线条目（6 钮）同样不溢出，收藏钮可达', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'autoHistoryStore',
        JSON.stringify([
          {
            id: 'a-1',
            name: 'nightly-river',
            type: 'auto',
            time: Date.now(),
            state: {
              code: 'flowchart TD\n  A[Alpha] --> B[Beta]',
              mermaid: '{\n  "theme": "default"\n}',
              updateDiagram: false
            }
          }
        ])
      );
    });
    await page.goto('/edit');
    await page.getByRole('button', { name: '历史记录' }).click();
    await page.getByRole('tab', { name: /时间线/ }).click();
    await expect(page.locator('#historyList li')).toHaveCount(1);

    // 条目行内部无横向溢出（适配前 6 钮 + nowrap 时间戳在此溢出）
    await expect
      .poll(() =>
        page.evaluate(() => {
          const li = document.querySelector('#historyList li');
          return li ? li.scrollWidth - li.clientWidth : -1;
        })
      )
      .toBeLessThanOrEqual(0);
    await expect(page.getByRole('button', { name: '收藏到「已保存」' }).first()).toBeVisible();
  });
});
