/**
 * Flow-editor plugin API — type surface.
 *
 * A plugin is an ES module whose default export is a `FlowPlugin` object:
 * a manifest (id/name/version) plus optional hooks. Plugins are installed
 * by the user from a local `.mjs`/`.js` file (see PluginManager) and their
 * source is persisted in localStorage; every hook invocation is wrapped in
 * error isolation so a broken plugin can never take the editor down.
 */

export interface PluginManifest {
  /** Stable unique id (reverse-dns or slug recommended). */
  id: string;
  name: string;
  version: string;
  description?: string;
  /** Declared capabilities — shown to the user before enabling. */
  permissions?: PluginPermission[];
}

export type PluginPermission =
  | 'input:transform' // rewrite diagram source entering the editor
  | 'import:file' // handle custom file formats in 打开
  | 'export:format' // add formats to the 导出 menu
  | 'ui:theme' // override theme CSS variables
  | 'ui:frontend' // replace the whole UI with an iframe frontend
  | 'ai:mcp'; // expose editor tools over the MCP bridge

export interface PluginContext {
  /** Editor state snapshot (code, config, theme flags). */
  getState(): {
    code: string;
    mermaid: string;
    rough: boolean;
  };
  /** Replace the diagram source (goes through the state gateway). */
  setCode(code: string): void;
  /** Replace source + mermaid config at once. */
  setState(state: { code: string; mermaid?: string }): void;
  /** Show a toast to the user. */
  notify(message: string): void;
  /** Editor storage namespace: `flow-plugin:<id>:*` keys. */
  storage: {
    get<T>(key: string, fallback: T): T;
    set(key: string, value: unknown): void;
  };
  /** Current rendered SVG (outerHTML) or undefined when not rendered. */
  getSvg(): string | undefined;
}

/** Input pipeline: rewrite source entering the editor (cleaning/format conversion). */
export interface InputTransformHook {
  /** Human-readable label shown in logs/manager. */
  name: string;
  /**
   * @param code incoming diagram source
   * @param source where it came from: 'file' | 'bridge' | 'url'
   * @returns transformed source (return `code` unchanged to pass through)
   */
  transform(code: string, source: 'bridge' | 'file' | 'url'): string;
}

/** Custom file import: claim files by extension in the 打开 flow. */
export interface ImportHandler {
  /** Extensions without dot, e.g. ['puml', 'plantuml']. */
  extensions: string[];
  name: string;
  /**
   * Parse file content into editor input; return undefined to decline (the
   * built-in parser then takes over). `bytes` is the raw payload for binary
   * formats — `text` is a lossy UTF-8 decode and must not be round-tripped.
   * May be async (zip inflation etc.).
   */
  import(
    file: { bytes?: Uint8Array; name: string; text: string },
    ctx: PluginContext
  ):
    | { code: string; mermaid?: string }
    | undefined
    | Promise<{ code: string; mermaid?: string } | undefined>;
}

/** Custom export format appended to the 导出 menu. */
export interface ExportFormat {
  id: string;
  /** Menu label, e.g. 'MC 数据包 (.mcfunction)'. */
  label: string;
  /**
   * Produce the export payload. Receiving the rendered SVG string keeps the
   * plugin independent from the DOM. May be async (e.g. desktop IPC builds);
   * returning undefined after ctx.notify() surfaces the reason as a toast.
   */
  run(
    input: { code: string; svg: string | undefined; config: string },
    ctx: PluginContext
  ):
    | { blob?: Blob; text?: string; mime: string; filename: string }
    | undefined
    | Promise<{ blob?: Blob; text?: string; mime: string; filename: string } | undefined>;
}

/** Theme override: CSS custom properties and/or arbitrary CSS. */
export interface ThemeHook {
  /** Plain key/value map applied as inline CSS variables on :root. */
  variables?: Record<string, string>;
  /**
   * Arbitrary CSS appended after the variables — layout tweaks, background
   * images (贴图), font swaps, anything expressible in CSS.
   */
  css?: string;
}

/**
 * Full frontend replacement: the plugin hosts a web page (data:, blob: or
 * http(s):// URL) rendered in a sandboxed iframe that talks to the editor
 * through the postMessage bridge (see bridge.ts). Use
 * `window.parent.postMessage({ channel: 'flow-editor', ... }, '*')`.
 */
export interface FrontendHook {
  url: string;
  /** Sandbox flags; defaults allow scripts + same-origin data/blob pages. */
  sandbox?: string;
}

export interface FlowPlugin extends PluginManifest {
  inputTransform?: InputTransformHook;
  import?: ImportHandler;
  /** Single custom export format appended to the 导出 menu. */
  export?: ExportFormat;
  /**
   * Multiple export formats (2.0.137): each becomes its own 导出 menu item.
   * Takes precedence over the legacy single `export` when both are present.
   */
  exports?: ExportFormat[];
  theme?: ThemeHook;
  frontend?: FrontendHook;
  /** Called once when the plugin activates. */
  activate?(ctx: PluginContext): void;
  /** Called when the plugin is disabled/removed. */
  deactivate?(): void;
}

/** Stored plugin record (source text + user toggles). */
export interface InstalledPlugin {
  manifest: PluginManifest;
  /** Raw module source, re-imported from a data: URL at load time. */
  source: string;
  enabled: boolean;
  installedAt: string;
  /**
   * Built-in plugin (2.0.138): seeded from the bundle at load, source
   * refreshed on app upgrade (the user's enabled choice is preserved),
   * and it cannot be uninstalled — only disabled.
   */
  builtin?: boolean;
}
