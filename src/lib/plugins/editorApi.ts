/**
 * The imperative editor API exposed to plugins and the bridge. Lives in a
 * single object on window so the plugin runtime and MCP bridge can reach it
 * without import cycles; everything routes through the state gateway.
 */

import { runInputTransforms } from './registry.svelte';
import { updateCode, updateCodeStore, validatedState } from '$/util/state.svelte';

export interface EditorApi {
  getState(): { code: string; mermaid: string; rough: boolean };
  setCode(code: string): void;
  setState(state: { code: string; mermaid?: string }): void;
  getSvg(): string | undefined;
  exportPngDataUrl(): Promise<string | undefined>;
}

declare global {
  interface Window {
    __FLOW_EDITOR_API__?: EditorApi;
    __FLOW_EDITOR_STATE__?: EditorApi['getState'];
  }
}

// Bridge writes (setCode/setState) pass through the plugin input pipeline
// (source 'bridge') before entering the state gateway.
export const installEditorApi = (): void => {
  const getSvg = (): string | undefined =>
    document.querySelector<SVGSVGElement>('#container svg')?.outerHTML;

  window.__FLOW_EDITOR_STATE__ = () => ({
    code: validatedState.current.code,
    mermaid: validatedState.current.mermaid,
    rough: validatedState.current.rough ?? false
  });

  window.__FLOW_EDITOR_API__ = {
    // Real rasterization: svg → <img> → canvas → PNG data URL. Returns
    // undefined when nothing is rendered or canvas is unavailable (the old
    // implementation returned the SVG data URL under a png name — a lie the
    // MCP 'png-dataurl' tool surfaced to AI callers).
    exportPngDataUrl: async () => {
      const svg = getSvg();
      if (!svg) {
        return undefined;
      }
      try {
        const image = new Image();
        const loaded = new Promise<boolean>((resolve) => {
          image.addEventListener('load', () => resolve(true));
          image.addEventListener('error', () => resolve(false));
        });
        image.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
        if (!(await loaded)) {
          return undefined;
        }
        const width = Math.max(1, Math.round(image.width || 800));
        const height = Math.max(1, Math.round(image.height || 600));
        const canvas = document.createElement('canvas');
        canvas.width = width * 2;
        canvas.height = height * 2;
        const context = canvas.getContext('2d');
        if (!context) {
          return undefined;
        }
        context.fillStyle =
          window.getComputedStyle(document.body).getPropertyValue('--background') || '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png');
      } catch {
        return undefined;
      }
    },
    getState: () => window.__FLOW_EDITOR_STATE__?.() ?? { code: '', mermaid: '{}', rough: false },
    getSvg,
    setCode: (code) => updateCode(runInputTransforms(code, 'bridge'), { updateDiagram: true }),
    setState: (state) =>
      updateCodeStore({
        ...(state.mermaid !== undefined ? { mermaid: state.mermaid } : {}),
        code: runInputTransforms(state.code, 'bridge'),
        updateDiagram: true
      })
  };
};
