import { defaultState } from '$/constants';
import type { ErrorHash, MarkerData, State, ValidatedState } from '$/types';
import { resolve } from '$app/paths';
import { debounce, get as lodashGet } from 'lodash-es';
import type { MermaidConfig } from 'mermaid';
import { untrack } from 'svelte';
import {
  extractErrorLineText,
  findMostRelevantLineNumber,
  replaceLineNumberInErrorMessage
} from './errorHandling';
import { parse } from './mermaid';
import { readJSON, writeJSON } from './persist.svelte';
import { findUnsafeConfigPaths, stripConfigPaths } from './sanitize';
import { deserializeState, serializeState } from './serde';
import { errorDebug, formatJSON } from './util';

export { defaultState };

const urlParseFailedState = `flowchart TD
    A[链接加载失败，我们可以尝试排查原因] -->|解码 JSON| B(请检查控制台中的 JSON 与错误详情)
    B --> C{JSON 是否正确?}
    C -->|是| D(请在 GitHub 提交 Issue 反馈此问题<br/>附上失效链接可以加快修复)
    C -->|否| E{这个链接是<br/>别人发给你的吗?}
    E -->|是| F[请对方发送<br/>完整的链接]
    E -->|否| G{你复制的 URL<br/>完整吗?}
    G --> |是| D
    G --> |"否 :("| H(可以尝试在原浏览器的历史记录<br/>时间线标签页中恢复此图表)`;

const CODE_STORE_KEY = 'codeStore';

// The single mutable input state; only update() below may write to it.
// The fallback is cloned so mutations never write through to defaultState.
const input = $state<State>(readJSON(CODE_STORE_KEY, { ...defaultState }));

// inputState is shared externally when exporting via URL, History, etc.
// It is reactive for reads; the read-only type keeps writes inside this
// module, where update() persists and re-validates every change.
export const inputState: Readonly<State> = input;

const validatedStateOf = (state: State): ValidatedState => {
  let serialized: string | undefined;
  return {
    ...state,
    editorMode: state.editorMode ?? 'code',
    error: undefined,
    errorMarkers: [],
    // Serialized lazily and cached: during fast typing the debounced URL
    // writers (hash and view link) only ever read the last publish, so
    // intermediate publishes skip the deflate entirely. Readers get the
    // exact same string this property always had.
    get serialized(): string {
      serialized ??= serializeState(state);
      return serialized;
    }
  };
};

const initialState = $state.snapshot(input) as State;
// Only ever replaced wholesale, so raw (shallow) reactivity is enough.
let validatedCurrent = $state.raw<ValidatedState>(validatedStateOf(initialState));

let lastDiagramType = '';

// mermaid.parse depends only on the code, but until now every publish
// re-parsed it — including editorMode / pan-zoom / config-only updates
// (tab switches, canvas pans) that did not touch the code. Memoize the
// outcome of the last parse so unchanged code skips it entirely. The
// outcome (diagramType, processed error and markers) is built from the
// code alone, so reuse is safe; only the newest requested code is cached
// so an older in-flight parse never shadows a newer one.
interface ParseOutcome {
  diagramType?: string;
  error?: Error;
  errorMarkers: MarkerData[];
}
let parsedCode: string | undefined;
let parsedOutcome: ParseOutcome | undefined;
let latestCodeRequested: string | undefined;

