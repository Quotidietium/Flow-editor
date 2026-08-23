/**
 * Local file save/open and multi-format export helpers for the diagram
 * source. Text artefacts download through Blob URLs (UTF-8 safe); pure
 * builders are unit-tested.
 */

import dayjs from 'dayjs';
import { toBase64 } from 'js-base64';

export const diagramFileName = (extension: string): string =>
  `mermaid-diagram-${dayjs().format('YYYY-MM-DD-HHmmss')}.${extension}`;

// PNG/raster export sizing bounds, shared by the Actions input (HTML
// min/max only advise the spinner — typed values pass straight through).
export const IMAGE_SIZE_MIN = 3;
export const IMAGE_SIZE_MAX = 10_000;
export const IMAGE_SIZE_DEFAULT = 1080;

/**
 * Clamp a typed export size: 0/negative would silently produce an empty
 * canvas, and 1e9 is an allocation the browser refuses (blank export).
 * Non-finite values (empty input binds null/NaN) fall back to the default.
 */
export const clampImageSize = (value: number): number => {
  if (!Number.isFinite(value)) {
    return IMAGE_SIZE_DEFAULT;
  }
  return Math.min(IMAGE_SIZE_MAX, Math.max(IMAGE_SIZE_MIN, Math.round(value)));
};

/**
 * Canvas dimensions for a raster export. `width`/`height` modes lock one
 * side to the clamped size and scale the other by the content ratio; auto
 * doubles the content size. Zero/non-finite content dimensions collapse to
 * 1px first so the ratio can never be Infinity or NaN.
 */
export const exportCanvasSize = (
  mode: 'auto' | 'width' | 'height',
  imageSize: number,
  contentWidth: number,
  contentHeight: number
): { height: number; width: number } => {
  const contentW = Math.max(1, Math.round(contentWidth));
  const contentH = Math.max(1, Math.round(contentHeight));
  if (mode === 'width') {
    const size = clampImageSize(imageSize);
    return { height: Math.round((size * contentH) / contentW), width: size };
  }
  if (mode === 'height') {
    const size = clampImageSize(imageSize);
    return { width: Math.round((size * contentW) / contentH), height: size };
  }
  return { height: contentH * 2, width: contentW * 2 };
};

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

/**
 * Pick an `<input type=file>` in the DOM (visible or hidden) for uploads.
 * Returns both the decoded text and the raw bytes — plugin import handlers
 * need the bytes for binary formats (zip/datapacks); text alone is lossy for
 * any non-UTF8-safe payload.
 */
export const openTextFile = (
  accept: string
): Promise<{ bytes: Uint8Array; name: string; text: string } | undefined> =>
  new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    const finish = (value: { bytes: Uint8Array; name: string; text: string } | undefined): void => {
      resolve(value);
      input.remove();
    };
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        finish(undefined);
        return;
      }
      // A failed read (file deleted/locked after selection) must resolve —
      // an eternally pending promise would leave the caller awaiting forever
      // with no feedback, and the hidden input stranded in the DOM.
      void file
        .arrayBuffer()
        .then((buffer) => {
          const bytes = new Uint8Array(buffer);
          finish({ bytes, name: file.name, text: new TextDecoder().decode(bytes) });
        })
        .catch(() => finish(undefined));
    });
    input.addEventListener('cancel', () => finish(undefined));
    document.body.append(input);
    input.click();
  });
