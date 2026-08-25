import { MERMAID_LOOKS, MERMAID_THEMES } from '$/constants';
import { describe, expect, it } from 'vitest';
import { mermaidConfigSchema } from './mermaidConfigSchema';

describe('mermaidConfigSchema（配置 JSON 补全）', () => {
  it('theme/look 枚举与常量表同步（不各写一份漂移）', () => {
    expect(mermaidConfigSchema.properties.theme.enum).toEqual([...MERMAID_THEMES]);
    expect(mermaidConfigSchema.properties.look.enum).toEqual([...MERMAID_LOOKS]);
  });

  it('高频键齐备且顶层是放开的对象（只做提示不做封锁）', () => {
    expect(mermaidConfigSchema.type).toBe('object');
    expect(mermaidConfigSchema.additionalProperties).toBe(true);
    for (const key of ['theme', 'look', 'themeVariables', 'flowchart', 'securityLevel']) {
      expect(Object.keys(mermaidConfigSchema.properties)).toContain(key);
    }
  });

  it('securityLevel 枚举恰为 Mermaid 四档', () => {
    expect(mermaidConfigSchema.properties.securityLevel.enum).toEqual([
      'strict',
      'loose',
      'antiscript',
      'sandbox'
    ]);
  });

  it('数值布局键给了 number 类型（补全同时约束类型提示）', () => {
    expect(mermaidConfigSchema.properties.flowchart.properties.nodeSpacing.type).toBe('number');
    expect(mermaidConfigSchema.properties.flowchart.properties.rankSpacing.type).toBe('number');
    expect(mermaidConfigSchema.properties.maxEdges.type).toBe('number');
  });
});
