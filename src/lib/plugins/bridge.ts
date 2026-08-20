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
      const code = params?.code;
      if (typeof code !== 'string') {
        return { error: { code: -32602, message: 'code must be a string' } };
      }
      a.setCode(code);
      return { content: [{ text: 'ok', type: 'text' }] };
    }
    case 'get_state': {
      return { content: [{ text: JSON.stringify(a.getState()), type: 'text' }] };
    }
    case 'set_state': {
      const code = params?.code;
      if (typeof code !== 'string') {
        return { error: { code: -32602, message: 'code must be a string' } };
      }
      a.setState({
        code,
        mermaid: typeof params?.mermaid === 'string' ? params.mermaid : undefined
      });
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
        capabilities: { tools: {} },
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
