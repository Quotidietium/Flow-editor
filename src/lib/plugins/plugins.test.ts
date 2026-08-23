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

  it('runImportHandler awaits async handlers and passes raw bytes', async () => {
    registerPluginInstance(
      basePlugin({
        id: 'p-bin',
        import: {
          extensions: ['zip'],
          import: async (file) => {
            await new Promise((resolve) => setTimeout(resolve, 0));
            return { code: `binary:${file.bytes?.length ?? -1}` };
          },
          name: 'bin'
        }
      })
    );
    const handled = await runImportHandler('pack.zip', 'garbled text', new Uint8Array(4));
    expect(handled).toEqual({ code: 'binary:4' });
  });

  it('runImportHandler isolates async rejections (falls back, no throw)', async () => {
    registerPluginInstance(
      basePlugin({
        id: 'p-reject',
        import: {
          extensions: ['xyz'],
          import: async () => {
            throw new Error('boom');
          },
          name: 'reject'
        }
      })
    );
    await expect(runImportHandler('a.xyz', '')).resolves.toBeUndefined();
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

  // The gateway synchronously stringifies and persists every incoming code:
  // a transform returning megabytes would freeze the main thread and can
  // exhaust the storage quota. Oversized outputs are dropped (the
  // pre-transform value is kept), never flowed through.
  it('drops oversized transform outputs instead of feeding them downstream', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    registerPluginInstance(
      basePlugin({
        id: 'huge',
        inputTransform: { name: 'huge', transform: () => 'x'.repeat(5_000_001) }
      })
    );
    registerPluginInstance(
      basePlugin({
        id: 'next',
        inputTransform: { name: 'next', transform: (c) => `${c}-next` }
      })
    );
    // The oversized output never reaches the next plugin either.
    expect(runInputTransforms('X', 'file')).toBe('X-next');
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('[plugin:huge] transform output over 5000000 chars')
    );
    consoleError.mockRestore();
  });

  it('dispatches file imports by extension', async () => {
    registerPluginInstance(
      basePlugin({
        id: 'importer',
        import: {
          extensions: ['puml'],
          import: (file) => ({ code: `flowchart TD\n  ${file.text} --> Converted` }),
          name: 'plantuml'
        }
      })
    );
    await expect(runImportHandler('a.puml', 'A')).resolves.toMatchObject({
      code: expect.stringContaining('Converted')
    });
    await expect(runImportHandler('a.mmd', 'A')).resolves.toBeUndefined();
  });

  it('registers and runs custom export formats', () => {
    registerPluginInstance(
      basePlugin({
        export: {
          id: 'mcfunction',
          label: 'MC 函数',
          run: ({ code }) => ({
            filename: 'out.mcfunction',
            mime: 'text/plain',
            text: `# ${code.split('\n').length} lines`
          })
        },
        id: 'exporter'
      })
    );
    const formats = pluginExportFormats();
    expect(formats).toHaveLength(1);
    const format = formats[0];
    if (!format) {
      throw new Error('format missing');
    }
    expect(format.label).toBe('MC 函数');
    const payload = runPluginExport(format);
    expect(payload?.filename).toBe('out.mcfunction');
    expect(payload?.text).toContain('lines');
  });

  it('theme.css injects arbitrary CSS (layout/stickers) into a style tag', () => {
    registerPluginInstance(
      basePlugin({
        id: 'styler',
        theme: { css: '.visual-canvas { background-image: url(sticker.png); }' }
      })
    );
    const style = document.getElementById('flow-plugin-theme-styler');
    expect(style?.textContent).toContain('sticker.png');
  });

  it(
    'editorApi.setCode routes through the bridge input pipeline',
    { timeout: 20_000 },
    async () => {
      registerPluginInstance(
        basePlugin({
          id: 'bridger',
          inputTransform: {
            name: 'strip',
            transform: (code, source) =>
              source === 'bridge' ? code.replace('@startuml\n', '') : code
          }
        })
      );
      const { installEditorApi } = await import('./editorApi');
      installEditorApi();
      window.__FLOW_EDITOR_API__?.setCode('@startuml\nflowchart TD\n  A --> B');
      // The state gateway received the cleaned code (read back through it).
      expect(window.__FLOW_EDITOR_STATE__?.().code).not.toContain('@startuml');
    }
  );

  it('disable then enable keeps the plugin hooks working', async () => {
    const { disablePlugin, enablePlugin } = await import('./registry.svelte');
    registerPluginInstance(
      basePlugin({ id: 'cycle', inputTransform: { name: 'x', transform: (c) => `${c}+` } })
    );
    expect(runInputTransforms('X', 'file')).toBe('X+');
    disablePlugin('cycle');
    expect(runInputTransforms('X', 'file')).toBe('X');
    await enablePlugin('cycle');
    // The re-enabled plugin must contribute again (regression: enable used to
    // skip reloading and left the plugin silently dead until a page reload).
    expect(runInputTransforms('X', 'file')).toBe('X+');
  });

  it('disabled plugins contribute nothing', () => {
    registerPluginInstance(
      basePlugin({ id: 'off', inputTransform: { name: 'x', transform: () => 'NOPE' } }),
      false
    );
    expect(runInputTransforms('X', 'file')).toBe('X');
  });

  it('getPluginRuntime reports hooks and human summaries for the detail view', async () => {
    const { getPluginRuntime } = await import('./registry.svelte');
    registerPluginInstance(
      basePlugin({
        export: { id: 'csv', label: 'CSV 导出', run: () => undefined },
        id: 'detailled',
        import: {
          extensions: ['puml', 'plantuml'],
          import: () => undefined,
          name: 'PlantUML'
        },
        theme: { css: 'body{}', variables: { '--primary': 'red' } }
      })
    );
    const info = getPluginRuntime('detailled');
    expect(info.loaded).toBe(true);
    expect(info.errors).toBe(0);
    expect(info.hooks).toEqual(expect.arrayContaining(['import', 'export', 'theme']));
    expect(info.summaries.import).toBe('.puml .plantuml');
    expect(info.summaries.export).toBe('CSV 导出');
    expect(info.summaries.theme).toBe('1 个 CSS 变量 + 自定义 CSS');

    const missing = getPluginRuntime('no.such.plugin');
    expect(missing).toEqual({ errors: 0, hooks: [], loaded: false, summaries: {} });
  });

  it('exportPluginSource only serves persisted sources', async () => {
    const { exportPluginSource } = await import('./registry.svelte');
    // Runtime-registered instances carry no persisted source — nothing to export.
    registerPluginInstance(basePlugin({ id: 'runtime-only' }));
    expect(exportPluginSource('runtime-only')).toBeUndefined();
    expect(exportPluginSource('no.such.plugin')).toBeUndefined();
  });
});

