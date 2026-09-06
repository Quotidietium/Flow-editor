import { expect, test } from './test';

test.describe('Error display tests', () => {
  test('should show syntax error for invalid diagram code', async ({ editPage }) => {
    // Enter code with syntax error
    await editPage.clearEditor();
    await editPage.typeInEditor('graph TD\nA --> B -->');

    // 错误条按来源分流（循环 30）：图表语法错误
    await editPage.checkError('图表语法错误');
  });

  test('should show syntax error for invalid JSON in Config tab', async ({ editPage }) => {
    // First enter valid diagram
    await editPage.clearEditor();
    await editPage.typeInEditor('graph TD\nA --> B');

    // Switch to Config tab
    await editPage.setEditorMode('配置');

    // Enter invalid JSON in config
    await editPage.clearEditor();
    await editPage.typeInEditor('{\n  "theme": "default",\n  invalid json');

    // 错误条按来源分流（循环 30）：配置 JSON 错误
    await editPage.checkError('配置 JSON 错误');
  });

  // Code error markers carry positions in the mermaid CODE document — they
  // used to be transplanted onto the config JSON tab, squiggling unrelated
  // JSON lines while the code tab silently lost them.
  test('code error markers stay on the code tab', async ({ editPage }) => {
    await editPage.clearEditor();
    await editPage.typeInEditor('graph TD\nA --> B -->');
    await editPage.checkError('语法错误');

    const squiggles = editPage.editor.locator('.squiggly-error');
    await expect(squiggles.first()).toBeVisible();

    // The config tab holds valid JSON — no error squiggles may appear there.
    // Wait for the config text first: the model swap and any transplanted
    // markers land in the same effect, so judging at click time races it.
    await editPage.setEditorMode('配置');
    await expect(editPage.editor).toContainText('"theme"');
    await editPage.page.waitForTimeout(300);
    await expect(squiggles).toHaveCount(0);

    // Back on the code tab the marker is still where it belongs.
    await editPage.setEditorMode('代码');
    await expect(squiggles.first()).toBeVisible();
  });

  test('定位按钮把光标放进错误行并聚焦编辑器', async ({ editPage }) => {
    await editPage.clearEditor();
    await editPage.typeInEditor('graph TD\nA --> B -->');
    await editPage.checkError('语法错误');

    const revealButton = editPage.page.getByTestId('error-reveal');
    await expect(revealButton).toBeVisible();
    await revealButton.click();

    // reveal + setPosition + focus 的可观察结果：编辑器重新获得焦点。
    // Monaco 0.55 的输入域是 div[native-edit-context]（aria-label "Editor
    // content"），不是 textarea——另一个 textarea 是 IME 隐藏域，不可聚焦。
    await expect(editPage.editor.locator('[aria-label="Editor content"]')).toBeFocused();

    // 修复代码后错误条消失，定位按钮随之消失
    await editPage.clearEditor();
    await editPage.typeInEditor('graph TD\nA --> B');
    await expect(editPage.page.getByTestId('error-container')).toHaveCount(0);
    await expect(revealButton).toHaveCount(0);
  });

  test('定位按钮只在「代码错误且代码页在前」时出现（不拿旧标记跳错文档）', async ({ editPage }) => {
    // 代码破：定位可见
    await editPage.clearEditor();
    await editPage.typeInEditor('graph TD\nA --> B -->');
    await editPage.checkError('图表语法错误');
    await expect(editPage.page.getByTestId('error-reveal')).toBeVisible();

    // 切到配置页（代码仍破，横幅仍是图表语法错误）：定位不许在配置文档里跳
    await editPage.setEditorMode('配置');
    await expect(editPage.editor).toContainText('"theme"');
    await editPage.checkError('图表语法错误');
    await expect(editPage.page.getByTestId('error-reveal')).toHaveCount(0);

    // 配置再破（来源覆盖为 config，标记仍是代码的旧标记）：同样不许跳。
    // 走剪贴板粘贴：Monaco 自动闭括号会把键盘逐字符键入的 JSON 变成双括号。
    await editPage.editor.click();
    await editPage.page.evaluate((c) => navigator.clipboard.writeText(c), '{ broken');
    await editPage.page.keyboard.press('Control+KeyA');
    await editPage.page.keyboard.press('Control+V');
    await editPage.checkError('配置 JSON 错误');
    await expect(editPage.page.getByTestId('error-reveal')).toHaveCount(0);

    // 修好配置（代码仍破、配置页在前）：横幅回到图表语法错误，定位仍不出现
    await editPage.editor.click();
    await editPage.page.evaluate(
      (c) => navigator.clipboard.writeText(c),
      '{\n  "theme": "default"\n}'
    );
    await editPage.page.keyboard.press('Control+KeyA');
    await editPage.page.keyboard.press('Control+V');
    await editPage.checkError('图表语法错误');
    await expect(editPage.page.getByTestId('error-reveal')).toHaveCount(0);

    // 回到代码页：定位回来，跳的就是代码文档
    await editPage.setEditorMode('代码');
    await editPage.checkError('图表语法错误');
    await expect(editPage.page.getByTestId('error-reveal')).toBeVisible();
  });

  test('配置错误横幅提供「重置为默认配置」直达钮', async ({ page, editPage }) => {
    // 破坏配置 JSON（剪贴板粘贴防 Monaco 自动闭括号）
    await editPage.setEditorMode('配置');
    await editPage.editor.click();
    await page.evaluate((c) => navigator.clipboard.writeText(c), '{ broken');
    await page.keyboard.press('Control+KeyA');
    await page.keyboard.press('Control+V');
    await editPage.checkError('配置 JSON 错误');

    // 直达钮只在配置错误时出现（代码错误不给）
    await expect(page.getByTestId('error-reset-config')).toBeVisible();
    await page.getByTestId('error-reset-config').click();
    await expect(page.getByText('已重置为默认配置')).toBeVisible();
    await expect(page.getByTestId('error-container')).toHaveCount(0);
    await expect(editPage.editor).toContainText('"theme": "default"');

    // 代码错误时该钮不出现
    await editPage.setEditorMode('代码');
    await editPage.clearEditor();
    await editPage.typeInEditor('graph TD\nA --> B -->');
    await editPage.checkError('图表语法错误');
    await expect(page.getByTestId('error-reset-config')).toHaveCount(0);
  });

  test('配置错误横幅提供「转到配置页」直达钮（仅代码页在前时）', async ({ page, editPage }) => {
    // 破坏配置 JSON（剪贴板粘贴防 Monaco 自动闭括号）
    await editPage.setEditorMode('配置');
    await editPage.editor.click();
    await page.evaluate((c) => navigator.clipboard.writeText(c), '{ broken');
    await page.keyboard.press('Control+KeyA');
    await page.keyboard.press('Control+V');
    await editPage.checkError('配置 JSON 错误');

    // 已在配置页：波浪线就在眼前，直达钮不必出现
    await expect(page.getByTestId('error-goto-config')).toHaveCount(0);

    // 切回代码页：横幅仍在（错误源是配置），直达钮出现
    await editPage.setEditorMode('代码');
    await editPage.checkError('配置 JSON 错误');
    const gotoButton = page.getByTestId('error-goto-config');
    await expect(gotoButton).toBeVisible();

    // 一键回到配置页：按钮消失，编辑器里就是待修的 JSON
    await gotoButton.click();
    await expect(page.getByTestId('error-goto-config')).toHaveCount(0);
    await expect(editPage.editor).toContainText('broken');
  });

  test('复制错误内容到剪贴板', async ({ page, context, editPage }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await editPage.clearEditor();
    await editPage.typeInEditor('graph TD\nA --> B -->');
    await editPage.checkError('语法错误');

    await page.getByTestId('error-copy').click();
    await expect(page.getByText('已复制错误内容')).toBeVisible();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain('Parse error');
  });

  // Clearing the editor must clear the persisted code too: swallowing the
  // empty edit left exports/share URL/history carrying the previous diagram
  // while the editor showed an empty document (MobileEditor always
  // propagated; this pins the desktop parity).
  test('clearing the editor clears the persisted code', async ({ editPage }) => {
    await editPage.clearEditor();
    await editPage.checkError('语法错误');
    const codeLength = await editPage.page.evaluate(
      () => (JSON.parse(localStorage.getItem('codeStore') ?? '{}').code ?? '').length
    );
    expect(codeLength).toBe(0);
  });
});
