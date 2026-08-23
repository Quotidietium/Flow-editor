import { describe, expect, it } from 'vitest';
import {
  IMAGE_SIZE_DEFAULT,
  IMAGE_SIZE_MAX,
  IMAGE_SIZE_MIN,
  clampImageSize,
  diagramFileName,
  exportCanvasSize,
  markdownOf,
  openTextFile,
  parseOpenedFile,
  stateFileOf
} from './fileIO';

describe('diagramFileName', () => {
  it('builds a timestamped file name with the given extension', () => {
    expect(diagramFileName('mmd')).toMatch(/^mermaid-diagram-\d{4}-\d{2}-\d{2}-\d{6}\.mmd$/);
    expect(diagramFileName('json')).toMatch(/\.json$/);
  });
});

describe('markdownOf', () => {
  it('wraps the source in a fenced mermaid block', () => {
    const md = markdownOf('flowchart TD\n  A --> B\n');
    expect(md).toContain('```mermaid');
    expect(md).toContain('flowchart TD');
    expect(md.trimEnd().endsWith('```')).toBe(true);
  });
});

describe('stateFileOf / parseOpenedFile', () => {
  it('round-trips a state file with code and config', () => {
    const state = stateFileOf('flowchart TD\n  A --> B', '{"theme":"default"}');
    const parsed = parseOpenedFile('diagram.json', JSON.stringify(state));
    expect(parsed?.code).toContain('A --> B');
    expect(parsed?.mermaid).toContain('default');
  });

  it('reads raw .mmd sources verbatim', () => {
    const parsed = parseOpenedFile('a.mmd', 'pie\n  "A": 1');
    expect(parsed?.code).toBe('pie\n  "A": 1');
    expect(parsed?.mermaid).toBeUndefined();
  });

  it('strips a fenced markdown block', () => {
    const parsed = parseOpenedFile('a.md', '# Title\n\n```mermaid\ngraph TD\n  A-->B\n```\n');
    expect(parsed?.code).toBe('graph TD\n  A-->B');
  });

  it('rejects empty content and malformed JSON', () => {
    expect(parseOpenedFile('a.mmd', '   ')).toBeUndefined();
    expect(parseOpenedFile('a.json', 'not json')).toBeUndefined();
    expect(parseOpenedFile('a.json', JSON.stringify({ noCode: true }))).toBeUndefined();
  });
});

describe('exportCanvasSize / clampImageSize', () => {
  it('keeps typed sizes inside the spinner bounds (HTML min/max does not)', () => {
    // Typed 0/negative would silently produce an empty canvas.
    expect(clampImageSize(0)).toBe(IMAGE_SIZE_MIN);
    expect(clampImageSize(-500)).toBe(IMAGE_SIZE_MIN);
    // Typed 1e9 is an allocation the browser refuses (blank export).
    expect(clampImageSize(1e9)).toBe(IMAGE_SIZE_MAX);
    // Cleared input binds null/NaN — falls back rather than poisoning the canvas.
    expect(clampImageSize(Number.NaN)).toBe(IMAGE_SIZE_DEFAULT);
    expect(clampImageSize(null as unknown as number)).toBe(IMAGE_SIZE_DEFAULT);
    expect(clampImageSize(320.7)).toBe(321);
  });

  it('scales the free side by the content ratio in width/height modes', () => {
    expect(exportCanvasSize('width', 1000, 800, 400)).toEqual({ height: 500, width: 1000 });
    expect(exportCanvasSize('height', 500, 800, 400)).toEqual({ height: 500, width: 1000 });
  });

  it('collapses degenerate content dimensions instead of a NaN/Infinity ratio', () => {
    // viewBox 0 and rect 0 (hidden pane) previously made ratio = Infinity/NaN,
    // which canvas.width silently treated as 0.
    const size = exportCanvasSize('width', 1000, 0, 0);
    expect(Number.isFinite(size.width)).toBe(true);
    expect(Number.isFinite(size.height)).toBe(true);
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
  });

  it('auto mode doubles the (collapsed) content size', () => {
    expect(exportCanvasSize('auto', 1e9, 300, 200)).toEqual({ height: 400, width: 600 });
  });
});

describe('openTextFile lifecycle', () => {
  it('removes the hidden input when the change event carries no file', async () => {
    const pending = openTextFile('.mmd');
    const inputsBefore = document.querySelectorAll('input[type=file]').length;
    const input = document.querySelector<HTMLInputElement>('input[type=file]:last-of-type');
    input?.dispatchEvent(new Event('change'));
    await expect(pending).resolves.toBeUndefined();
    // The no-file branch used to resolve without removing the input.
    expect(document.querySelectorAll('input[type=file]').length).toBe(inputsBefore - 1);
  });

  it('resolves undefined instead of hanging when the read fails', async () => {
    const pending = openTextFile('.mmd');
    const input = document.querySelector<HTMLInputElement>('input[type=file]:last-of-type');
    Object.defineProperty(input, 'files', {
      value: [
        {
          arrayBuffer: () => Promise.reject(new Error('read failed')),
          name: 'broken.mmd'
        }
      ]
    });
    input?.dispatchEvent(new Event('change'));
    // A rejected file read used to leave the promise pending forever.
    await expect(pending).resolves.toBeUndefined();
    expect(document.querySelector('input[type=file]')).toBeNull();
  });

  it('returns raw bytes alongside the decoded text', async () => {
    const pending = openTextFile('.zip');
    const input = document.querySelector<HTMLInputElement>('input[type=file]:last-of-type');
    const payload = new TextEncoder().encode('你好 zip');
    Object.defineProperty(input, 'files', {
      value: [
        {
          arrayBuffer: () => Promise.resolve(payload.buffer.slice(0)),
          name: 'pack.zip',
          text: () => Promise.resolve('')
        }
      ]
    });
    input?.dispatchEvent(new Event('change'));
    const result = await pending;
    // Binary formats (plugin datapack imports) need the exact bytes — a text
    // decode is lossy and must never be the only channel.
    expect(Array.from(result?.bytes ?? [])).toEqual(Array.from(payload));
    expect(result?.text).toBe('你好 zip');
    expect(result?.name).toBe('pack.zip');
  });
});
