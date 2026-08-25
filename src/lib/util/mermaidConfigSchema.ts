/**
 * Mermaid 配置文档的手工精简 JSON Schema：挂到 Monaco JSON worker 上，
 * 配置模式敲键名/枚举值即有补全与说明（enableSchemaRequest=false，
 * 全程离线）。只覆盖高频键——additionalProperties 放开，不认识的
 * Mermaid 配置键照常可写，schema 只做提示不做封锁。
 */

import { MERMAID_LOOKS, MERMAID_THEMES } from '$/constants';

export const MERMAID_CONFIG_SCHEMA_URI = 'internal://mermaid-config.schema.json';

export const mermaidConfigSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  additionalProperties: true,
  properties: {
    darkMode: {
      description: '深色模式（多数场合建议改用 theme）',
      type: 'boolean'
    },
    flowchart: {
      additionalProperties: true,
      description: '流程图布局参数',
      properties: {
        curve: {
          description: '连线插值方式',
          enum: ['basis', 'linear', 'cardinal', 'monotoneX', 'natural', 'step'],
          type: 'string'
        },
        htmlLabels: { description: '标签用 HTML 渲染（富文本）', type: 'boolean' },
        nodeSpacing: { description: '同层节点间距(px)', type: 'number' },
        rankSpacing: { description: '层间距(px)', type: 'number' },
        wrappingWidth: { description: '标签自动换行宽度', type: 'number' }
      },
      type: 'object'
    },
    fontFamily: { description: '字体族（CSS font-family）', type: 'string' },
    fontSize: { description: '基础字号(px)', type: 'number' },
    look: {
      description: '整体风格：手绘质感 / 经典渲染',
      enum: [...MERMAID_LOOKS],
      type: 'string'
    },
    maxEdges: { description: '连线数上限（超出拒绝渲染）', type: 'number' },
    maxTextSize: { description: '文本最大字符数（超出截断）', type: 'number' },
    securityLevel: {
      description: '安全级别（loose 允许任意 HTML，慎用）',
      enum: ['strict', 'loose', 'antiscript', 'sandbox'],
      type: 'string'
    },
    sequence: {
      additionalProperties: true,
      description: '时序图布局参数',
      properties: {
        actorMargin: { description: '参与者间距(px)', type: 'number' },
        boxMargin: { description: '框边距(px)', type: 'number' },
        showSequenceNumbers: { description: '消息自动编号', type: 'boolean' }
      },
      type: 'object'
    },
    theme: {
      description: 'Mermaid 主题',
      enum: [...MERMAID_THEMES],
      type: 'string'
    },
    themeVariables: {
      additionalProperties: true,
      description: '主题变量覆盖（背景/主色/字号等，键名见 Mermaid 文档）',
      type: 'object'
    }
  },
  type: 'object'
} as const;
