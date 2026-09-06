import { expect, test } from './test';

// 再次导出（循环 154）：菜单顶部钉住本会话最近一次导出格式，一键重复——
// 迭代调图连出多张同格式免翻菜单。会话级：用例开头的全新加载即证明
// 「不跨会话钉住」（每个 Playwright 用例都是全新页面/JS 堆）。
test.describe('再次导出', () => {
  test('导出后菜单顶部出现再次导出，点击即重复下载，钉住项跟随最近格式', async ({
    editPage,
    page
  }) => {
    // 全新会话首次打开菜单：无钉住项（= 会话级语义的证明）
    await editPage.openExportMenu();
    await expect(page.getByTestId('export-again')).toHaveCount(0);

    // 导出 PNG（下载监听先于点击——fileIO 教训）
    const first = page.waitForEvent('download');
    await page.getByTestId('download-PNG').click();
    await first;

    // 重开菜单：钉住项出现并带格式名，点击即再次下载
    await editPage.openExportMenu();
    const again = page.getByTestId('export-again');
    await expect(again).toBeVisible();
    await expect(again).toContainText('PNG 图像');
    const second = page.waitForEvent('download');
    await again.click();
    await second;

    // 换格式后钉住项跟随（SVG 矢量图）
    await editPage.openExportMenu();
    const third = page.waitForEvent('download');
    await page.getByTestId('download-SVG').click();
    await third;
    await editPage.openExportMenu();
    await expect(page.getByTestId('export-again')).toContainText('SVG 矢量图');
  });
});
