import { expect, test } from './test';

// 渲染进行中指示：大图渲染可达数百毫秒，旧图静静挂着会让用户以为没生效。
// 瞬态指示不做轮询窗口竞速：MutationObserver 从粘贴前就开始记录指示器的
// 出现/消失序列（出现一次即留痕，与轮询运气无关），事后只断言时序。
test.describe('渲染中指示', () => {
  test('渲染窗口内出现「渲染中…」，完成后熄灭且先于完成出现', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/edit');
    // 初始渲染完成后的稳态：无指示
    await expect(page.locator('#container')).toContainText('圣诞节', { timeout: 15_000 });
    await expect(page.getByTestId('view-rendering')).toHaveCount(0);

    // 观察序列记录器：状态翻转才记一条（false=消失 true=出现）
    await page.evaluate(() => {
      const win = window as unknown as { __riLog: boolean[] };
      win.__riLog = [];
      const view = document.querySelector('#view');
      new MutationObserver(() => {
        const on = document.querySelector('[data-testid="view-rendering"]') !== null;
        const log = win.__riLog;
        if (log[log.length - 1] !== on) {
          log.push(on);
        }
      }).observe(view as Node, { childList: true, subtree: true });
    });

    // 6 倍 CPU 降速：渲染相拉长到跨帧（指示器必被创建），又不至于拖慢全链路
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    try {
      const big = `flowchart TD\n${Array.from(
        { length: 60 },
        (_, i) => `  N${i}[节点${i}] --> N${i + 1}[节点${i + 1}]`
      ).join('\n')}\n${Array.from({ length: 20 }, (_, i) => `  N${i} -.-> N${59 - i}`).join('\n')}`;
      await page.locator('.monaco-editor').click();
      await page.evaluate((c) => navigator.clipboard.writeText(c), big);
      await page.keyboard.press('Control+KeyA');
      await page.keyboard.press('Control+V');

      // 渲染完成（新图就位）后：稳态无指示
      await expect(page.locator('#container')).toContainText('节点60', { timeout: 90_000 });
      await expect(page.getByTestId('view-rendering')).toHaveCount(0);

      // 序列断言：至少出现一次 true（出现过），且以 false（熄灭）收尾、
      // true 严格先于最后一个 false——先出现后熄灭，时序正确
      const log = await page.evaluate(() => (window as unknown as { __riLog: boolean[] }).__riLog);
      expect(log).toContain(true);
      expect(log[log.length - 1]).toBe(false);
      expect(log.indexOf(true)).toBeLessThan(log.lastIndexOf(false));
    } finally {
      await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    }
  });
});
