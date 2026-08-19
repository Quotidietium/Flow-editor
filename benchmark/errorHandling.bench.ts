// Benchmark: errorHandling.findMostRelevantLineNumber
//
// Hot path: runs once per failed mermaid.parse (every keystroke while the
// code is broken). The current implementation enumerates O(L^2) substrings
// of the error line and runs `line.includes` for each, for every code line.
//
// Inputs are deterministic (see lib/gen.ts). Iteration counts are pinned low
// because the baseline implementation takes seconds per call on the large
// case.

import { bench, describe } from 'vitest';
import { findMostRelevantLineNumber } from '../src/lib/util/errorHandling';
import { genFlowchartCode } from './lib/gen';

const realisticCode = genFlowchartCode(500);
const realisticLines = realisticCode.split('\n');
// A typical failing line echoed by mermaid's parser (~70 chars of source).
const realisticErrorLine = realisticLines[250].slice(4, 74);

const largeCode = genFlowchartCode(1000);
const largeLines = largeCode.split('\n');
const largeErrorLine = largeLines[500].slice(4, 104);

describe('findMostRelevantLineNumber', () => {
  bench(
    '500 lines / 70-char error line (typical broken diagram)',
    () => {
      findMostRelevantLineNumber(realisticErrorLine, realisticCode);
    },
    { iterations: 3, time: 0, warmupIterations: 1 }
  );

  bench(
    '1000 lines / 100-char error line (large broken diagram)',
    () => {
      findMostRelevantLineNumber(largeErrorLine, largeCode);
    },
    { iterations: 1, time: 0, warmupIterations: 0 }
  );
});
