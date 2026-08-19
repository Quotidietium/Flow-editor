// Benchmark: serde state serialization
//
// Hot path: serializeState runs when a validated state's `serialized` is
// first read (URL hash writer / view links, all debounced to 250ms) — see
// state.svelte.ts. deflate uses level 6: 2-2.5x faster than level 9 for ~1%
// larger output (any level decodes through the same inflate).
//
// Also isolates the JSON.stringify share of the cost.

import { bench, describe } from 'vitest';
import { deserializeState, serializeState } from '../src/lib/util/serde';
import { genState } from './lib/gen';

const smallState = genState(2);
const mediumState = genState(100);
const largeState = genState(1000);
const largeSerialized = serializeState(largeState);

describe('serializeState (pako level 6)', () => {
  bench('2KB state (typical small diagram)', () => {
    serializeState(smallState);
  });

  bench('100KB state (large diagram)', () => {
    serializeState(mediumState);
  });

  bench('1MB state (extreme diagram)', () => {
    serializeState(largeState);
  });
});

describe('deserializeState', () => {
  bench('1MB state round-trip decode', () => {
    deserializeState(largeSerialized);
  });
});

describe('JSON.stringify share', () => {
  bench('1MB state stringify', () => {
    JSON.stringify(largeState);
  });
});
