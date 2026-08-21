import { describe, expect, it } from 'vitest';
import { getSampleDiagrams } from './mermaid';

// Content contract of the lazily imported examples catalogue. The failure
// path (chunk unavailable) is pinned in mermaid.samples.test.ts; this file
// pins the SUCCESS path — a dependency upgrade or tree-shaking accident
// that empties the catalogue would otherwise surface only as a silently
// ZenUML-only samples card.
describe('sample catalogue content', () => {
  it('ships a full catalogue: non-empty categories, defaults sorted first', async () => {
    const samples = await getSampleDiagrams();
    const categories = Object.keys(samples);
    expect(categories.length).toBeGreaterThan(10);
    expect(categories).toContain('Flowchart');
    for (const [name, examples] of Object.entries(samples)) {
      expect(examples.length, name).toBeGreaterThan(0);
      // getSampleDiagrams sorts the default example first; every category
      // in the catalogue ships one, so the head must be it.
      expect(examples[0]?.isDefault, name).toBe(true);
      for (const example of examples) {
        expect(typeof example.code, `${name}/${example.title}`).toBe('string');
        expect(example.code.length, `${name}/${example.title}`).toBeGreaterThan(0);
      }
    }
  });
});
