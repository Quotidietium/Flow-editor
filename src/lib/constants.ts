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
  exportMenu: 'export-menu',
  exportMenuList: 'export-menu-list',
  pluginFrontendExit: 'plugin-frontend-exit',
  pluginInstall: 'plugin-install',
  pluginManager: 'plugin-manager',
  pluginManagerOpen: 'plugin-manager-open',
  themeToggleButton: 'theme-toggle-button',
  visualAddNode: 'visual-add-node',
  visualCanvas: 'visual-canvas',
  visualClear: 'visual-clear',
  visualCodeOut: 'visual-code-out',
  visualContextMenu: 'visual-context-menu',
  visualDetailEditor: 'visual-detail-editor',
  visualInsert: 'visual-insert',
  visualInsertMenu: 'visual-insert-menu',
  visualLayoutMenu: 'visual-layout-menu',
  visualLayoutMenuList: 'visual-layout-menu-list',
  visualMenuDelete: 'visual-menu-delete',
  visualMeta: 'visual-meta',
  visualNodeType: 'visual-node-type',
  visualPreview: 'visual-preview',
  visualPreviewToggle: 'visual-preview-toggle',
  visualRedo: 'visual-redo',
  visualTab: 'visual-tab',
  visualUndo: 'visual-undo'
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
