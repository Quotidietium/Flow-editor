import { expect, test, type Page } from '@playwright/test';

// Per-kind import smoke for every non-flowchart kind without a dedicated
// interactive spec: the visual editor opens the right view (board / sheet /
// outline / canvas), renders the imported content, and keeps the code
// header. Fixtures mirror the unit-suite FIXTURES (official example shapes).
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

const CASES: { code: string; header: string; kind: string; view: string }[] = [
  {
    code: 'gantt\n  title 计划\n  dateFormat YYYY-MM-DD\n  section 规划\n    市场调研 :2024-03-01, 10d',
    header: 'gantt',
    kind: 'gantt',
    view: 'visual-board'
  },
  {
    code: 'timeline\n  2002 : LinkedIn\n  2004 : Facebook',
    header: 'timeline',
    kind: 'timeline',
    view: 'visual-board'
  },
  {
    code: 'packet-beta\n  0-15: "源端口"\n  16-31: "目的端口"',
    header: 'packet-beta',
    kind: 'packet',
    view: 'visual-sheet'
  },
  {
    code: 'railroad-ebnf-beta\n  expression = term ( "+" term )* ;',
    header: 'railroad-ebnf-beta',
    kind: 'railroad',
    view: 'visual-sheet'
  },
  {
    code: 'venn-beta\n  set A\n  set B\n  union A,B["交集"]',
    header: 'venn-beta',
    kind: 'venn',
    view: 'visual-sheet'
  },
  {
    code: 'xychart-beta\n  x-axis [jan, feb]\n  y-axis 0 --> 10\n  bar [5, 6]',
    header: 'xychart-beta',
    kind: 'xychart',
    view: 'visual-sheet'
  },
  {
    code: 'ishikawa-beta\n  模糊照片\n  工艺\n    对焦不准',
    header: 'ishikawa-beta',
    kind: 'ishikawa',
    view: 'visual-outline'
  },
  {
    code: 'swimlane-beta\n  甲\n    任务1\n  乙\n    任务2',
    header: 'swimlane-beta',
    kind: 'swimlane',
    view: 'visual-outline'
  },
  {
    code: 'treeView-beta\n  项目/\n    src/\n      App.tsx',
    header: 'treeView-beta',
    kind: 'treeview',
    view: 'visual-outline'
  },
  {
    code: 'architecture-beta\n  service db(database)[DB]\n  service srv(server)[Srv]\n  db:L -- R:srv',
    header: 'architecture-beta',
    kind: 'architecture',
    view: 'visual-canvas'
  },
  {
    code: 'block-beta\n  columns 2\n  a["甲"] b["乙"]\n  a --> b',
    header: 'block-beta',
    kind: 'block',
    view: 'visual-canvas'
  },
  {
    code: 'C4Context\n  title T\n  Person(u, "用户")\n  System(s, "系统")\n  Rel(u, s, "使用")',
    header: 'C4Context',
    kind: 'c4',
    view: 'visual-canvas'
  },
  {
    code: 'requirementDiagram\n  requirement R {\n    id: 1\n    text: 安全\n  }\n  element E {\n  }\n  R - contains -> E',
    header: 'requirementDiagram',
    kind: 'requirement',
    view: 'visual-canvas'
  },
  {
    code: 'sankey-beta\n  工资,预算,3000\n  预算,房租,1300',
    header: 'sankey-beta',
    kind: 'sankey',
    view: 'visual-canvas'
  },
  {
    code: 'wardley-beta\n  title 茶店\n  component 茶杯 [0.79, 0.61]\n  component 水壶 [0.43, 0.35]\n  茶杯 -> 水壶',
    header: 'wardley-beta',
    kind: 'wardley',
    view: 'visual-canvas'
  }
];

test('every remaining non-flowchart kind imports into its dedicated view', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await openEditor(page);
  const codeOut = page.getByTestId('visual-code-out');

  for (const { code, header, kind, view } of CASES) {
    // Monaco refuses clipboard paste while the visual tab owns the workspace,
    // so each round is: paste code → enter visual → assert → leave.
    await typeCode(page, code);
    await page.getByTestId('visual-tab').click();
    await expect(codeOut, kind).toBeVisible();
    const viewEl = page.getByTestId(view);
    await expect(viewEl, kind).toBeVisible();
    await expect(codeOut, kind).toContainText(header);
    if (view === 'visual-canvas') {
      await expect(page.locator('[data-node-id]').first(), kind).toBeVisible();
    } else if (view === 'visual-board') {
      await expect(viewEl.getByTestId('visual-board-card').first(), kind).toBeVisible();
    } else {
      await expect(viewEl.locator('[data-row-id]').first(), kind).toBeVisible();
    }
    await page.getByTestId('visual-tab').click();
    await page.locator('#view').waitFor({ state: 'visible' });
  }
  expect(pageErrors).toEqual([]);
});
