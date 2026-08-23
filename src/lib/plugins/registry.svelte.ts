/**
 * Plugin registry: persisted plugin sources + user toggles, module loading
 * via blob-URL dynamic import, and hook dispatch with error isolation.
 * Svelte runes state drives the PluginManager UI and the export menu.
 */

import { notify } from '$/util/notify';
import { SvelteMap } from 'svelte/reactivity';
import { readJSON, writeJSON } from '$/util/persist.svelte';
import type {
  ExportFormat,
  FlowPlugin,
  ImportHandler,
  InputTransformHook,
  InstalledPlugin,
  PluginContext
} from './types';

const REGISTRY_KEY = 'flowPlugins';

interface RuntimePlugin {
  installed: InstalledPlugin;
  instance: FlowPlugin | undefined;
  /** Consecutive hook failures — 3 strikes disables the plugin. */
  errors: number;
}

let installed = $state<InstalledPlugin[]>([]);
const runtimes = new SvelteMap<string, RuntimePlugin>();

const activePlugins = (): FlowPlugin[] =>
  installed
    .filter((p) => p.enabled)
    .map((p) => runtimes.get(p.manifest.id)?.instance)
    .filter((p): p is FlowPlugin => Boolean(p));

const makeContext = (id: string): PluginContext => {
  const NS = `flow-plugin:${id}`;
  return {
    getState: () => {
      const state = window.__FLOW_EDITOR_STATE__?.();
      return state ?? { code: '', mermaid: '{}', rough: false };
    },
    getSvg: () => document.querySelector<SVGSVGElement>('#container svg')?.outerHTML,
    notify: (message) => notify(message),
    setCode: (code) => window.__FLOW_EDITOR_API__?.setCode(code),
    setState: (state) => window.__FLOW_EDITOR_API__?.setState(state),
    storage: {
      get<T>(key: string, fallback: T): T {
        return readJSON<T>(`${NS}:${key}`, fallback);
      },
      set(key: string, value: unknown): void {
        writeJSON(`${NS}:${key}`, value);
      }
    }
  };
};

const loadModule = async (source: string): Promise<FlowPlugin | undefined> => {
  try {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    try {
      const mod = (await import(/* @vite-ignore */ url)) as {
        default?: FlowPlugin;
      };
      return mod.default;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
  } catch (error) {
    console.error(`[plugin] load failed: ${String(error)}`);
    return undefined;
  }
};

/** Run one plugin hook isolated; three consecutive failures auto-disable. */
const guarded = <T>(
  id: string,
  run: () => T | undefined,
  fallback: T | undefined
): T | undefined => {
  const rt = runtimes.get(id);
  try {
    const result = run();
    if (rt) {
      rt.errors = 0;
    }
    return result;
  } catch (error) {
    console.error(`[plugin:${id}] hook error`, error);
    if (rt && ++rt.errors >= 3) {
      disablePlugin(id, '连续 3 次运行出错，已自动停用');
    }
    return fallback;
  }
};

/** Async twin of {@link guarded} — awaits the hook so rejections are isolated too. */
const guardedAsync = async <T>(
  id: string,
  run: () => T | undefined | Promise<T | undefined>,
  fallback: T | undefined
): Promise<T | undefined> => {
  const rt = runtimes.get(id);
  try {
    const result = await run();
    if (rt) {
      rt.errors = 0;
    }
    return result;
  } catch (error) {
    console.error(`[plugin:${id}] hook error`, error);
    if (rt && ++rt.errors >= 3) {
      disablePlugin(id, '连续 3 次运行出错，已自动停用');
    }
    return fallback;
  }
};

export const loadRegistry = async (): Promise<void> => {
  installed = readJSON<InstalledPlugin[]>(REGISTRY_KEY, []);
  for (const record of installed) {
    const rt: RuntimePlugin = { errors: 0, installed: record, instance: undefined };
    runtimes.set(record.manifest.id, rt);
    if (record.enabled) {
      rt.instance = await loadModule(record.source);
      if (rt.instance) {
        try {
          rt.instance.activate?.(makeContext(record.manifest.id));
        } catch (error) {
          console.error(`[plugin:${record.manifest.id}] activate error`, error);
        }
        applyPluginTheme(rt.instance);
      }
    }
  }
};

const persist = (): void => {
  writeJSON(REGISTRY_KEY, JSON.parse(JSON.stringify(installed)));
};

export const installPlugin = async (source: string): Promise<{ ok: boolean; error?: string }> => {
  const instance = await loadModule(source);
  if (!instance || !instance.id || !instance.name) {
    return { error: '插件必须 default export 一个包含 id 与 name 的对象', ok: false };
  }
  if (installed.some((p) => p.manifest.id === instance.id)) {
    return { error: `插件 ${instance.id} 已安装`, ok: false };
  }
  const record: InstalledPlugin = {
    enabled: true,
    installedAt: String(Date.now()),
    manifest: {
      description: instance.description,
      id: instance.id,
      name: instance.name,
      permissions: instance.permissions ?? [],
      version: instance.version ?? '0.0.0'
    },
    source
  };
  installed = [...installed, record];
  const rt: RuntimePlugin = { errors: 0, installed: record, instance };
  runtimes.set(record.manifest.id, rt);
  try {
    instance.activate?.(makeContext(instance.id));
  } catch {
    /* activate errors are non-fatal */
  }
  applyPluginTheme(instance);
  persist();
  return { ok: true };
};

export const uninstallPlugin = (id: string): void => {
  const rt = runtimes.get(id);
  if (rt?.instance) {
    try {
      rt.instance.deactivate?.();
    } catch {
      /* ignore */
    }
    removePluginTheme(rt.instance);
  }
  runtimes.delete(id);
  installed = installed.filter((p) => p.manifest.id !== id);
  persist();
  applyAllThemes();
};

export const disablePlugin = (id: string, reason?: string): void => {
  const rt = runtimes.get(id);
  if (rt?.instance) {
    try {
      rt.instance.deactivate?.();
    } catch {
      /* ignore */
    }
    removePluginTheme(rt.instance);
    // Keep the loaded module: hooks dispatch through activePlugins() which
    // already filters on `enabled`, and source-less runtime registrations
    // (tests/embedding) could never reload anyway.
  }
  installed = installed.map((p) => (p.manifest.id === id ? { ...p, enabled: false } : p));
  persist();
  applyAllThemes();
  if (reason) {
    notify(`插件 ${id}：${reason}`);
  }
};

export const enablePlugin = async (id: string): Promise<void> => {
  const record = installed.find((p) => p.manifest.id === id);
  if (!record) {
    return;
  }
  const rt = runtimes.get(id);
  // Reload only when there is no live instance (first enable after a page
  // load restores from the persisted source).
  const instance = rt?.instance ?? (record.source ? await loadModule(record.source) : undefined);
  if (rt) {
    rt.errors = 0;
    rt.instance = instance;
  }
  installed = installed.map((p) => (p.manifest.id === id ? { ...p, enabled: true } : p));
  if (instance) {
    try {
      instance.activate?.(makeContext(id));
    } catch {
      /* ignore */
    }
    applyPluginTheme(instance);
  }
  persist();
};

// --- theme application (CSS variables on :root) ---

const themeStyleId = (id: string) => `flow-plugin-theme-${id}`;

const applyPluginTheme = (plugin: FlowPlugin): void => {
  const theme = plugin.theme;
  if (!theme) {
    return;
  }
  let style = document.getElementById(themeStyleId(plugin.id)) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = themeStyleId(plugin.id);
    document.head.append(style);
  }
  const vars = Object.entries(theme.variables ?? {})
    .map(([k, v]) => `${k.startsWith('--') ? k : `--${k}`}: ${v};`)
    .join(' ');
  style.textContent = `${vars ? `:root { ${vars} }` : ''}
${theme.css ?? ''}`;
};