describe('MCP bridge protocol', () => {
  const state = { code: 'flowchart TD\n  A --> B', mermaid: '{"theme":"default"}', rough: false };

  beforeEach(() => {
    (window as unknown as { __FLOW_EDITOR_API__: unknown }).__FLOW_EDITOR_API__ = {
      exportPngDataUrl: () => 'data:image/png;base64,xxx',
      getState: () => state,
      getSvg: () => '<svg></svg>',
      setCode: vi.fn(),
      setState: vi.fn()
    };
  });

  it('initialize advertises tools capability', async () => {
    const res = await handleBridgeRequest({ id: 1, jsonrpc: '2.0', method: 'initialize' });
    expect(res).toMatchObject({ id: 1, result: { capabilities: { tools: {} } } });
  });

  it('tools/list exposes the editor toolset', async () => {
    const res = (await handleBridgeRequest({ id: 2, method: 'tools/list' })) as unknown as {
      result: { tools: { name: string }[] };
    };
    const names = res.result.tools.map((t) => t.name);
    expect(names).toContain('get_code');
    expect(names).toContain('set_code');
    expect(names).toContain('export');
    expect(names).toContain('mc_build');
  });

  it('mc_build falls back with a desktop-only error on the web build', async () => {
    const res = (await handleBridgeRequest({
      id: 20,
      method: 'tools/call',
      params: {
        arguments: { files: [{ path: 'src/main/java/A.java', text: 'class A {}' }] },
        name: 'mc_build'
      }
    })) as unknown as { error?: { code: number; message: string } };
    expect(res.error?.code).toBe(-32003);
    expect(res.error?.message).toContain('桌面版');
  });

  it('tools/call round-trips code', async () => {
    const got = (await handleBridgeRequest({
      id: 3,
      method: 'tools/call',
      params: { arguments: {}, name: 'get_code' }
    })) as unknown as { result: { content: { text: string }[] } };
    expect(got.result.content[0]?.text).toBe(state.code);

    const set = (await handleBridgeRequest({
      id: 4,
      method: 'tools/call',
      params: { arguments: { code: 'pie' }, name: 'set_code' }
    })) as unknown as { result: { content: { text: string }[] } };
    expect(set.result.content[0]?.text).toBe('ok');
    expect(
      (window as unknown as { __FLOW_EDITOR_API__: { setCode: ReturnType<typeof vi.fn> } })
        .__FLOW_EDITOR_API__.setCode
    ).toHaveBeenCalledWith('pie');
  });

  it('unknown methods and tools return JSON-RPC errors', async () => {
    expect(await handleBridgeRequest({ id: 5, method: 'nope' })).toMatchObject({
      error: { code: -32601 }
    });
    expect(
      await handleBridgeRequest({ id: 6, method: 'tools/call', params: { name: 'nope' } })
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
