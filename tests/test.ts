import { TID } from '$/constants';
import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { verifyFileSizeGreaterThan, type EditorOptions } from './utils';

export class EditorPage {
  readonly editor: Locator;
  readonly view: Locator;

  constructor(readonly page: Page) {
    this.editor = page.locator('css=.monaco-editor');
    this.view = page.locator('#view');
  }

  async start(url = '/edit') {
    await this.page.goto(url);
    await expect(this.page)
      .toHaveURL(/.*\/edit#pako/)
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      .catch(() => {});
  }

  async typeInEditor(text: string, { bottom = true, newline = false }: EditorOptions = {}) {
    await this.editor.click();
    if (bottom) {
      await this.page.keyboard.press('PageDown');
    }
    if (newline) {
      await this.page.keyboard.press('Enter');
    }
    await this.page.keyboard.type(text, { delay: 10 });
  }

  async clearEditor() {
    await this.editor.click();
    await this.page.keyboard.press('Control+KeyA');
    await this.page.keyboard.press('Backspace');
  }

  async toggleActions() {
    await this.page.getByText('操作', { exact: true }).click();
  }

  async toggleSampleDiagrams() {
    await this.page.getByText('示例图表', { exact: true }).click();
  }

  // Opening the 示例图表 card collapses the stacked 操作 card — expand it if
  // needed before touching any of its controls.
  async ensureActionsOpen() {
    if (
      !(await this.page
        .getByTestId(TID.exportMenu)
        .isVisible()
        .catch(() => false))
    ) {
      await this.page.getByText('操作', { exact: true }).click();
    }
    await this.page.getByTestId(TID.exportMenu).waitFor({ state: 'visible' });
  }

  async openExportMenu() {
    await this.ensureActionsOpen();
    // Selections auto-close the menu — only click when it is closed.
    if (
      !(await this.page
        .getByTestId(TID.exportMenuList)
        .isVisible()
        .catch(() => false))
    ) {
      await this.page.getByTestId(TID.exportMenu).click();
    }
    await this.page.getByTestId(TID.exportMenuList).waitFor({ state: 'visible' });
  }

  async checkAndDownloadPNG(expectedSize: number) {
    const downloadPNGPromise = verifyFileSizeGreaterThan(this.page, 'diagram', 'png', expectedSize);
    await this.openExportMenu();
    await this.page.getByTestId(TID.downloadPNG).click();
    return await downloadPNGPromise;
  }

  async downloadSVG(expectedSize: number) {
    const downloadSVGPromise = verifyFileSizeGreaterThan(this.page, 'diagram', 'svg', expectedSize);
    await this.openExportMenu();
    await this.page.getByTestId(TID.downloadSVG).click();
    return await downloadSVGPromise;
  }

  async loadSampleDiagram(diagramName: string) {
    await this.page.getByText(diagramName, { exact: true }).click();
  }

  async checkTextInView(text: string) {
    await expect(this.view).toContainText(text);
  }

  async checkTextNotInView(text: string) {
    await expect(this.view).not.toContainText(text);
  }

  async checkError(text: string) {
    await expect(this.page.getByTestId(TID.errorContainer)).toContainText(text, {
      timeout: 10_000
    });
  }

  async checkInEditor(text: string) {
    await expect(this.editor).toContainText(text);
  }

  async toggleComment(text: string) {
    await this.editor.getByText(text).click();
    await this.page.keyboard.press('Control+/');
  }

  async setEditorMode(mode: '代码' | '配置') {
    await this.page.getByRole('tab').getByText(mode).click();
  }

  async toggleTheme() {
    await this.page.getByTestId(TID.themeToggleButton).click();
  }

  async checkTheme(theme: 'light' | 'dark') {
    await expect(this.page.getByTestId(TID.themeToggleButton)).toHaveAttribute(
      'title',
      `切换到${theme === 'light' ? '深色' : '浅色'}主题`
    );
  }
}

export const test = base.extend<{ editPage: EditorPage }>({
  editPage: async ({ page }, use) => {
    const editorPage = new EditorPage(page);
    await editorPage.start();
    await editorPage.toggleSampleDiagrams();
    await use(editorPage);
  }
});

export { expect } from '@playwright/test';
