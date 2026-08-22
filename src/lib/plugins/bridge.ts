/**
 * Editor bridge: a postMessage protocol (channel `flow-editor`) exposing the
 * editor as a set of tools. Used by plugin frontends (iframe replacement UI)
 * and implementing the MCP (Model Context Protocol) JSON-RPC 2.0 surface so
 * AI agents can drive the editor: initialize / tools/list / tools/call.
 *
 * External MCP stdio clients can connect by hosting this page (or an iframe
 * of it) and forwarding messages — the wire format is MCP-compatible.
 */

import { notify } from '$/util/notify';

export const BRIDGE_CHANNEL = 'flow-editor';

export interface JsonRpcRequest {
  id?: number | string;
  jsonrpc?: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

const ok = (id: number | string | undefined, result: unknown) => ({
  channel: BRIDGE_CHANNEL,
  id,
  jsonrpc: '2.0' as const,
  result
});

const err = (id: number | string | undefined, code: number, message: string) => ({
  channel: BRIDGE_CHANNEL,
  error: { code, message },
  id,
  jsonrpc: '2.0' as const
});

const api = () => window.__FLOW_EDITOR_API__;

// postMessage is an untrusted channel with no natural size bound: URL-borne
// input is capped by the browser's URL length limit, but a bridge set_code
// string of any size would flow straight into the state gateway (synchronous
// JSON.stringify + localStorage write on the main thread). Same order as the
// upload caps.
export const MAX_BRIDGE_TEXT_LENGTH = 5_000_000;

const bridgeText = (
  value: unknown,
  field: string
): { error: { code: number; message: string } } | { text: string } => {
  if (typeof value !== 'string') {
    return { error: { code: -32602, message: `${field} must be a string` } };
  }
  if (value.length > MAX_BRIDGE_TEXT_LENGTH) {
    return { error: { code: -32602, message: `${field} too large (max 5MB)` } };
  }
  return { text: value };
};

/** MCP tool descriptors the editor exposes. */
export const bridgeTools = [
  {
    description: '获取当前图表的 Mermaid 源码',
    inputSchema: { type: 'object' as const, properties: {} },
    name: 'get_code'
  },
  {
    description: '替换图表 Mermaid 源码（经状态网关，自动校验渲染）',
    inputSchema: {
      type: 'object' as const,
      properties: { code: { type: 'string' } },
      required: ['code']
    },
    name: 'set_code'
  },
  {
    description: '获取完整状态（源码 + Mermaid 配置 JSON）',
    inputSchema: { type: 'object' as const, properties: {} },
    name: 'get_state'
  },
  {
    description: '替换完整状态（code 必填，mermaid 可选）',
    inputSchema: {
      type: 'object' as const,
      properties: { code: { type: 'string' }, mermaid: { type: 'string' } },
      required: ['code']
    },
    name: 'set_state'
  },
  {
    description: '获取当前渲染的 SVG 字符串（未渲染时返回空）',
    inputSchema: { type: 'object' as const, properties: {} },
    name: 'render_svg'
  },
  {
    description: '导出图表（format: svg | png-dataurl | code）',
    inputSchema: {
      type: 'object' as const,
      properties: { format: { type: 'string', enum: ['svg', 'png-dataurl', 'code'] } }
    },
    name: 'export'
  },
  {
    description:
      '（仅桌面版）离线编译 MC 成就插件源码为可安装的 .jar——内置 Paper 编译工具链，需要用户本机自装 JDK 21+',
    inputSchema: {
      type: 'object' as const,
      properties: {
        files: {
          description: 'Maven 布局源文件 [{path, text}]',
          type: 'array'
        },
        filename: { description: '输出 jar 文件名', type: 'string' }
      },
      required: ['files']
    },
    name: 'mc_build'
  }
] as const;

const callTool = async (
  name: string,
  params: Record<string, unknown> | undefined
): Promise<
  { content: { text: string; type: string }[] } | { error: { code: number; message: string } }
> => {
  const a = api();
  if (!a) {
    return { error: { code: -32002, message: 'editor api not ready' } };
  }
  switch (name) {
    case 'get_code': {
      return { content: [{ text: a.getState().code, type: 'text' }] };
    }
    case 'set_code': {
      const checked = bridgeText(params?.code, 'code');
      if ('error' in checked) {
        return checked;
      }
      a.setCode(checked.text);
      return { content: [{ text: 'ok', type: 'text' }] };
    }
    case 'get_state': {
      return { content: [{ text: JSON.stringify(a.getState()), type: 'text' }] };
    }
    case 'set_state': {
      const checked = bridgeText(params?.code, 'code');
      if ('error' in checked) {
        return checked;
      }
      let mermaidText: string | undefined;
      if (typeof params?.mermaid !== 'undefined') {
        const mermaid = bridgeText(params.mermaid, 'mermaid');
        if ('error' in mermaid) {
          return mermaid;
        }
        mermaidText = mermaid.text;
      }
      a.setState({ code: checked.text, mermaid: mermaidText });
      return { content: [{ text: 'ok', type: 'text' }] };
    }
    case 'render_svg': {
      return { content: [{ text: a.getSvg() ?? '', type: 'text' }] };
    }
    case 'export': {
      const format = params?.format ?? 'code';
      if (format === 'svg') {
        return { content: [{ text: a.getSvg() ?? '', type: 'text' }] };
      }
      if (format === 'png-dataurl') {
        const png = await a.exportPngDataUrl();
        if (!png) {
          return {
            error: {
              code: 32001,
              message: 'png export unavailable (nothing rendered or canvas unsupported)'
            }
          };
        }
        return { content: [{ text: png, type: 'text' }] };
      }
      return { content: [{ text: a.getState().code, type: 'text' }] };
    }
    case 'mc_build': {
      // 桌面版独占能力：页面把请求转给 preload IPC（主进程严格校验 + javac）。
      // 网页版没有该桥——提示走「导出 zip + mvn package」路径。
      const mcBuild = window.__FLOW_DESKTOP__?.mcBuild;
      if (!mcBuild) {
        return {
          error: {
            code: -32003,
            message: '离线编译仅在桌面版可用；网页版请导出 Maven 工程 zip 后用本机 mvn package 构建'
          }
        };
      }
      const files = params?.files;
      if (
        !Array.isArray(files) ||
        files.length === 0 ||
        files.some(
          (f) =>
            typeof f !== 'object' ||
            f === null ||
            typeof (f as { path?: unknown }).path !== 'string' ||
            typeof (f as { text?: unknown }).text !== 'string'
        )
      ) {
        return { error: { code: -32602, message: 'files must be an array of {path, text}' } };
      }
      const result = await mcBuild.build({
        files: files as { path: string; text: string }[],
        filename: typeof params?.filename === 'string' ? params.filename : undefined
      });
      if (!result.ok) {
        return { error: { code: -32010, message: result.error?.message ?? '构建失败' } };
      }
      return {
        content: [
          {
            text: JSON.stringify({
              filename: result.filename,
              jarBase64: result.jarBase64,
              jdkVersion: result.jdkVersion
            }),
            type: 'text'
          }
        ]
      };
    }
    default: {
      return { error: { code: -32601, message: `unknown tool: ${name}` } };
    }
  }
};

export const handleBridgeRequest = async (
  request: JsonRpcRequest
): Promise<ReturnType<typeof ok> | ReturnType<typeof err>> => {
  const { id, method } = request;
  switch (method) {
    case 'initialize': {
      return ok(id, {
        capabilities: {
          experimental: {
            // 插件前端据此决定是否展示「编译导出 jar」入口
            'flow-editor/mcBuild': Boolean(window.__FLOW_DESKTOP__?.mcBuild)
          },
          tools: {}
        },
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'flow-editor', version: '1.0.0' }
      });
    }
    case 'tools/list': {
      return ok(id, { tools: bridgeTools });
    }
    case 'tools/call': {
      const name = String(request.params?.name ?? '');
      const result = await callTool(name, request.params?.arguments as Record<string, unknown>);
      if ('error' in result) {
        return err(id, result.error.code, result.error.message);
      }
      return ok(id, result);
    }
    case 'ping': {
      return ok(id, {});
    }
    default: {
      return err(id, -32601, `method not found: ${method}`);
    }
  }
};

