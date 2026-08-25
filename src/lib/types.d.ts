import type { Component } from 'svelte';
import type { HTMLInputTypeAttribute } from 'svelte/elements';
import 'unplugin-icons/types/svelte';

export interface MarkerData {
  severity: number;
  message: string;
  source?: string;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

export interface TabEvents {
  select: Tab;
}

export interface Tab {
  id: string;
  title: string;
  icon: Component;
  /** Optional data-testid for e2e targeting. */
  testID?: string;
}

export interface State {
  code: string;
  mermaid: string;
  updateDiagram: boolean;
  rough: boolean;
  // All new options must be optional, as users would have old states saved
  renderCount?: number;
  panZoom?: boolean;
  grid?: boolean;
  editorMode?: EditorMode;
  pan?: { x: number; y: number };
  zoom?: number;
}

export interface ValidatedState extends State {
  editorMode: EditorMode;
  diagramType?: string;
  error?: Error;
  /** 错误来源：code = 图表语法错误；config = 配置 JSON 错误（错误条文案分流）。 */
  errorSource?: 'code' | 'config';
  errorMarkers: MarkerData[];
  serialized: string;
}

export type HistoryType = 'auto' | 'manual' | 'loader';
export type HistoryEntry = { id: string; state: State; time: number; url?: string } & (
  | {
      type: 'loader';
      name: string;
    }
  | {
      type: HistoryType;
      name?: string;
    }
);

export type EditorMode = 'code' | 'config';

export type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

export interface ErrorHash {
  loc: {
    first_line: number;
    last_line: number;
    first_column: number;
    last_column: number;
  };
}

export type InputType = Exclude<HTMLInputTypeAttribute, 'file'>;

export interface EditorProps {
  fontSize?: number;
  minimap?: boolean;
  onCursor?: (info: { column: number; line: number; lines: number }) => void;
  onUpdate: (text: string) => void;
  wordWrap?: boolean;
}
