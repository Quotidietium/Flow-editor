import { expect, test } from './test';

test.describe('错误横幅恢复力（循环 123）', () => {
  // 恢复钮的语义：回到「最后一次解析成功」的那份代码，粒度比历史时间线
  // 的 60s 快照细（每次有效键击）。用「整段粘贴」构造确定性场景——逐字符
  // 键入的中间态（如 "A --> B "）本身合法，也会成为可恢复版本（既有语义，
  // 非缺陷），断言锚点必须钉在粘贴进去的独特文本上。
  test('恢复到最近可用版本：改坏代码后一键回到最后一次有效代码', async ({ page, editPage }) => {
    // 1) 粘贴一段独特的有效代码（成为可恢复版本）
    await editPage.editor.click();
    await page.evaluate(
      (c) => navigator.clipboard.writeText(c),
      'graph TD\nA[起点站] --> B[终点站]'
    );
    await page.keyboard.press('Control+KeyA');
    await page.keyboard.press('Control+V');
    await expect(editPage.editor).toContainText('起点站');

    // 2) 一次性整段替换成悬空箭头的坏代码（无合法中间态）
    await page.evaluate((c) => navigator.clipboard.writeText(c), 'graph TD\nA --> B -->');
    await page.keyboard.press('Control+KeyA');
    await page.keyboard.press('Control+V');
    await editPage.checkError('图表语法错误');

    // 3) 一键恢复 → 回到步骤 1 的有效代码，横幅消失
    const restoreButton = page.getByTestId('error-restore-last');
    await expect(restoreButton).toBeVisible();
    await restoreButton.click();

    await expect(page.getByText('已恢复到最近可用的版本')).toBeVisible();
    await expect(page.getByTestId('error-container')).toHaveCount(0);
    await expect(editPage.editor).toContainText('A[起点站] --> B[终点站]');
    // 悬空箭头的坏代码不再在编辑器里（含末尾 dangling 的 "-->" 已被整体替换）
    await expect(editPage.editor).not.toContainText('B -->');
  });

  test('分享链接整串误粘进代码区：横幅一键载入链接中的图表', async ({ page, editPage }) => {
    // 当前页 URL 即有效分享链接（#pako:…）——等 hash 落地（Vite 冷启动
    // 整页 reload 可能晚于 fixture 的宽松等待），再把它当代码粘进编辑器
    await expect(page).toHaveURL(/#pako:/);
    const shareUrl = page.url();
    expect(shareUrl).toMatch(/#pako:/);

    // 剪贴板整串粘贴（逐字符键入会被 Monaco 干扰，与既有用例同款手法）
    await editPage.editor.click();
    await page.evaluate((u) => navigator.clipboard.writeText(u), shareUrl);
    await page.keyboard.press('Control+KeyA');
    await page.keyboard.press('Control+V');
    await editPage.checkError('图表语法错误');

    const loadButton = page.getByTestId('error-load-link');
    await expect(loadButton).toBeVisible();
    await loadButton.click();

    await expect(page.getByText('已载入链接中的图表')).toBeVisible();
    await expect(page.getByTestId('error-container')).toHaveCount(0);
    await editPage.checkInEditor('圣诞节');
  });

  test('恢复钮只针对代码错误：配置错误时不出现（配置有自己的重置钮）', async ({
    page,
    editPage
  }) => {
    await editPage.setEditorMode('配置');
    await editPage.editor.click();
    await page.evaluate((c) => navigator.clipboard.writeText(c), '{ broken');
    await page.keyboard.press('Control+KeyA');
    await page.keyboard.press('Control+V');
    await editPage.checkError('配置 JSON 错误');

    await expect(page.getByTestId('error-restore-last')).toHaveCount(0);
    await expect(page.getByTestId('error-load-link')).toHaveCount(0);
    await expect(page.getByTestId('error-reset-config')).toBeVisible();
  });
});
