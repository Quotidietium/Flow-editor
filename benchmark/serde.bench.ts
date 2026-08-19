// Benchmark: serde state serialization
//
// Hot path: serializeState runs inside processState on EVERY state publish
// (each keystroke), even though the URL hash itself is debounced to 250ms.
// deflate uses level 9, the slowest setting.
//
// Also isolates the JSON.stringify share of the cost.

import { bench, describe } from 'vitest';
import { deserializeState, serializeState } from '../src/lib/util/serde';
import { genState } from './lib/gen';

const smallState = genState(2);
const mediumState = genState(100);
const largeState = genState(1000);
const largeSerialized = serializeState(largeState);

describe('serializeState (pako level 9)', () => {
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
