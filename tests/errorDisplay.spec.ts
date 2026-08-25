import { expect, test } from './test';

test.describe('Error display tests', () => {
  test('should show syntax error for invalid diagram code', async ({ editPage }) => {
    // Enter code with syntax error
    await editPage.clearEditor();
    await editPage.typeInEditor('graph TD\nA --> B -->');

    // Verify error is displayed
    await editPage.checkError('语法错误');
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

    // Verify error is displayed
    await editPage.checkError('语法错误');
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
