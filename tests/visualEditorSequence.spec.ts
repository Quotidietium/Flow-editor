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

test('sequence editor duplicates a message right after the original', async ({ page }) => {
  await openEditor(page);
  await typeCode(page, 'sequenceDiagram\n  participant A\n  participant B\n  A->>B: 请求');
  const codeOut = await enterVisual(page);
  const editor = page.getByTestId('visual-sequence');

  // 复制：紧邻原位插入全等拷贝（源/目标/箭头/标签一致，新 id）
  await editor.locator('[data-message-id="E1"]').getByTitle('复制消息（紧邻原位插入）').click();
  await expect(editor.locator('[data-message-id]')).toHaveCount(2);
  const copy = editor.locator('[data-message-id="E2"]');
  await expect(copy.getByLabel('消息内容')).toHaveValue('请求');
  await expect(copy.getByLabel('消息源')).toHaveValue('A');
  await expect(copy.getByLabel('消息目标')).toHaveValue('B');
  await expect(codeOut).toContainText('A->>B: 请求\n  A->>B: 请求');

  // 拷贝可独立编辑（改目标/标签不回染原消息）——删除原消息留拷贝
  await editor.locator('[data-message-id="E1"]').getByTitle('删除消息').click();
  await expect(editor.locator('[data-message-id]')).toHaveCount(1);
  await expect(codeOut).toContainText('A->>B: 请求');
});

test('sequence editor filters messages by label/participant without touching data', async ({
  page
}) => {
  await openEditor(page);
  await typeCode(
    page,
    'sequenceDiagram\n  participant A as 爱丽丝\n  participant B as 鲍勃\n  participant C as 卡罗\n  A->>B: 你好\n  B-->>A: 回复\n  A->>C: 拜托'
  );
  const codeOut = await enterVisual(page);
  const editor = page.getByTestId('visual-sequence');

  // 按内容过滤「回复」：1/3，无匹配提示的分支不触发
  const search = editor.getByTestId('visual-sequence-search');
  await search.fill('回复');
  await expect(editor.locator('[data-message-id]')).toHaveCount(1);
  await expect(editor).toContainText('消息 · 1/3');

  // 按参与者名过滤「鲍勃」：涉及鲍勃的两条
  await search.fill('鲍勃');
  await expect(editor.locator('[data-message-id]')).toHaveCount(2);

  // 只过滤显示不动数据：代码三条都在
  const text = (await codeOut.textContent()) ?? '';
  for (const label of ['你好', '回复', '拜托']) {
    expect(text).toContain(label);
  }

  // Esc 清空：全部回来
  await search.press('Escape');
  await expect(editor.locator('[data-message-id]')).toHaveCount(3);
  await expect(editor).toContainText('消息 · 3');
});

test('participant name commits on Enter (blur-free, IME-guarded)', async ({ page }) => {
  await openEditor(page);
  await typeCode(page, 'sequenceDiagram\n  participant A\n  participant B\n  A->>B: 一');
  const codeOut = await enterVisual(page);
  const editor = page.getByTestId('visual-sequence');

  // Enter 即提交（change-on-blur 路径由 enterCommit 触发 blur 完成）
  const nameInput = editor.locator('[data-participant-id="A"]').getByLabel('参与者名称');
  await nameInput.fill('爱丽丝');
  await nameInput.press('Enter');
  await expect(codeOut).toContainText('participant A as 爱丽丝');

  // 消息内容同路径
  const messageInput = editor.locator('[data-message-id="E1"]').getByLabel('消息内容');
  await messageInput.fill('你好世界');
  await messageInput.press('Enter');
  await expect(codeOut).toContainText('A->>B: 你好世界');
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
