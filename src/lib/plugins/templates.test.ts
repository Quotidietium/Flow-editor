import { describe, expect, it } from 'vitest';
import { PLUGIN_TEMPLATES } from './templates';
import type { FlowPlugin, PluginPermission } from './types';

/** Load a template source exactly as the registry would (ES module import). */
const loadTemplate = async (source: string): Promise<FlowPlugin> => {
  const url = `data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`;
  const mod = (await import(/* @vite-ignore */ url)) as { default?: FlowPlugin };
  if (!mod.default) {
    throw new Error('template has no default export');
  }
  return mod.default;
};

/** Hook key <-> permission consistency rules. */
const HOOK_PERMISSION: Partial<Record<keyof FlowPlugin, PluginPermission>> = {
  export: 'export:format',
  frontend: 'ui:frontend',
  import: 'import:file',
  inputTransform: 'input:transform',
  theme: 'ui:theme'
};

describe('plugin templates', () => {
  it('has unique ids', () => {
    const ids = PLUGIN_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every template is an installable module with a matching manifest', async () => {
    for (const template of PLUGIN_TEMPLATES) {
      const plugin = await loadTemplate(template.source);
      expect(plugin.id, template.id).toBe(template.id);
      expect(plugin.name).toContain(template.name);
      expect(plugin.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(plugin.description).toBeTruthy();
      expect([...(plugin.permissions ?? [])].sort()).toEqual([...template.permissions].sort());
    }
  });

  it('declared permissions match the hooks the module actually implements', async () => {
    for (const template of PLUGIN_TEMPLATES) {
      const plugin = await loadTemplate(template.source);
      for (const [hook, permission] of Object.entries(HOOK_PERMISSION)) {
        const hasHook = Boolean(plugin[hook as keyof FlowPlugin]);
        const declares = (plugin.permissions ?? []).includes(permission);
        expect(hasHook, `${template.id}: ${hook} hook <=> ${permission}`).toBe(declares);
      }
    }
  });

  it('template hooks behave on smoke inputs', async () => {
    const byId = new Map(PLUGIN_TEMPLATES.map((t) => [t.id, t]));

    const cleaner = await loadTemplate(byId.get('template.input-cleaner')?.source ?? '');
    expect(
      cleaner.inputTransform?.transform(
        '@startuml\r\nflowchart TD\r\n  A --> B  \r\n@enduml\r\n',
        'file'
      )
    ).toBe('flowchart TD\n  A --> B');
    // URL sources pass through byte-exact.
    expect(cleaner.inputTransform?.transform('a \r\n', 'url')).toBe('a \r\n');

    const importer = await loadTemplate(byId.get('template.plantuml-import')?.source ?? '');
    const noopCtx = { notify: () => undefined } as never;
    expect(
      importer.import?.import({ name: 'a.puml', text: '@startuml\nA --> B\n@enduml\n' }, noopCtx)
    ).toEqual({ code: 'flowchart TD\n  A --> B\n' });
    expect(importer.import?.import({ name: 'a.puml', text: 'just text' }, noopCtx)).toBeUndefined();

    const csv = await loadTemplate(byId.get('template.csv-exporter')?.source ?? '');
    const payload = csv.export?.run(
      { code: 'flowchart TD\n  A --> B\n', config: '{}', svg: undefined },
      noopCtx
    );
    expect(payload?.filename).toBe('diagram.csv');
    expect(payload?.text).toContain('A,B');

    const ai = await loadTemplate(byId.get('template.ai-prompt-exporter')?.source ?? '');
    const prompt = ai.export?.run(
      { code: 'pie\n  "Dogs" : 1\n', config: '{}', svg: undefined },
      noopCtx
    );
    expect(prompt?.filename).toBe('diagram-prompt.md');
    expect(prompt?.text).toContain('```mermaid');
    expect(prompt?.text).toContain('tools/call');
    expect(prompt?.text).toContain('Dogs');

    const theme = await loadTemplate(byId.get('template.theme-ocean')?.source ?? '');
    expect(Object.keys(theme.theme?.variables ?? {}).length).toBeGreaterThan(0);

    const frontend = await loadTemplate(byId.get('template.frontend-dashboard')?.source ?? '');
    expect(frontend.frontend?.url.startsWith('data:text/html;charset=utf-8,')).toBe(true);
    // The embedded page must be complete HTML after decoding.
    const html = decodeURIComponent(frontend.frontend?.url.split(',').slice(1).join(',') ?? '');
    expect(html).toContain('</html>');
    expect(html).toContain('postMessage');
  });
});
