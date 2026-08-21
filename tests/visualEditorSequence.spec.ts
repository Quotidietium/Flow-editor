import { expect, test, type Page } from '@playwright/test';

// Sequence editor (sequenceDiagram / zenuml): participants and messages edit
// as ordered lists instead of the free canvas.
test.use({ viewport: { height: 1080, width: 1920 } });

const openEditor = async (page: Page): Promise<void> => {
  await page.goto('/edit');
  await page.locator('#view').waitFor({ state: 'visible' });
  await page.waitForTimeout(1200);
  await page.goto('/edit');
  await page.locator('#view').waitFor({ state: 'visible' });
};

const typeCode = async (page: Page, code: string): Promise<void> => {
  const editor = page.locator('.monaco-editor');
  await editor.click();
  await page.evaluate((c) => navigator.clipboard.writeText(c), code);
  await page.keyboard.press('Control+KeyA');
  await page.keyboard.press('Control+V');
  await expect(editor).toContainText(code.split('\n')[0]?.trim() ?? '');
};

const enterVisual = async (page: Page): Promise<ReturnType<Page['getByTestId']>> => {
  await page.getByTestId('visual-tab').click();
  const codeOut = page.getByTestId('visual-code-out');
  await expect(codeOut).toBeVisible();
  return codeOut;
};

test('sequence editor manages participants and messages as ordered lists', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await openEditor(page);
  await typeCode(
    page,
    'sequenceDiagram\n  participant A as 爱丽丝\n  participant B as 鲍勃\n  A->>B: 你好\n  B-->>A: 回复'
  );
  const codeOut = await enterVisual(page);

  const editor = page.getByTestId('visual-sequence');
  await expect(editor).toBeVisible();
  await expect(page.getByTestId('visual-canvas')).toHaveCount(0);
  await expect(editor.locator('[data-participant-id]')).toHaveCount(2);
  await expect(editor.locator('[data-message-id]')).toHaveCount(2);

  // Reorder participants: B before A in the declarations.
  await editor.locator('[data-participant-id="B"]').getByTitle('左移').click();
  let text = (await codeOut.textContent()) ?? '';
  expect(text.indexOf('participant B')).toBeLessThan(text.indexOf('participant A'));

  // Reorder messages: the reply moves above the greeting.
  await editor.locator('[data-message-id="E2"]').getByTitle('上移').click();
  text = (await codeOut.textContent()) ?? '';
  expect(text.indexOf('B-->>A: 回复')).toBeLessThan(text.indexOf('A->>B: 你好'));

  // Change the greeting arrow to a dashed open one and edit its label.
  const first = editor.locator('[data-message-id="E1"]');
  await first.getByLabel('箭头').selectOption('msgDashedOpen');
  await first.getByLabel('消息内容').fill('早上好');
  await first.getByLabel('消息内容').blur();
  await expect(codeOut).toContainText('A--)B: 早上好');
  expect(pageErrors).toEqual([]);
});

test('sequence editor adds participants and messages', async ({ page }) => {
  await openEditor(page);
  await typeCode(page, 'sequenceDiagram\n  participant A\n  participant B\n  A->>B: 一');
  const codeOut = await enterVisual(page);
  const editor = page.getByTestId('visual-sequence');

  // New participant autofocuses its name input.
  await editor.getByTestId('visual-sequence-add-participant').click();
  await page.keyboard.type('卡罗');
  await page.keyboard.press('Enter');
  await expect(codeOut).toContainText('participant N3 as 卡罗');

  // New message defaults to the first two participants; retarget to 卡罗.
  await editor.getByTestId('visual-sequence-add-message').click();
  const newMessage = editor.locator('[data-message-id="E2"]');
  await newMessage.getByLabel('消息目标').selectOption('N3');
  await newMessage.getByLabel('消息内容').fill('二');
  await newMessage.getByLabel('消息内容').blur();
  await expect(codeOut).toContainText('A->>N3: 二');

  // Deleting a participant cascades its messages away.
  await editor.locator('[data-participant-id="N3"]').getByTitle(/删除/).click();
  await expect(codeOut).not.toContainText('N3');
  await expect(codeOut).toContainText('A->>B: 一');
});

test('zenuml uses the sequence editor with its two arrow types', async ({ page }) => {
  await openEditor(page);
  await typeCode(page, 'zenuml\n  title: 演示\n  A->B: 同步\n  B-->A: 异步');
  const codeOut = await enterVisual(page);
  const editor = page.getByTestId('visual-sequence');
  await expect(editor).toBeVisible();

  // Only solid/dashed are offered for zenuml.
  const arrowSelect = editor.locator('[data-message-id="E1"]').getByLabel('箭头');
  await expect(arrowSelect.locator('option')).toHaveCount(2);

  await arrowSelect.selectOption('msgDashedFilled');
  await expect(codeOut).toContainText('A-->B: 同步');
});