const removePluginTheme = (plugin: FlowPlugin): void => {
  document.getElementById(themeStyleId(plugin.id))?.remove();
};

export const reapplyThemes = (): void => applyAllThemes();

const applyAllThemes = (): void => {
  for (const plugin of activePlugins()) {
    applyPluginTheme(plugin);
  }
};

// --- hook dispatchers used by the app ---

// The transform pipeline feeds straight into the state gateway's synchronous
// stringify + localStorage write: an oversized output (a malformed or hostile
// plugin transform returning megabytes) would freeze the main thread and can
// exhaust the storage quota. Bridge/URL inputs are capped on entry (round
// 2.0.113 / the URL-length limit); the pipeline output gets the same bound.
const MAX_TRANSFORMED_LENGTH = 5_000_000;

export const runInputTransforms = (code: string, source: 'bridge' | 'file' | 'url'): string => {
  let current = code;
  for (const plugin of activePlugins()) {
    const hook: InputTransformHook | undefined = plugin.inputTransform;
    if (!hook) {
      continue;
    }
    const next = guarded(plugin.id, () => hook.transform(current, source), undefined);
    if (typeof next === 'string') {
      if (next.length > MAX_TRANSFORMED_LENGTH) {
        console.error(
          `[plugin:${plugin.id}] transform output over ${MAX_TRANSFORMED_LENGTH} chars — keeping input`
        );
        continue; // keep the pre-transform value rather than the oversized output
      }
      current = next;
    }
  }
  return current;
};

export const findImportHandler = (
  fileName: string
): { handler: ImportHandler; pluginId: string } | undefined => {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  for (const plugin of activePlugins()) {
    const handler = plugin.import;
    if (handler?.extensions.map((e) => e.toLowerCase()).includes(ext)) {
      return { handler, pluginId: plugin.id };
    }
  }
  return undefined;
};

/**
 * Dispatch an opened file to the claiming plugin handler. Async: handlers may
 * do asynchronous work (zip inflation, format probing) — the result is awaited
 * before the caller falls back to the built-in parser. `bytes` carries the raw
 * payload for binary formats (text decoding is lossy).
 */
