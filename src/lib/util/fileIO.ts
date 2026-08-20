/**
 * Local file save/open and multi-format export helpers for the diagram
 * source. Text artefacts download through Blob URLs (UTF-8 safe); pure
 * builders are unit-tested.
 */

import dayjs from 'dayjs';
import { toBase64 } from 'js-base64';

export const diagramFileName = (extension: string): string =>
  `mermaid-diagram-${dayjs().format('YYYY-MM-DD-HHmmss')}.${extension}`;

/** Wrap mermaid source in a fenced Markdown code block. */
export const markdownOf = (code: string): string =>
  `# Mermaid 图表\n\n\`\`\`mermaid\n${code.trimEnd()}\n\`\`\`\n`;

export interface StateFile {
  code: string;
  mermaid: string;
  savedAt: string;
  version: 1;
}

/** Full-state snapshot file (source + config) that 打开 can restore. */
export const stateFileOf = (code: string, mermaid: string): StateFile => ({
  code,
  mermaid,
  savedAt: new Date().toISOString(),
  version: 1
});

/**
 * Parse an opened file back into editor input: `.json` state files restore
 * code+config, anything else is treated as raw mermaid source (Markdown
 * fences stripped). Returns undefined for unusable content.
 */
export const parseOpenedFile = (
  name: string,
  text: string
): { code: string; mermaid?: string } | undefined => {
  const trimmed = text.trim();
  if (trimmed === '') {
    return undefined;
  }
  if (name.toLowerCase().endsWith('.json')) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<StateFile>;
      if (typeof parsed.code === 'string' && parsed.code.trim() !== '') {
        return {
          code: parsed.code,
          mermaid: typeof parsed.mermaid === 'string' ? parsed.mermaid : undefined
        };
      }
      return undefined;
    } catch {
      return undefined;
    }
  }
  // Extract the first fenced ```mermaid block if the file is Markdown.
  const fence = /```(?:mermaid)?\s*\n([\s\S]*?)\n```/.exec(trimmed);
  const code = fence ? (fence[1] as string) : trimmed;
  return code.trim() === '' ? undefined : { code };
};

/** Download a text payload as a local file. Base64 data: URL — the exact
 * channel the SVG export uses (plain-encoded and blob downloads proved
 * unreliable to capture in embedded/headless Chromiums). */
export const downloadTextFile = (filename: string, text: string, mime: string): void => {
  const a = document.createElement('a');
  a.download = filename;
  a.href = `data:${mime};charset=utf-8;base64,${toBase64(text)}`;
  a.click();
  a.remove();
};

/** Pick an `<input type=file>` in the DOM (visible or hidden) for uploads. */
export const openTextFile = (accept: string): Promise<{ name: string; text: string } | undefined> =>
  new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(undefined);
        return;
      }
      void file.text().then((text) => {
        resolve({ name: file.name, text });
        input.remove();
      });
    });
    input.addEventListener('cancel', () => {
      resolve(undefined);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
