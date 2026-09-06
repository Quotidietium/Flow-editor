import { expect, test } from './test';

// 双向专注布局（循环 143）：代码专注（收预览区，编辑区占满）与预览
// 专注（循环 126，收编辑区看图）对称且互斥；均为会话级开关。
test.describe('代码专注模式', () => {
  test('代码专注：预览区收起、编辑区占满；退出后预览恢复', async ({ page, editPage }) => {
    const toggle = page.getByTestId('code-focus');
    await expect(toggle).toHaveAttribute('title', '专注编辑（收起预览区）');
    await toggle.click();

    // 预览 pane 卸载（#view 消失），编辑器仍在；按钮翻转
    await expect(page.locator('#view')).toHaveCount(0);
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(editPage.editor).toBeVisible();

    // 退出：预览恢复，代码保持
    await toggle.click();
    await expect(page.locator('#view')).toBeVisible();
    await editPage.checkTextInView('圣诞节');
    await editPage.checkInEditor('圣诞节');
  });

  // 预览专注开启时编辑栏（含 code-focus 钮）整个收起——「预览专注下
  // 直接开代码专注」物理不可达，互斥为防御性状态保护（见 +page.svelte
  // 的 onToggleFocus/onPressedChange 互清），故无独立 UI 路径用例。
  test('会话级：刷新后回到默认双栏', async ({ page, editPage }) => {
    await page.getByTestId('code-focus').click();
    await expect(page.locator('#view')).toHaveCount(0);

    await page.reload();
    await expect(page.locator('#view')).toBeVisible();
    await expect(page.getByTestId('code-focus')).toHaveAttribute('aria-pressed', 'false');
    await editPage.checkInEditor('圣诞节');
  });
});
