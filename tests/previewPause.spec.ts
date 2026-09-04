import { expect, test } from './test';

test.describe('实时预览暂停（循环 124）', () => {
  test('暂停后改动不上画，陈旧指示给「立即渲染」一键补渲', async ({ page, editPage }) => {
    const pauseButton = page.getByTestId('preview-pause');
    await expect(pauseButton).toHaveAttribute(
      'title',
      '暂停实时预览（改完点画面角落的「立即渲染」）'
    );
    await pauseButton.click();

    // 暂停期间改代码：编辑器有新内容，预览不上画，陈旧指示出现
    await editPage.editor.click();
    await page.evaluate((c) => navigator.clipboard.writeText(c), 'graph TD\nX1[暂停检查] --> Y1');
    await page.keyboard.press('Control+KeyA');
    await page.keyboard.press('Control+V');
    await expect(editPage.editor).toContainText('暂停检查');
    await expect(page.getByTestId('preview-paused')).toBeVisible();
    await editPage.checkTextNotInView('暂停检查');

    // 一键补渲：画面跟上当前代码，指示消失
    await page.getByTestId('preview-resume').click();
    await editPage.checkTextInView('暂停检查');
    await expect(page.getByTestId('preview-paused')).toHaveCount(0);
  });

  test('暂停是会话级——刷新后自动回到实时，编辑随改随渲', async ({ page, editPage }) => {
    const pauseButton = page.getByTestId('preview-pause');
    await pauseButton.click();
    await page.reload();

    // 会话级开关不持久化：新加载默认实时（防被遗忘的暂停造成「改了没反应」）
    await expect(pauseButton).toHaveAttribute('title', /^暂停实时预览/);

    // 实时性回归：改动直接上画（无需补渲）
    await editPage.editor.click();
    await page.evaluate((c) => navigator.clipboard.writeText(c), 'graph TD\nR2[实时检查] --> S2');
    await page.keyboard.press('Control+KeyA');
    await page.keyboard.press('Control+V');
    await editPage.checkTextInView('实时检查');
    await expect(page.getByTestId('preview-paused')).toHaveCount(0);
  });
});
