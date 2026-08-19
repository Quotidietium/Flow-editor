// Study: pako deflate level trade-off for URL serialization
//
// The share URL uses `pako:<base64(deflate(json))>`. Level 9 is the slowest
// deflate setting and runs on every state publish. Any deflate level decodes
// with the same inflate, so the level is a pure time/size trade-off.
//
// Run: node benchmark/studies/deflate-level.mjs
// Self-contained on purpose (no TS imports) so it runs under plain node.

import { fromUint8Array } from 'js-base64';
import { deflate } from 'pako';

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

const shapeWrap = (index, label) => {
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

// Byte-identical to benchmark/lib/gen.ts genFlowchartCode.
const genFlowchartCode = (edges) => {
  const lines = ['flowchart TD'];
  for (let i = 0; i < edges; i++) {
    const rawTarget = (i * 3 + 1) % (edges + 1);
    const to = rawTarget === i ? i + 1 : rawTarget;
    const label = `Node ${i} ${LABEL_WORDS[i % LABEL_WORDS.length]} step`;
    const target = `Node ${to} ${LABEL_WORDS[(i + 3) % LABEL_WORDS.length]} step`;
    lines.push(`    N${i}${shapeWrap(i, label)} -->|edge ${i}| N${to}${shapeWrap(i + 1, target)}`);
  }
  return lines.join('\n');
};

const payloads = {
  '2KB': JSON.stringify({
    code: genFlowchartCode(24),
    mermaid: '{\n  "theme": "default"\n}',
    panZoom: true,
    rough: false,
    updateDiagram: true,
    grid: true
  }),
  '100KB': JSON.stringify({
    code: genFlowchartCode(1140),
    mermaid: '{\n  "theme": "default"\n}',
    panZoom: true,
    rough: false,
    updateDiagram: true,
    grid: true
  }),
  '1MB': JSON.stringify({
    code: genFlowchartCode(11500),
    mermaid: '{\n  "theme": "default"\n}',
    panZoom: true,
    rough: false,
    updateDiagram: true,
    grid: true
  })
};

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const WARMUP = 5;
const RUNS = 15;

for (const [name, json] of Object.entries(payloads)) {
  const data = new TextEncoder().encode(json);
  console.log(`\n### payload ${name} (${data.length.toLocaleString()} bytes)`);
  console.log('| level | median ms | deflate bytes | base64 chars | vs L9 size |');
  console.log('|-------|-----------|---------------|--------------|------------|');
  const level9Base64 = fromUint8Array(deflate(data, { level: 9 }), true);
  for (const level of [1, 4, 6, 9]) {
    for (let i = 0; i < WARMUP; i++) {
      deflate(data, { level });
    }
    const times = [];
    let out = null;
    for (let i = 0; i < RUNS; i++) {
      const start = performance.now();
      out = deflate(data, { level });
      times.push(performance.now() - start);
    }
    const b64 = fromUint8Array(out, true);
    const overhead = ((b64.length / level9Base64.length - 1) * 100).toFixed(1);
    console.log(
      `| ${level} | ${median(times).toFixed(2)} | ${out.length.toLocaleString()} | ${b64.length.toLocaleString()} | +${overhead}% |`
    );
  }
}