export const runImportHandler = async (
  fileName: string,
  text: string,
  bytes?: Uint8Array
): Promise<{ code: string; mermaid?: string } | undefined> => {
  const found = findImportHandler(fileName);
  if (!found) {
    return undefined;
  }
  const result = await guardedAsync(
    found.pluginId,
    () => found.handler.import({ bytes, name: fileName, text }, makeContext(found.pluginId)),
    undefined
  );
  return result ?? undefined;
};

export const pluginExportFormats = (): (ExportFormat & { pluginId: string })[] =>
  activePlugins()
    .filter((p) => p.export)
    .map((p) => ({ ...(p.export as ExportFormat), pluginId: p.id }));

export const runPluginExport = (
  format: ExportFormat & { pluginId: string }
): { blob?: Blob; filename: string; mime: string; text?: string } | undefined =>
  guarded(
    format.pluginId,
    () =>
      format.run(
        {
          code: makeContext(format.pluginId).getState().code,
          config: makeContext(format.pluginId).getState().mermaid,
          svg: makeContext(format.pluginId).getSvg()
        },
        makeContext(format.pluginId)
      ),
    undefined
  );

export const pluginFrontends = (): { id: string; name: string; sandbox?: string; url: string }[] =>
  activePlugins()
    .filter((p) => p.frontend)
    .map((p) => ({
      id: p.id,
      name: p.name,
      sandbox: p.frontend?.sandbox,
      url: (p.frontend as { url: string }).url
    }));

export const anyPluginThemes = (): boolean => activePlugins().some((p) => Boolean(p.theme));

export const listInstalled = (): InstalledPlugin[] => installed;

export interface PluginRuntimeInfo {
  /** Consecutive hook failures (0–2; 3 auto-disables). */
  errors: number;
  /** Hook keys the loaded instance declares (empty when not loaded). */
  hooks: (keyof FlowPlugin)[];
  /** Whether a module instance is currently loaded in memory. */
  loaded: boolean;
  /** Per-hook human summary (import extensions, export label, frontend url…). */
  summaries: Partial<Record<keyof FlowPlugin, string>>;
}

/**
 * Runtime details for the manager's detail view. Independent from the
 * persisted record: a disabled-but-loaded plugin still reports its hooks.
 */
export const getPluginRuntime = (id: string): PluginRuntimeInfo => {
  const rt = runtimes.get(id);
  const instance = rt?.instance;
  const summaries: Partial<Record<keyof FlowPlugin, string>> = {};
  if (instance?.inputTransform) {
    summaries.inputTransform = instance.inputTransform.name;
  }
  if (instance?.import) {
    summaries.import = instance.import.extensions.map((e) => `.${e}`).join(' ');
  }
  if (instance?.export) {
    summaries.export = instance.export.label;
  }
  if (instance?.frontend) {
    summaries.frontend = instance.frontend.url;
  }
  if (instance?.theme) {
    const vars = Object.keys(instance.theme.variables ?? {}).length;
    summaries.theme = [
      vars > 0 ? `${vars} 个 CSS 变量` : '',
      instance.theme.css ? '自定义 CSS' : ''
    ]
      .filter(Boolean)
      .join(' + ');
  }
  return {
    errors: rt?.errors ?? 0,
    hooks: instance
      ? (
          [
            'inputTransform',
            'import',
            'export',
            'theme',
            'frontend',
            'activate',
            'deactivate'
          ] as const
        ).filter((key) => Boolean(instance[key]))
      : [],
    loaded: Boolean(instance),
    summaries
  };
};

/** Downloadable copy of a persisted plugin (manager 导出 button). */
export const exportPluginSource = (id: string): { filename: string; text: string } | undefined => {
  const record = installed.find((p) => p.manifest.id === id);
  if (!record?.source) {
    return undefined;
  }
  return { filename: `${id}.mjs`, text: record.source };
};

/**
 * Register an already-loaded plugin instance without persisting its source
 * (used by tests and embedding hosts).
 */
export const registerPluginInstance = (instance: FlowPlugin, enabled = true): void => {
  const record: InstalledPlugin = {
    enabled,
    installedAt: String(Date.now()),
    manifest: {
      description: instance.description,
      id: instance.id,
      name: instance.name,
      permissions: instance.permissions ?? [],
      version: instance.version ?? '0.0.0'
    },
    source: ''
  };
  installed = [...installed.filter((p) => p.manifest.id !== instance.id), record];
  const rt: RuntimePlugin = {
    errors: 0,
    installed: record,
    instance: enabled ? instance : undefined
  };
  runtimes.set(instance.id, rt);
  if (enabled) {
    applyPluginTheme(instance);
  }
};

/** Remove all non-persisted plugin instances (test isolation / embedding). */
export const unregisterAllPluginInstances = (): void => {
  for (const record of installed) {
    const rt = runtimes.get(record.manifest.id);
    if (rt && record.source === '') {
      if (rt.instance) {
        removePluginTheme(rt.instance);
      }
      runtimes.delete(record.manifest.id);
    }
  }
  installed = installed.filter((p) => p.source !== '');
};
