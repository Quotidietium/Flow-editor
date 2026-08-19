// Function to find the line number with the most characters in common with the error
//
// For every code line this needs the length of the longest substring the line
// shares with the error text. The previous implementation enumerated every
// substring of the error text for every line (quartic in the error length,
// ~60-120ms per call on real diagrams, i.e. per keystroke while the code is
// broken). Building a suffix automaton over the error text once and streaming
// each line through it computes the same values in linear total time.
// Results are bit-identical: the first line strictly exceeding the previous
// maximum wins, and lines with no characters in common never match (verified
// by differential tests against the brute-force reference).
export function findMostRelevantLineNumber(errorLineText: string, code: string): number {
  if (errorLineText.length === 0) {
    return -1;
  }
  const { len, link, transitions } = buildSuffixAutomaton(errorLineText);
  const target = errorLineText.length;

  let mostRelevantLineNumber = -1;
  let maxCommonLength = 0;

  for (const [i, line] of code.split('\n').entries()) {
    // Stream the line through the automaton: `commonLength` tracks the
    // longest suffix of line[0..j] that is also a substring of the error
    // text; the walk's maximum over j is the longest common substring.
    let lineMax = 0;
    let commonLength = 0;
    let state = 0;
    for (const c of line) {
      while (state !== 0 && !transitions[state].has(c)) {
        state = link[state];
        commonLength = len[state];
      }
      const next = transitions[state].get(c);
      if (next === undefined) {
        state = 0;
        commonLength = 0;
      } else {
        state = next;
        commonLength += 1;
      }
      if (commonLength > lineMax) {
        lineMax = commonLength;
      }
    }
    if (lineMax > maxCommonLength) {
      maxCommonLength = lineMax;
      mostRelevantLineNumber = i + 1; // Line numbers start from 1
      if (maxCommonLength === target) {
        break; // No line can share more than the whole error text.
      }
    }
  }
  return mostRelevantLineNumber;
}

interface SuffixAutomaton {
  len: Int32Array;
  link: Int32Array;
  transitions: Map<string, number>[];
}

// Classic online construction over single characters (the same units
// `String.prototype.includes` matches on). At most 2*len states are created.
const buildSuffixAutomaton = (text: string): SuffixAutomaton => {
  const maxStates = 2 * text.length + 5;
  const len = new Int32Array(maxStates);
  const link = new Int32Array(maxStates);
  const transitions: Map<string, number>[] = [];
  const newState = (): number => {
    transitions.push(new Map());
    return transitions.length - 1;
  };

  link[0] = -1;
  let last = newState();

  for (const c of text) {
    const cur = newState();
    len[cur] = len[last] + 1;
    let p = last;
    for (; p !== -1 && !transitions[p].has(c); p = link[p]) {
      transitions[p].set(c, cur);
    }
    if (p === -1) {
      link[cur] = 0;
    } else {
      const q = transitions[p].get(c) as number;
      if (len[p] + 1 === len[q]) {
        link[cur] = q;
      } else {
        const clone = newState();
        len[clone] = len[p] + 1;
        link[clone] = link[q];
        transitions[clone] = new Map(transitions[q]);
        for (; p !== -1 && transitions[p].get(c) === q; p = link[p]) {
          transitions[p].set(c, clone);
        }
        link[q] = clone;
        link[cur] = clone;
      }
    }
    last = cur;
  }
  return { len, link, transitions };
};

// Function to replace the incorrect line number in the error message
export function replaceLineNumberInErrorMessage(
  errorMessage: string,
  realLineNumber: number
): string {
  const regexParseError = /Parse error on line (\d+):/;
  const regexLexError = /Lexical error on line (\d+)/;
  return errorMessage
    .replace(regexParseError, `Parse error on line ${realLineNumber}:`)
    .replace(regexLexError, `Lexical error on line ${realLineNumber}`);
}

export function extractErrorLineText(errorMessage: string): string {
  const regex = /Error: Parse error on line \d+:\n(.+)\n+/;
  const match = errorMessage.match(regex);
  if (match) {
    return match[1].slice(3);
  }

  const regexLex = /Error: Lexical error on line \d+. Unrecognized text.\n(.+)\n-+/;
  const matchLex = errorMessage.match(regexLex);
  return matchLex ? matchLex[1].slice(3) : '';
}
