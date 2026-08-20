import { describe, expect, it } from 'vitest';
import { diagramFileName, markdownOf, parseOpenedFile, stateFileOf } from './fileIO';

describe('diagramFileName', () => {
  it('builds a timestamped file name with the given extension', () => {
    expect(diagramFileName('mmd')).toMatch(/^mermaid-diagram-\d{4}-\d{2}-\d{2}-\d{6}\.mmd$/);
    expect(diagramFileName('json')).toMatch(/\.json$/);
  });
});

describe('markdownOf', () => {
  it('wraps the source in a fenced mermaid block', () => {
    const md = markdownOf('flowchart TD\n  A --> B\n');
    expect(md).toContain('```mermaid');
    expect(md).toContain('flowchart TD');
    expect(md.trimEnd().endsWith('```')).toBe(true);
  });
});

describe('stateFileOf / parseOpenedFile', () => {
  it('round-trips a state file with code and config', () => {
    const state = stateFileOf('flowchart TD\n  A --> B', '{"theme":"default"}');
    const parsed = parseOpenedFile('diagram.json', JSON.stringify(state));
    expect(parsed?.code).toContain('A --> B');
    expect(parsed?.mermaid).toContain('default');
  });

  it('reads raw .mmd sources verbatim', () => {
    const parsed = parseOpenedFile('a.mmd', 'pie\n  "A": 1');
    expect(parsed?.code).toBe('pie\n  "A": 1');
    expect(parsed?.mermaid).toBeUndefined();
  });

  it('strips a fenced markdown block', () => {
    const parsed = parseOpenedFile('a.md', '# Title\n\n```mermaid\ngraph TD\n  A-->B\n```\n');
    expect(parsed?.code).toBe('graph TD\n  A-->B');
  });

  it('rejects empty content and malformed JSON', () => {
    expect(parseOpenedFile('a.mmd', '   ')).toBeUndefined();
    expect(parseOpenedFile('a.json', 'not json')).toBeUndefined();
    expect(parseOpenedFile('a.json', JSON.stringify({ noCode: true }))).toBeUndefined();
  });
});
