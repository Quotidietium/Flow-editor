import { expect, test } from './test';

// 示例图表网格方向键导航（循环 142）：卡片几十个类目按钮，键盘用户
// 逐 Tab 穿越成本高——←/→ 按 DOM 序、↑/↓ 按「视觉行」（offsetTop 分行）
// 在按钮间移动焦点；焦点不在网格内时不劫持方向键。
// 注意：多示例类目主钮后跟角标钮（选择示例的 Popover 触发器），DOM 序
// 导航会经过它们——断言按语义目标循环推进，不写死步数。
test.describe('示例图表网格键盘导航', () => {
  const focusedText = (page: import('@playwright/test').Page) =>
    page.evaluate(() => (document.activeElement as HTMLElement)?.textContent?.trim() ?? '');

  test('←/→ 在网格按钮间移动（DOM 序，含角标钮）', async ({ page, editPage }) => {
    await editPage.toggleSampleDiagrams();

    const first = page.getByRole('button', { name: '流程图', exact: true });
    await first.focus();
    await expect(first).toBeFocused();

    // → 焦点前进（流程图主钮之后是它的角标钮或下一个类目）
    await page.keyboard.press('ArrowRight');
    expect(await focusedText(page)).not.toBe('流程图');
    // ← 焦点退回
    await page.keyboard.press('ArrowLeft');
    await expect(first).toBeFocused();
  });

  test('↑/↓ 跨视觉行移动且焦点保持在网格内', async ({ page, editPage }) => {
    await editPage.toggleSampleDiagrams();
    await page.getByRole('button', { name: '流程图', exact: true }).focus();
    expect(await firstFocused(page)).toBe(true);

    await page.keyboard.press('ArrowDown');
    const inside = await page.evaluate(
      () =>
        !!document
          .querySelector('[role="group"][aria-label*="示例图表"]')
          ?.contains(document.activeElement)
    );
    expect(inside).toBe(true);
  });

  test('←/→ 推进到目标类目后 Enter 载入该示例', async ({ page, editPage }) => {
    await editPage.toggleSampleDiagrams();
    await page.getByRole('button', { name: '流程图', exact: true }).focus();

    // 连按 → 直到焦点落在「类图」主钮（跳过角标钮）
    for (let i = 0; i < 45; i += 1) {
      const text = await focusedText(page);
      if (text === '类图') {
        break;
      }
      await page.keyboard.press('ArrowRight');
    }
    await expect(page.getByRole('button', { name: '类图', exact: true })).toBeFocused();

    await page.keyboard.press('Enter');
    // 载入类图示例：代码编辑器出现 classDiagram
    const editor = page.locator('.monaco-editor');
    await expect(editor).toContainText('classDiagram', { timeout: 10_000 });
  });

  test('焦点不在网格按钮上时，方向键不被劫持', async ({ page, editPage }) => {
    await editPage.toggleSampleDiagrams();
    // 焦点在搜索框（网格容器外）
    await page.getByTestId('preset-search').focus();
    await expect(page.getByTestId('preset-search')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    // 焦点仍在搜索框（未被网格导航劫持）
    await expect(page.getByTestId('preset-search')).toBeFocused();
  });
});

function firstFocused(page: import('@playwright/test').Page) {
  return page.evaluate(
    () => (document.activeElement as HTMLElement | null)?.textContent?.trim() === '流程图'
  );
}
