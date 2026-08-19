import { describe, expect, it } from 'vitest';
import {
  extractErrorLineText,
  findMostRelevantLineNumber,
  replaceLineNumberInErrorMessage
} from './errorHandling';

/**
 * Brute-force reference: the exact implementation that shipped before the
 * suffix-automaton rewrite. Differential tests below require the optimized
 * version to return identical line numbers for every input.
 */
const referenceImplementation = (errorLineText: string, code: string): number => {
  const codeLines = code.split('\n');
  let mostRelevantLineNumber = -1;
  let maxCommonLength = 0;

  for (const [i, line] of codeLines.entries()) {
    let commonLength = 0;
    for (let j = 0; j <= errorLineText.length; j++) {
      for (let k = j + 1; k <= errorLineText.length; k++) {
        const sub = errorLineText.slice(j, k);
        if (line.includes(sub)) {
          commonLength = Math.max(commonLength, sub.length);
        }
      }
    }
    if (commonLength > maxCommonLength) {
      maxCommonLength = commonLength;
      mostRelevantLineNumber = i + 1;
    }
  }
  return mostRelevantLineNumber;
};

const mermaidLikeCode = (edges: number): string => {
  const lines = ['flowchart TD'];
  for (let i = 0; i < edges; i++) {
    lines.push(`    N${i}[Node ${i} checkout step] -->|edge ${i}| N${i + 1}{Node ${i + 1}}`);
  }
  return lines.join('\n');
};

// Deterministic LCG so every run generates the same cases.
const lcg = (seed: number) => () => (seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296);
const randomString = (rand: () => number, alphabet: string, maxLength: number): string => {
  const length = Math.floor(rand() % maxLength) + 1;
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(rand() % alphabet.length)];
  }
  return out;
};

describe('findMostRelevantLineNumber (optimized vs brute-force reference)', () => {
  it('returns -1 for an empty error line', () => {
    expect(findMostRelevantLineNumber('', mermaidLikeCode(5))).toBe(-1);
  });

  it('returns -1 when no characters are shared', () => {
    expect(findMostRelevantLineNumber('zzzzz qqq', 'aaaa\nbbbb')).toBe(-1);
  });

  it('finds an exact full-line match', () => {
    const code = 'flowchart TD\n    A[Alpha] --> B[Beta]\n    C --> D';
    expect(findMostRelevantLineNumber('A[Alpha] --> B[Beta]', code)).toBe(2);
  });

  it('prefers the FIRST line among equal maxima', () => {
    const code = 'shared text here\nother line\nshared text here too';
    expect(findMostRelevantLineNumber('shared text', code)).toBe(1);
  });

  it('handles empty code', () => {
    expect(findMostRelevantLineNumber('anything', '')).toBe(-1);
  });

  it('handles repeated substrings and suffix-link resets', () => {
    const code = 'abababab\nxyz\nabab';
    expect(findMostRelevantLineNumber('abab', code)).toBe(referenceImplementation('abab', code));
  });

  it('matches the reference on mermaid-like diagrams', () => {
    const code = mermaidLikeCode(40);
    for (const line of code.split('\n')) {
      expect(findMostRelevantLineNumber(line.slice(3), code)).toBe(
        referenceImplementation(line.slice(3), code)
      );
    }
  });

  it('matches the reference on deterministic random inputs', () => {
    const rand = lcg(20_260_820);
    const alphabet = 'ab ()[]{}->|';
    for (let i = 0; i < 200; i++) {
      const errorLine = randomString(rand, alphabet, 24);
      const lineCount = Math.floor(rand() % 6) + 1;
      const lines: string[] = [];
      for (let j = 0; j < lineCount; j++) {
        lines.push(randomString(rand, alphabet, 24));
      }
      const code = lines.join('\n');
      expect(findMostRelevantLineNumber(errorLine, code)).toBe(
        referenceImplementation(errorLine, code)
      );
    }
  });

  it('matches the reference on a large diagram (bench generator shape)', () => {
    const code = mermaidLikeCode(1000);
    const errorLine = code.split('\n')[500].slice(4, 104);
    expect(findMostRelevantLineNumber(errorLine, code)).toBe(
      referenceImplementation(errorLine, code)
    );
  });

  it('treats UTF-16 surrogate pairs as units, like includes()', () => {
    const code = 'graph TD\n    A[图表开始] --> B[结束]';
    const emojiLine = 'A[图表开始]';
    expect(findMostRelevantLineNumber(emojiLine, code)).toBe(
      referenceImplementation(emojiLine, code)
    );
  });
});

describe('replaceLineNumberInErrorMessage', () => {
  it('rewrites parse error line numbers', () => {
    expect(replaceLineNumberInErrorMessage('Parse error on line 42: bad', 7)).toBe(
      'Parse error on line 7: bad'
    );
  });

  it('rewrites lexical error line numbers', () => {
    expect(replaceLineNumberInErrorMessage('Lexical error on line 9', 3)).toBe(
      'Lexical error on line 3'
    );
  });

  it('leaves other messages untouched', () => {
    expect(replaceLineNumberInErrorMessage('something else', 3)).toBe('something else');
  });
});

describe('extractErrorLineText', () => {
  it('extracts the failing line from a parse error', () => {
    const message = 'Error: Parse error on line 4:\n>> A[Alpha] --> B\n\nExpecting';
    expect(extractErrorLineText(message)).toBe('A[Alpha] --> B');
  });

  it('extracts the failing line from a lexical error', () => {
    const message = 'Error: Lexical error on line 2. Unrecognized text.\n>> broken\n---';
    expect(extractErrorLineText(message)).toBe('broken');
  });

  it('returns empty string when no pattern matches', () => {
    expect(extractErrorLineText('nope')).toBe('');
  });
});
