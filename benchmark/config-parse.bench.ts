// Benchmark: mermaid config JSON.parse
//
// Hot path: processState JSON.parses the config string on every publish, and
// View.svelte parses it again on every render. The string is almost always
// identical between publishes, which is what this bench measures.

import { bench, describe } from 'vitest';
import { genLargeConfig, typicalConfig } from './lib/gen';

const largeConfig = genLargeConfig(100);

describe('JSON.parse config', () => {
  bench('typical config (repeated identical string)', () => {
    JSON.parse(typicalConfig);
  });

  bench('100KB config (repeated identical string)', () => {
    JSON.parse(largeConfig);
  });
});
