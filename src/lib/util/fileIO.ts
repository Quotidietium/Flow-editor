/**
 * Local file save/open and multi-format export helpers for the diagram
 * source. Text artefacts download through Blob URLs (UTF-8 safe); pure
 * builders are unit-tested.
 */

import dayjs from 'dayjs';
import { toBase64 } from 'js-base64';

export const diagramFileName = (extension: string): string =>
  `mermaid-diagram-${dayjs().format('YYYY-MM-DD-HHmmss')}.${extension}`;

// 自定义导出文件名（循环 134）：非空基础名 → `<基础名>-<时间戳>.<ext>`
// （时间戳防同名覆盖）。基础名消毒 Windows 非法字符（\\/ : * ? " < > |
// 与控制符）为 `-`、压平空白、去掉结尾的点/空格；消毒后为空回退默认
// 时间戳名。dayjs 两次取值在同一毫秒内一致。
const sanitizeFileNameBase = (base: string): string =>
  base
    // 控制字符正是消毒目标（文件名合法化），豁免 no-control-regex
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/, '');

export const buildExportFileName = (base: string, extension: string): string => {
  const clean = sanitizeFileNameBase(base);
  // 全部由非法字符消毒而来的连字符串（如 "/*?" → "---"）无意义，视同空
  const stem =
    clean && !/^-+$/.test(clean)
      ? `${clean}-${dayjs().format('YYYY-MM-DD-HHmmss')}`
      : `mermaid-diagram-${dayjs().format('YYYY-MM-DD-HHmmss')}`;
  return `${stem}.${extension}`;
};

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
 * `scale`（导出倍数 1–4）在结果上整体放大并夹取到单边上限——高倍用于
 * 投影/打印的清晰位图，超限时退回上限内的最大整数倍。
 */
export const exportCanvasSize = (
  mode: 'auto' | 'width' | 'height',
  imageSize: number,
  contentWidth: number,
  contentHeight: number,
  scale = 1
): { height: number; width: number } => {
  const contentW = Math.max(1, Math.round(contentWidth));
  const contentH = Math.max(1, Math.round(contentHeight));
  const factor = Number.isFinite(scale) ? Math.min(4, Math.max(1, Math.round(scale))) : 1;
  if (mode === 'width') {
    const size = clampImageSize(imageSize) * factor;
    const width = Math.min(IMAGE_SIZE_MAX, size);
    return { height: Math.round((width * contentH) / contentW), width };
  }
  if (mode === 'height') {
    const size = clampImageSize(imageSize) * factor;
    const height = Math.min(IMAGE_SIZE_MAX, size);
    return { height, width: Math.round((height * contentW) / contentH) };
  }
  return {
    height: Math.min(IMAGE_SIZE_MAX, contentH * 2 * factor),
    width: Math.min(IMAGE_SIZE_MAX, contentW * 2 * factor)
  };
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

/** Download an already-encoded dataURL payload (raster exports). */
export const downloadDataUrl = (filename: string, dataUrl: string): void => {
  const a = document.createElement('a');
  a.download = filename;
  a.href = dataUrl;
  a.click();
  a.remove();
};

/**
 * 把当前渲染出的图表序列化为独立 SVG 文档（/view 只读页下载用）。
 * 克隆脱离现场：svg-pan-zoom 的 viewport 包装层把用户当前平移/缩放烘在
 * matrix transform 里——剥掉后下载件呈现完整图形而非屏幕截图视角；
 * 顺带补 xlink 命名空间与自闭合标签规整（与编辑器导出同源规则）。
 * withBackground 时以页面 --background 垫底（透明底在文档里可能看不清）。
 */
export const svgMarkupOf = (root: ParentNode, withBackground = true): string | undefined => {
  const svg = root.querySelector('#container svg')?.cloneNode(true) as HTMLElement | undefined;
  if (!svg) {
    return undefined;
  }
  svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  for (const viewport of svg.querySelectorAll('.svg-pan-zoom_viewport')) {
    // svg-pan-zoom 版本间位置不一：transform 属性 或 style="transform: matrix(…)"
    viewport.removeAttribute('transform');
    (viewport as HTMLElement).style?.removeProperty('transform');
    if (viewport.getAttribute('style')?.trim() === '') {
      viewport.removeAttribute('style');
    }
  }
  if (withBackground) {
    svg.style.backgroundColor = window
      .getComputedStyle(document.body)
      .getPropertyValue('--background');
  }
  const svgString = svg.outerHTML
    .replaceAll('<br>', '<br/>')
    .replaceAll(/<img([^>]*)>/g, (_match, attrs: string) => `<img ${attrs} />`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${svgString}`;
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
