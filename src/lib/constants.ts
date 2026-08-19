import type { State } from './types';

export const TID = {
  downloadPNG: 'download-PNG',
  downloadSVG: 'download-SVG',
  embedEditLink: 'embed-edit-link',
  embedErrorCard: 'embed-error-card',
  embedFooter: 'embed-footer',
  embedModeToggle: 'embed-mode-toggle',
  embedPreview: 'embed-preview',
  embedRenderError: 'embed-render-error',
  embedSnippet: 'embed-snippet',
  embedToolbar: 'embed-toolbar',
  errorContainer: 'error-container',
  themeToggleButton: 'theme-toggle-button',
  visualAddNode: 'visual-add-node',
  visualCanvas: 'visual-canvas',
  visualClear: 'visual-clear',
  visualCodeOut: 'visual-code-out',
  visualDetailEditor: 'visual-detail-editor',
  visualTab: 'visual-tab'
} as const;

export const MERMAID_THEMES = [
  'default',
  'neutral',
  'forest',
  'dark',
  'neo',
  'neo-dark',
  'redux',
  'redux-dark',
  'redux-color',
  'redux-dark-color'
] as const;

export const MERMAID_LOOKS = ['classic', 'handDrawn', 'neo'] as const;

export const defaultState: State = {
  code: `flowchart TD
    A[圣诞节] -->|拿到压岁钱| B(去购物)
    B --> C{让我想想}
    C -->|一| D[笔记本电脑]
    C -->|二| E[iPhone]
    C -->|三| F[新车]
  `,
  grid: true,
  mermaid: JSON.stringify({ theme: 'default' }, undefined, 2),
  panZoom: true,
  rough: false,
  updateDiagram: true
};
