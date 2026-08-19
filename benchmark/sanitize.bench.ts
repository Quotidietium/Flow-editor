// Benchmark: sanitize.findUnsafeConfigPaths
//
// Cold-ish path: runs when loading state from a shared URL / embed config.
// Included for completeness; not expected to be a hotspot.

import { bench, describe } from 'vitest';
import { findUnsafeConfigPaths } from '../src/lib/util/sanitize';
import { genLargeConfig, typicalConfig } from './lib/gen';

const typical = JSON.parse(typicalConfig);
const large = JSON.parse(genLargeConfig(100));

describe('findUnsafeConfigPaths', () => {
  bench('typical config', () => {
    findUnsafeConfigPaths(typical);
  });

  bench('100KB config', () => {
    findUnsafeConfigPaths(large);
  });
});
