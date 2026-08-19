// Benchmark: state publish pipeline (integration)
//
// Measures the end-to-end cost of one publish (snapshot -> processState ->
// validatedState publish) with the REAL mermaid.parse. Each case waits for
// the publish to land via `until` (microtask polling + one macrotask hop);
// the `await until(() => true)` baseline case measures that harness floor,
// so publish costs should be read as publish-minus-baseline.
//
// - keystroke: code changed, parse necessarily runs (cache miss)
// - view-option: code unchanged (tab switch / pan-zoom), parse cache hit
// - share flush: publish whose serialized form is read (deflate runs)
//
// `mermaid.parse alone` isolates the cost that EVERY publish (including
// view-option ones) paid before the parse cache existed.

import { bench, describe } from 'vitest';
import { parse } from '../src/lib/util/mermaid';
import { updateCode, updateCodeStore, validatedState } from '../src/lib/util/state.svelte';
import { genFlowchartCode } from './lib/gen';

const baseCode = genFlowchartCode(30);
let counter = 0;

// Wait until the condition holds (microtask polling), then yield one
// macrotask so trailing .then chains have flushed.
const until = async (condition: () => boolean): Promise<void> => {
  for (let i = 0; i < 5000 && !condition(); i++) {
    await Promise.resolve();
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('publish pipeline (real mermaid.parse)', () => {
  bench(
    'harness baseline (until(true), subtract from publishes)',
    async () => {
      await until(() => true);
    },
    { iterations: 20, warmupIterations: 5 }
  );

  bench(
    'mermaid.parse alone (cost every publish paid before the cache)',
    async () => {
      await parse(baseCode);
    },
    { iterations: 20, warmupIterations: 5 }
  );

  bench(
    'keystroke publish (code change, parse runs)',
    async () => {
      const i = counter++;
      const code = `${baseCode}\n    K${i}[keystroke ${i}] -->|k| K${i + 1}\n`;
      updateCode(code);
      await until(() => validatedState.current.code === code);
    },
    { iterations: 20, warmupIterations: 5 }
  );

  bench(
    'view-option publish (code unchanged, parse cache hit)',
    async () => {
      const editorMode = counter++ % 2 ? 'code' : 'config';
      updateCodeStore({ editorMode });
      await until(() => validatedState.current.editorMode === editorMode);
    },
    { iterations: 20, warmupIterations: 5 }
  );

  bench(
    'share-flush publish (serialized read, deflate runs)',
    async () => {
      const i = counter++;
      const code = `${baseCode}\n    K${i}[keystroke ${i}] -->|k| K${i + 1}\n`;
      updateCode(code);
      await until(() => validatedState.current.code === code);
      void validatedState.current.serialized;
    },
    { iterations: 20, warmupIterations: 5 }
  );
});