let listening = false;

declare global {
  interface Window {
    /** Double-encoded JSON entry point used by the desktop MCP HTTP server. */
    __FLOW_EDITOR_BRIDGE_CALL__?: (raw: string) => Promise<unknown>;
  }
}

/**
 * Expose the request handler as a window global taking a *stringified*
 * JSON-RPC request. The desktop (Electron) main process reaches it via
 * webContents.executeJavaScript with a double-JSON-encoded payload — the
 * JSON.parse here means the request body can never escape into evaluated
 * code, no matter what bytes it contains.
 */
export const installBridgeInvoker = (): void => {
  window.__FLOW_EDITOR_BRIDGE_CALL__ = async (raw: string) => {
    try {
      return await handleBridgeRequest(JSON.parse(raw) as JsonRpcRequest);
    } catch {
      return err(undefined, -32_700, 'parse error');
    }
  };
};

/** Start listening for bridge/MCP messages (idempotent). */
export const startBridge = (): void => {
  if (listening) {
    return;
  }
  listening = true;
  window.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as { channel?: string } | null;
    if (!data || data.channel !== BRIDGE_CHANNEL) {
      return;
    }
    const request = data as unknown as JsonRpcRequest;
    void handleBridgeRequest(request).then((response) => {
      // data:/blob: plugin frontends have opaque origins serialized as "null" —
      // not a valid targetOrigin, fall back to "*".
      const targetOrigin = !event.origin || event.origin === 'null' ? '*' : event.origin;
      (event.source as Window | null)?.postMessage(response, { targetOrigin });
    });
  });
};

/** Convenience helper for plugin frontends: call an editor tool. */
export const callEditor = async <T>(
  method: string,
  params?: Record<string, unknown>
): Promise<T> => {
  const id = Math.random().toString(36).slice(2);
  return new Promise<T>((resolve, reject) => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { channel?: string; error?: unknown; id?: string; result?: T };
      if (data?.channel !== BRIDGE_CHANNEL || data.id !== id) {
        return;
      }
      window.removeEventListener('message', onMessage);
      if (data.error) {
        reject(new Error(String((data.error as { message?: string }).message ?? 'bridge error')));
      } else {
        resolve(data.result as T);
      }
    };
    window.addEventListener('message', onMessage);
    window.parent.postMessage({ channel: BRIDGE_CHANNEL, id, jsonrpc: '2.0', method, params }, '*');
    setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('bridge timeout'));
    }, 5000);
  });
};

export const bridgeNotify = (message: string): void => notify(message);
