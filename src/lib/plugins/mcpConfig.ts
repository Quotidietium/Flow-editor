/**
 * MCP server configuration surface for the Plugin Manager's MCP tab.
 *
 * Two transports expose the same MCP JSON-RPC tool set (see bridge.ts):
 * - the built-in postMessage bridge (always on, every build);
 * - an optional loopback HTTP server (`http://127.0.0.1:<port>/`) provided by
 *   the desktop (Electron) build — this module reads/writes its config over
 *   the preload IPC bridge (`window.__FLOW_DESKTOP__`). On the plain web build
 *   the same config is kept in localStorage so the user's preference travels
 *   between the two.
 */

import { readJSON, writeJSON } from '$/util/persist.svelte';

export interface McpConfig {
  /** Whether the desktop HTTP server listens. */
  enabled: boolean;
  /** Loopback port for the HTTP server. */
  port: number;
}

export interface McpStatus {
  /** Startup failure (e.g. port in use), when the server could not listen. */
  error?: string;
  /** Actual bound port (valid when running). */
  port: number;
  running: boolean;
}

export interface DesktopBridge {
  mcp: {
    getConfig(): Promise<McpConfig>;
    getStatus(): Promise<McpStatus>;
    setConfig(config: McpConfig): Promise<{ error?: string; ok: boolean }>;
  };
}

declare global {
  interface Window {
    __FLOW_DESKTOP__?: DesktopBridge;
  }
}

const CONFIG_KEY = 'flowMcpConfig';

// 38528 sits right above the desktop build's site port base (38527 + up to 16
// collision retries), keeping the two loopback servers neighbours by default.
export const MCP_PORT_DEFAULT = 38528;
export const MCP_PORT_MIN = 1024;
export const MCP_PORT_MAX = 65_535;

/** Strict port validation shared by the UI and the desktop main process. */
export const validateMcpPort = (value: unknown): number | undefined => {
  const port = typeof value === 'string' ? Number(value) : value;
  if (
    typeof port !== 'number' ||
    !Number.isInteger(port) ||
    port < MCP_PORT_MIN ||
    port > MCP_PORT_MAX
  ) {
    return undefined;
  }
  return port;
};

/** Untrusted-input normalization (localStorage / IPC payloads). */
export const normalizeMcpConfig = (value: unknown): McpConfig => {
  const record = (value ?? {}) as Record<string, unknown>;
  return {
    enabled: record.enabled === true,
    port: validateMcpPort(record.port) ?? MCP_PORT_DEFAULT
  };
};

export const isDesktop = (): boolean => Boolean(window.__FLOW_DESKTOP__?.mcp);

export const loadMcpConfig = async (): Promise<McpConfig> => {
  const desktop = window.__FLOW_DESKTOP__?.mcp;
  if (desktop) {
    try {
      return normalizeMcpConfig(await desktop.getConfig());
    } catch (error) {
      console.error('[mcp] desktop getConfig failed', error);
    }
  }
  return normalizeMcpConfig(readJSON<unknown>(CONFIG_KEY, undefined));
};

/**
 * Persist and apply. On desktop the main process validates again, writes its
 * own config file and starts/stops/relists the server; the localStorage copy
 * keeps the web build's form state in sync.
 */
export const saveMcpConfig = async (
  config: McpConfig
): Promise<{ error?: string; ok: boolean }> => {
  const normalized = normalizeMcpConfig(config);
  if (config.enabled && validateMcpPort(config.port) === undefined) {
    return { error: `端口必须是 ${MCP_PORT_MIN}–${MCP_PORT_MAX} 的整数`, ok: false };
  }
  writeJSON(CONFIG_KEY, normalized);
  const desktop = window.__FLOW_DESKTOP__?.mcp;
  if (desktop) {
    try {
      return await desktop.setConfig(normalized);
    } catch (error) {
      return { error: `桌面桥调用失败：${String(error)}`, ok: false };
    }
  }
  return { ok: true };
};

/** Live server status; on the web build the HTTP server is never running. */
export const loadMcpStatus = async (config: McpConfig): Promise<McpStatus> => {
  const desktop = window.__FLOW_DESKTOP__?.mcp;
  if (desktop) {
    try {
      return await desktop.getStatus();
    } catch (error) {
      console.error('[mcp] desktop getStatus failed', error);
    }
  }
  return { port: config.port, running: false };
};
