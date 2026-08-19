// Deterministic input generators shared across the benchmark suite.
// No randomness: every run produces byte-identical inputs, so before/after
// comparisons measure only the code under test, never the data.

import type { State } from '../../src/lib/types';

const LABEL_WORDS = [
  'checkout',
  'payment',
  'inventory',
  'notify',
  'invoice',
  'shipping',
  'audit',
  'retry',
  'queue',
  'report'
];

const shapeWrap = (index: number, label: string): string => {
  switch (index % 4) {
    case 0: {
      return `[${label}]`;
    }
    case 1: {
      return `(${label})`;
    }
    case 2: {
      return `([${label}])`;
    }
    default: {
      return `{${label}}`;
    }
  }
};

/**
 * A flowchart with `edges` edge lines over uniquely named nodes, mixing the
 * four node shapes like real user diagrams do. Each line is ~90 bytes.
 */
export const genFlowchartCode = (edges: number): string => {
  const lines: string[] = ['flowchart TD'];
  for (let i = 0; i < edges; i++) {
    const rawTarget = (i * 3 + 1) % (edges + 1);
    const to = rawTarget === i ? i + 1 : rawTarget;
    const label = `Node ${i} ${LABEL_WORDS[i % LABEL_WORDS.length]} step`;
    const target = `Node ${to} ${LABEL_WORDS[(i + 3) % LABEL_WORDS.length]} step`;
    lines.push(`    N${i}${shapeWrap(i, label)} -->|edge ${i}| N${to}${shapeWrap(i + 1, target)}`);
  }
  return lines.join('\n');
};

/** A config of the size users typically carry in the Config tab. */
export const typicalConfig = JSON.stringify(
  {
    flowchart: { curve: 'basis' },
    theme: 'default',
    themeVariables: { fontFamily: 'Recite' }
  },
  undefined,
  2
);

/** A much larger config (pasted from documentation examples). */
export const genLargeConfig = (kb: number): string => {
  const entries: string[] = [];
  for (let i = 0; i < kb * 8; i++) {
    entries.push(`"themeVariable${i}": "#${(i % 999999).toString(16).padStart(6, '0')}"`);
  }
  return `{\n  "theme": "default",\n  "themeVariables": {\n    ${entries.join(',\n    ')}\n  }\n}`;
};

/** A full editor `State` whose `code` is roughly `codeKb` kilobytes. */
export const genState = (codeKb: number): State => ({
  code: genFlowchartCode(Math.ceil((codeKb * 1024) / 90)),
  grid: true,
  mermaid: typicalConfig,
  panZoom: true,
  rough: false,
  updateDiagram: true
});
