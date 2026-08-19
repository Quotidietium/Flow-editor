// Benchmark: visual editor model (parse / generate / layout)
//
// Hot path: parseFlowchart runs whenever the visual canvas is (re)entered;
// generateCode + layoutGraph run on toolbar actions. All pure functions.

import { bench, describe } from 'vitest';
import {
  generateCode,
  layoutGraph,
  parseFlowchart,
  type VGraph
} from '../src/lib/util/visualEditor/model';
import { genFlowchartCode } from './lib/gen';

const parsedGraph = (edges: number): VGraph => {
  const parsed = parseFlowchart(genFlowchartCode(edges));
  return parsed.ok ? parsed.result.graph : (undefined as unknown as VGraph);
};

const graph100 = parsedGraph(100);
const graph500 = parsedGraph(500);

describe('parseFlowchart', () => {
  bench('100 edges', () => {
    parseFlowchart(code100);
  });

  bench('500 edges', () => {
    parseFlowchart(code500);
  });
});

describe('generateCode', () => {
  bench('100-edge graph', () => {
    generateCode(graph100);
  });

  bench('500-edge graph', () => {
    generateCode(graph500);
  });
});

describe('layoutGraph', () => {
  bench('100-edge graph', () => {
    layoutGraph(graph100);
  });

  bench('500-edge graph', () => {
    layoutGraph(graph500);
  });
});
