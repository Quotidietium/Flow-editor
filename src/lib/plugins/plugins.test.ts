import { expect, it, describe, vi, beforeEach } from 'vitest';
import { bridgeTools, handleBridgeRequest } from './bridge';
import {
  pluginExportFormats,
  registerPluginInstance,
  runImportHandler,
  runInputTransforms,
  runPluginExport,
  unregisterAllPluginInstances
} from './registry.svelte';
import type { FlowPlugin } from './types';

const basePlugin = (over: Partial<FlowPlugin>): FlowPlugin => ({
  id: 'test.plugin',
  name: 'Test',
  version: '1.0.0',
  ...over
});

describe('plugin hook dispatch', () => {
  beforeEach(() => {
    unregisterAllPluginInstances();
  });

  it('chains input transforms in installation order', () => {
    registerPluginInstance(
      basePlugin({
        id: 'p1',
        inputTransform: { name: 'a', transform: (code) => `${code}-a` }
      })
    );
    registerPluginInstance(
      basePlugin({
        id: 'p2',
        inputTransform: {
          name: 'b',
          transform: (code, source) => (source === 'file' ? `${code}-b` : code)
        }
      })
    );
    expect(runInputTransforms('X', 'file')).toBe('X-a-b');
    // bridge/url sources are only touched by plugins that opt in
    expect(runInputTransforms('X', 'url')).toBe('X-a');
  });

  it('isolates a throwing transform and keeps the pipeline running', () => {
    registerPluginInstance(
      basePlugin({
        id: 'bad',
        inputTransform: {
          name: 'boom',
          transform: () => {
            throw new Error('boom');
          }
        }
      })
    );
    registerPluginInstance(
      basePlugin({ id: 'good', inputTransform: { name: 'ok', transform: (c) => `${c}!` } })
    );
    expect(runInputTransforms('X', 'file')).toBe('X!');
  });

  it('dispatches file imports by extension', () => {
    registerPluginInstance(
      basePlugin({
        id: 'importer',
        import: {
          extensions: ['puml'],
          name: 'plantuml',
          import: (file) => ({ code: `flowchart TD\n  ${file.text} --> Converted` })
        }
      })
    );
    expect(runImportHandler('a.puml', 'A')).toMatchObject({
      code: expect.stringContaining('Converted')
    });
    expect(runImportHandler('a.mmd', 'A')).toBeUndefined();
  });

  it('registers and runs custom export formats', () => {
    registerPluginInstance(
      basePlugin({
        id: 'exporter',
        export: {
          id: 'mcfunction',
          label: 'MC 函数',
          run: ({ code }) => ({
            filename: 'out.mcfunction',
            mime: 'text/plain',
            text: `# ${code.split('\n').length} lines`
          })
        }
      })
    );
    const formats = pluginExportFormats();
    expect(formats).toHaveLength(1);
    expect(formats[0]?.label).toBe('MC 函数');
    const payload = runPluginExport(formats[0]!);
    expect(payload?.filename).toBe('out.mcfunction');
    expect(payload?.text).toContain('lines');
  });

  it('disabled plugins contribute nothing', () => {
    registerPluginInstance(
      basePlugin({ id: 'off', inputTransform: { name: 'x', transform: () => 'NOPE' } }),
      false
    );
    expect(runInputTransforms('X', 'file')).toBe('X');
  });
});

describe('MCP bridge protocol', () => {
  const state = { code: 'flowchart TD\n  A --> B', mermaid: '{"theme":"default"}', rough: false };

  beforeEach(() => {
    (window as unknown as { __FLOW_EDITOR_API__: unknown }).__FLOW_EDITOR_API__ = {
      exportPngDataUrl: () => 'data:image/png;base64,xxx',
      getSvg: () => '<svg></svg>',
      getState: () => state,
      setCode: vi.fn(),
      setState: vi.fn()
    };
  });

  it('initialize advertises tools capability', () => {
    const res = handleBridgeRequest({ id: 1, jsonrpc: '2.0', method: 'initialize' });
    expect(res).toMatchObject({ id: 1, result: { capabilities: { tools: {} } } });
  });

  it('tools/list exposes the editor toolset', () => {
    const res = handleBridgeRequest({ id: 2, method: 'tools/list' }) as {
      result: { tools: { name: string }[] };
    };
    const names = res.result.tools.map((t) => t.name);
    expect(names).toContain('get_code');
    expect(names).toContain('set_code');
    expect(names).toContain('export');
  });

  it('tools/call round-trips code', () => {
    const got = handleBridgeRequest({
      id: 3,
      method: 'tools/call',
      params: { name: 'get_code', arguments: {} }
    }) as { result: { content: { text: string }[] } };
    expect(got.result.content[0]?.text).toBe(state.code);

    const set = handleBridgeRequest({
      id: 4,
      method: 'tools/call',
      params: { name: 'set_code', arguments: { code: 'pie' } }
    }) as { result: { content: { text: string }[] } };
    expect(set.result.content[0]?.text).toBe('ok');
    expect(
      (window as unknown as { __FLOW_EDITOR_API__: { setCode: ReturnType<typeof vi.fn> } })
        .__FLOW_EDITOR_API__.setCode
    ).toHaveBeenCalledWith('pie');
  });

  it('unknown methods and tools return JSON-RPC errors', () => {
    expect(handleBridgeRequest({ id: 5, method: 'nope' })).toMatchObject({
      error: { code: -32601 }
    });
    expect(
      handleBridgeRequest({ id: 6, method: 'tools/call', params: { name: 'nope' } })
    ).toMatchObject({ error: { code: -32601 } });
  });

  it('bridgeTools is a stable, documented toolset', () => {
    expect(bridgeTools.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        'get_code',
        'set_code',
        'get_state',
        'set_state',
        'render_svg',
        'export'
      ])
    );
  });
});
