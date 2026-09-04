import { describe, expect, it } from 'vitest';
import { stripCodeFence } from './stripCodeFence';

describe('stripCodeFence（循环 125：围栏粘贴剥离）', () => {
  it('strips a mermaid-marked fence', () => {
    expect(stripCodeFence('```mermaid\nflowchart TD\nA-->B\n```')).toBe('flowchart TD\nA-->B');
  });

  it('strips a bare fence and an mmd-marked one', () => {
    expect(stripCodeFence('```\ngraph TD\nA-->B\n```')).toBe('graph TD\nA-->B');
    expect(stripCodeFence('```mmd\nA-->B\n```')).toBe('A-->B');
  });

  it('tolerates surrounding whitespace and trailing newline', () => {
    expect(stripCodeFence('\n```mermaid\nA-->B\n```\n')).toBe('A-->B');
    expect(stripCodeFence('```mermaid\nA-->B\n```  \n')).toBe('A-->B');
  });

  it('normalizes CRLF from the clipboard', () => {
    expect(stripCodeFence('```mermaid\r\nflowchart TD\r\nA-->B\r\n```')).toBe(
      'flowchart TD\nA-->B'
    );
  });

  it('keeps empty and multi-line code, including inner blank lines', () => {
    expect(stripCodeFence('```mermaid\nflowchart TD\n\nA-->B\n\nC-->D\n```')).toBe(
      'flowchart TD\n\nA-->B\n\nC-->D'
    );
  });

  it('returns undefined for plain code without fences', () => {
    expect(stripCodeFence('flowchart TD\nA-->B')).toBeUndefined();
  });

  it('returns undefined for fences marked with another language', () => {
    // 标注其它语言的内容显然不是 mermaid——原样放行交给语法错误横幅
    expect(stripCodeFence('```python\nprint(1)\n```')).toBeUndefined();
    expect(stripCodeFence('```js\nconst a = 1;\n```')).toBeUndefined();
  });

  it('returns undefined when code surrounds the fence (not a pure paste)', () => {
    expect(stripCodeFence('flowchart TD\n```\nA-->B\n```')).toBeUndefined();
    expect(stripCodeFence('```mermaid\nA-->B\n``` extra')).toBeUndefined();
  });
});