const parseAndCache = async (code: string): Promise<ParseOutcome> => {
  if (code === parsedCode && parsedOutcome) {
    return parsedOutcome;
  }
  latestCodeRequested = code;
  const outcome: ParseOutcome = { errorMarkers: [] };
  try {
    const { diagramType } = await parse(code);
    outcome.diagramType = diagramType;
    if (lastDiagramType === 'zenuml' && diagramType !== lastDiagramType) {
      // Temp Hack to refresh page after displaying ZenUML.
      setTimeout(() => window.location.reload(), 500);
    }
    lastDiagramType = diagramType;
  } catch (error) {
    outcome.error = error as Error;
    errorDebug();
    // No console.error here: a parse failure is the normal "code is being
    // typed" state, the UI already surfaces it, and one error line per
    // keystroke is a log storm under sustained typing.
    if (error && typeof error === 'object' && 'hash' in error) {
      try {
        let errorString = outcome.error.toString();
        const errorLineText = extractErrorLineText(errorString);
        const realLineNumber = findMostRelevantLineNumber(errorLineText, code);

        let first_line: number, last_line: number, first_column: number, last_column: number;
        try {
          ({ first_line, last_line, first_column, last_column } = (error.hash as ErrorHash).loc);
        } catch {
          const lineNo = findMostRelevantLineNumber(errorString, code);
          first_line = lineNo;
          last_line = lineNo + 1;
          first_column = 0;
          last_column = 0;
        }

        if (realLineNumber !== -1) {
          errorString = replaceLineNumberInErrorMessage(errorString, realLineNumber);
        }

        outcome.error = new Error(errorString);
        outcome.errorMarkers = [
          {
            endColumn: last_column + (first_column === last_column ? 0 : 5),
            endLineNumber: last_line + (realLineNumber - first_line),
            message: errorString || 'Syntax error',
            severity: 8, // Error
            startColumn: first_column,
            startLineNumber: realLineNumber
          }
        ];
      } catch (error) {
        console.error('Error without line helper', error);
      }
    }
  }
  if (latestCodeRequested === code) {
    parsedCode = code;
    parsedOutcome = outcome;
  }
  return outcome;
};

const processState = async (state: State) => {
  const processed = validatedStateOf(state);
  // No changes should be done to fields part of `state`.
  const outcome = await parseAndCache(state.code);
  processed.diagramType = outcome.diagramType;
  processed.error = outcome.error;
  processed.errorMarkers = outcome.errorMarkers;
  try {
    JSON.parse(state.mermaid);
  } catch (error) {
    // Invalid config JSON surfaces the same way a parse error does (no
    // markers) — also a normal mid-typing state, so no console.error here.
    processed.error = error as Error;
    errorDebug();
  }
  return processed;
};

// Replaces the old URL-hash store subscription; assigned by initURLSubscription.
// Trailing debounce that reads the LATEST validated state when it fires, so a
// typing burst coalesces into one hash update — and one serialization.
let updateHash: (() => void) | undefined;

// The view / full-screen link rides the same trailing cadence as the URL
// hash: mid-burst values were never observable in the address bar either.
let viewHrefSerialized = $state(validatedCurrent.serialized);
const scheduleViewHref = debounce(() => {
  viewHrefSerialized = validatedCurrent.serialized;
}, 250);

// Persist the current input state and asynchronously re-validate it,
// publishing the result to `validatedState` (and the URL hash, once
// initURLSubscription has run). Only called from update(), which suppresses
// dependency tracking.
//
// Publishes carry a sequence number: mermaid.parse latency varies with
// diagram size, so under fast typing an older snapshot's promise can resolve
// after a newer one's — without the guard the stale result would land last
// and the editor would show (and write to the URL) an outdated diagram.
// Superseded publishes are dropped; their state was overwritten anyway.
let processSeq = 0;
const persistAndProcess = (): void => {
  const snapshot = $state.snapshot(input) as State;
  const seq = ++processSeq;
  writeJSON(CODE_STORE_KEY, snapshot);
  void processState(snapshot).then((processed) => {
    if (seq !== processSeq) {
      return;
    }
    validatedCurrent = processed;
    updateHash?.();
    scheduleViewHref();
  });
};

// The single mutation gateway: every update function funnels its writes
// through here. The mutator runs untracked so effects that call an update
// function never subscribe to the input state it reads, and the trailing
// persist + re-validate cannot be forgotten by a new update function.
const update = (mutate: (state: State) => void): void => {
  untrack(() => {
    mutate(input);
    persistAndProcess();
  });
};

// All internal reads should be done via validatedState, but it should not be
// persisted/shared externally.
export const validatedState = {
  get current(): ValidatedState {
    return validatedCurrent;
  }
};

// `new` always serializes the same default state — compute it once instead
// of on every recompute of the derived below.
const newUrlHash = serializeState(defaultState);

const urlsCurrent = $derived.by(() => ({
  new: `${resolve('/edit', {})}#${newUrlHash}`,
  view: `${resolve('/view', {})}#${viewHrefSerialized}`
}));

export const urls = {
  get current() {
    return urlsCurrent;
  }
};

/**
 * Asks the user for confirmation if the config contains settings that might
 * pose security risks, such as a relaxed `securityLevel`.
 *
 * @param config - The Mermaid configuration to sanitize.
 * @returns The sanitized Mermaid configuration as a JSON string.
 */
