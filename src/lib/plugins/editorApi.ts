/**
 * The imperative editor API exposed to plugins and the bridge. Lives in a
 * single object on window so the plugin runtime and MCP bridge can reach it
 * without import cycles; everything routes through the state gateway.
 */

import { runInputTransforms } from './registry.svelte';
import { updateCode, updateCodeStore, validatedState } from '$/util/state.svelte';

export interface EditorApi {
  getState(): { code: string; mermaid: string; rough: boolean; title?: string };
  setCode(code: string): void;
  setState(state: { code: string; mermaid?: string }): void;
  getSvg(): string | undefined;
  exportPngDataUrl(): string | undefined;
}

declare global {
  interface Window {
    __FLOW_EDITOR_API__?: EditorApi;
    __FLOW_EDITOR_STATE__?: () => EditorApi['getState'] extends () => infer S ? S : never;
  }
}

export const installEditorApi = (): void => {
  const getSvg = (): string | undefined =>
    document.querySelector<SVGSVGElement>('#container svg')?.outerHTML;

  window.__FLOW_EDITOR_STATE__ = () => ({
    code: validatedState.current.code,
    mermaid: validatedState.current.mermaid,
    rough: validatedState.current.rough ?? false,
    title: validatedState.current.serialized === undefined ? undefined : undefined
  });

  window.__FLOW_EDITOR_API__ = {
    exportPngDataUrl: () => {
      const svg = getSvg();
      if (!svg) {
        return undefined;
      }
      return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
    },
    getSvg,
    getState: () => window.__FLOW_EDITOR_STATE__?.() ?? { code: '', mermaid: '{}', rough: false },
    // Bridge writes pass through the plugin input pipeline (source 'bridge').
    setCode: (code) => updateCode(runInputTransforms(code, 'bridge'), { updateDiagram: true }),
    setState: (state) =>
      updateCodeStore({
        code: runInputTransforms(state.code, 'bridge'),
        ...(state.mermaid !== undefined ? { mermaid: state.mermaid } : {}),
        updateDiagram: true
      })
  };
};
