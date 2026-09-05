import { expect, test } from './test';

// 预览空态引导（循环 131）：画面上真的什么都没有时（清空代码后刷新，
// 从未渲染过有效图）给出起点提示；有内容后提示消失。
test.describe('预览空态引导', () => {
  test('清空代码并刷新后显示空态提示，载入图表后消失', async ({ page, editPage }) => {
    // 清空编辑器（持久化空代码）；URL hash 的改写有 250ms 防抖，reload
    // 可能抢在前面把旧默认图 hash 喂回来——显式剥掉 hash 再刷新
    await editPage.clearEditor();
    await page.evaluate(() => history.replaceState(undefined, '', location.pathname));
    await page.reload();

    const empty = page.getByTestId('view-empty');
    await expect(empty).toBeVisible();
    await expect(empty).toContainText('示例图表');
    await expect(empty).toContainText('Ctrl+O');

    // 输入有效代码渲染成功后提示消失
    await editPage.editor.click();
    await page.evaluate((c) => navigator.clipboard.writeText(c), 'graph TD\nV1 --> V2');
    await page.keyboard.press('Control+KeyA');
    await page.keyboard.press('Control+V');
    await editPage.checkTextInView('V1');
    await expect(empty).toHaveCount(0);
  });

  test('清空但不刷新：旧图半透明挂着，不与上次内容混淆（不给空态提示）', async ({
    page,
    editPage
  }) => {
    await expect(page.getByTestId('view-empty')).toHaveCount(0);
    await editPage.clearEditor();
    // error 态（旧图半透明）期间 code 记着上次渲染值——不给空态提示
    await expect(page.getByTestId('view-empty')).toHaveCount(0);
  });
});
