import { expect, test } from './test';

// Ctrl+O 打开本地文件（循环 131）：与 Ctrl+S 同级（输入态不设守卫，
// 浏览器默认的「打开」被拦截），走与「打开」按钮同一条 openFileIntoEditor
// 链路（插件导入钩子优先、输入管道、配置安全门）。
test.describe('Ctrl+O 打开本地文件', () => {
  test('快捷键唤起文件选择，载入后编辑器与预览同步', async ({ page, editPage }) => {
    // 系统文件对话框在 Playwright 里以 filechooser 呈现，setFiles 用
    // 内存 buffer 免磁盘临时文件
    const chooserPromise = page.waitForEvent('filechooser');
    await page.keyboard.press('Control+O');
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: 'shortcut-sample.mmd',
      mimeType: 'text/plain',
      buffer: Buffer.from('graph TD\nS1[快捷键打开] --> S2', 'utf-8')
    });

    await expect(page.getByText('已载入「shortcut-sample.mmd」')).toBeVisible();
    await editPage.checkInEditor('快捷键打开');
    await editPage.checkTextInView('快捷键打开');
  });

  test('Monaco 聚焦（输入态）时同样触发', async ({ page, editPage }) => {
    await editPage.editor.click();
    const chooserPromise = page.waitForEvent('filechooser');
    await page.keyboard.press('Control+O');
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: 'focused.mmd',
      mimeType: 'text/plain',
      buffer: Buffer.from('graph TD\nF1 --> F2', 'utf-8')
    });
    await expect(page.getByText('已载入「focused.mmd」')).toBeVisible();
  });
});