export const sanitizeConfig = (config: string | MermaidConfig) => {
  const mermaidConfig: MermaidConfig =
    typeof config === 'string' ? (JSON.parse(config) as MermaidConfig) : config;

  const unsafePaths = findUnsafeConfigPaths(mermaidConfig);

  if (
    unsafePaths.length > 0 &&
    confirm(
      `为安全起见，将从配置中移除 ${unsafePaths
        .map((unsafePath) => {
          return `${JSON.stringify(unsafePath.join('.'))}: ${JSON.stringify(lodashGet(mermaidConfig, unsafePath))}`;
        })
        .join(',\n')}。\n如果你信任此图表的来源，请点击“取消”。`
    )
  ) {
    stripConfigPaths(mermaidConfig, unsafePaths);
  }
  return formatJSON(mermaidConfig);
};

export const loadState = (data: string): Promise<void> => {
  console.log(`Loading '${data}'`);
  // URL share links pass through the plugin input pipeline (source 'url').
  // The registry is imported dynamically: state is a low-level module and this
  // keeps the static dependency graph acyclic; plugins are loaded by then.
  // The promise is returned so startup can subscribe the URL writer only
  // AFTER the shared state lands — otherwise initURLSubscription's immediate
  // flush would overwrite the incoming share-link hash with the default
  // state for the import window.
  return import('../plugins/registry.svelte').then(({ runInputTransforms }) => {
    update((state) => {
      applyLoadedState(state, data, runInputTransforms);
    });
  });
};

const applyLoadedState = (
  state: State,
  data: string,
  transform: (code: string, source: 'bridge' | 'file' | 'url') => string
): void => {
  let next: State;
    try {
      next = deserializeState(data);
      next.mermaid = sanitizeConfig(next.mermaid || defaultState.mermaid);
      next.code = transform(next.code, 'url');
    } catch (error) {
      next = $state.snapshot(state) as State;
      if (data) {
        console.error('Init error', error);
        next.code = urlParseFailedState;
        next.mermaid = defaultState.mermaid;
      }
    }
  applyPartial(state, next);
};

let renderCount = 0;
const applyPartial = (state: State, newState: Partial<State>): void => {
  renderCount++;
  Object.assign(state, newState, { renderCount });
};

export const updateCodeStore = (newState: Partial<State>): void => {
  update((state) => applyPartial(state, newState));
};

export const updateCode = (
  code: string,
  {
    updateDiagram = false,
    resetPanZoom = false
  }: { updateDiagram?: boolean; resetPanZoom?: boolean } = {}
): void => {
  errorDebug();

  update((state) => {
    if (resetPanZoom) {
      state.pan = undefined;
      state.zoom = undefined;
    }
    state.code = code;
    state.updateDiagram = updateDiagram;
  });
};

export const updateConfig = (config: string): void => {
  updateCodeStore({ mermaid: config });
};

export const toggleDarkTheme = (dark: boolean): void => {
  update((state) => {
    const config = JSON.parse(state.mermaid) as MermaidConfig;
    if (!config.theme || ['dark', 'default'].includes(config.theme)) {
      config.theme = dark ? 'dark' : 'default';
    }
    state.mermaid = formatJSON(config);
  });
};

// Replaces the whole input state (e.g. when restoring a history entry),
// dropping keys the next state does not define.
export const replaceInputState = (next: State): void => {
  update((state) => {
    for (const key of Object.keys(state)) {
      if (!(key in next)) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- full-replace semantics
        delete (state as unknown as Record<string, unknown>)[key];
      }
    }
    Object.assign(state, next);
  });
};

export const initURLSubscription = (): void => {
  updateHash = debounce(() => {
    try {
      history.replaceState(undefined, '', `#${validatedCurrent.serialized}`);
    } catch (error) {
      // Extremely large diagrams can exceed the browser's URL-length limit;
      // the address bar then keeps the last state that fit. Editor function
      // is unaffected (localStorage stays the source of truth) and the Share
      // dialog still serializes on demand — but without this guard every
      // keystroke re-raised an uncaught error from the debounce timer.
      console.warn('Failed to sync diagram state to the URL:', error);
    }
  }, 250);
  updateHash();
};

export const verifyState = (): void => {
  update((state) => applyPartial(state, state.panZoom ? {} : { panZoom: true }));
};
