<script lang="ts">
  import type { EditorProps, MarkerData } from '$/types';
  import { MERMAID_CONFIG_SCHEMA_URI, mermaidConfigSchema } from '$/util/mermaidConfigSchema';
  import { validatedState } from '$/util/state.svelte';
  import { initEditor } from '$lib/util/monacoExtra';
  import { errorDebug } from '$lib/util/util';
  import { mode } from 'mode-watcher';
  import * as monaco from 'monaco-editor';
  import monacoEditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
  import monacoJsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
  import { onMount } from 'svelte';

  const {
    onUpdate,
    wordWrap = false,
    fontSize = 14,
    minimap = false,
    onCursor
  }: EditorProps = $props();

  let divElement: HTMLDivElement | undefined = $state();
  let editor: monaco.editor.IStandaloneCodeEditor | undefined;
  let editorOptions = {
    // 括号配对着色 + 缩进/括号参考线：配置 JSON 嵌套一深就靠数括号，
    // 全程视觉辅助，不改变任何文档内容。
    bracketPairColorization: { enabled: true },
    guides: { bracketPairs: true, indentation: true },
    lineNumbersMinChars: 4,
    minimap: {
      enabled: false
    },
    overviewRulerLanes: 0
  } satisfies monaco.editor.IStandaloneEditorConstructionOptions;
  let currentText = '';
  let isUpdatingFromState = false;
  // Marker applications are deduplicated: the parse cache reuses the same
  // markers array for unchanged code, and Monaco rebuilds decorations even
  // for identical markers.
  let lastMarkers: readonly MarkerData[] | undefined;
  let lastMarkersModel: monaco.editor.ITextModel | undefined;

  const applyEditorTheme = (currentMode: typeof mode.current) => {
    if (!editor) return;
    monaco.editor.setTheme(`mermaid${currentMode === 'dark' ? '-dark' : ''}`);
    divElement?.classList.toggle('mermaid-dark', currentMode === 'dark');
  };

  // 错误条「定位」入口：把标记行滚到视口中央、放置光标并聚焦编辑器。
  export const revealPosition = (line: number, column: number): void => {
    if (!editor) return;
    editor.revealLineInCenter(line);
    editor.setPosition({ column: Math.max(1, column), lineNumber: line });
    editor.focus();
  };

  // 「插入片段」入口：在当前选区/光标处插入（选中则替换），不触碰其它内容。
  export const insertAtCursor = (text: string): void => {
    const selection = editor?.getSelection();
    if (!editor || !selection) return;
    editor.executeEdits('insert-snippet', [{ range: selection, text }]);
    editor.focus();
  };

  $effect(() => {
    applyEditorTheme(mode.current);
  });

  // 自动换行开关（持久化偏好在编辑页持有）：长链式代码免去横向滚动。
  $effect(() => {
    // 必须先无条件读 wordWrap：editor 未创建时 ?. 短路会跳过这次读取，
    // effect 从而永不订阅 wordWrap（依赖追踪只认实际执行到的读取），
    // 之后切换开关 effect 不再触发——探针期 console.log 恰好读了它才"时好时坏"。
    const wrap = wordWrap;
    editor?.updateOptions({ wordWrap: wrap ? 'on' : 'off' });
  });

  // 编辑器字号（同 wordWrap 的订阅教训：先无条件读取再 ?.）。
  $effect(() => {
    const size = fontSize;
    editor?.updateOptions({ fontSize: size });
  });

  // 小地图开关（长代码导航；默认关，移动端无此选项）。
  $effect(() => {
    const show = minimap;
    editor?.updateOptions({ minimap: { enabled: show } });
  });

  const jsonModel = monaco.editor.createModel(
    '',
    'json',
    monaco.Uri.parse('internal://config.json')
  );
  const mermaidModel = monaco.editor.createModel(
    '',
    'mermaid',
    monaco.Uri.parse('internal://mermaid.mmd')
  );

  onMount(() => {
    self.MonacoEnvironment = {
      getWorker(_, label) {
        if (label === 'json') {
          return new monacoJsonWorker();
        }
        return new monacoEditorWorker();
      }
    };

    if (!divElement) {
      throw new Error('divEl is undefined');
    }

    // Local syntax validation only — no schema is fetched from the network.
    // 挂手工精简 schema：配置模式敲键名/枚举值即有补全与中文说明
    // （schema 只做提示，未知 Mermaid 键照常可写）。
    monaco.json.jsonDefaults.setDiagnosticsOptions({
      enableSchemaRequest: false,
      schemas: [
        {
          fileMatch: ['internal://config.json'],
          schema: mermaidConfigSchema,
          uri: MERMAID_CONFIG_SCHEMA_URI
        }
      ],
      validate: true
    });

    initEditor(monaco);
    errorDebug();
    // 构造即带上换行偏好：$effect 首跑可能早于 editor 创建（主题 effect 的
    // if(!editor) 守卫 + onMount 内补应用正是同一坑的既有先例），仅靠
    // effect 会在「持久化偏好为开」的冷启动丢一次应用。
    editor = monaco.editor.create(divElement, {
      ...editorOptions,
      fontSize,
      minimap: { enabled: minimap },
      wordWrap: wordWrap ? 'on' : 'off'
    });

    editor.onDidChangeModelContent(({ isFlush }) => {
      const newText = editor?.getValue();
      // Empty text propagates like any other edit: swallowing it left the
      // persisted state (exports/share URL/history) carrying the previous
      // diagram while the editor showed an empty document — MobileEditor
      // already behaves this way.
      if (currentText === newText || isFlush || isUpdatingFromState) {
        return;
      }
      currentText = newText ?? '';
      onUpdate(currentText);
    });

    // 状态栏：光标行列 + 总行数（语法错误的行号对照）。
    const emitCursor = () => {
      const position = editor?.getPosition();
      if (position && onCursor) {
        onCursor({
          column: position.column,
          line: position.lineNumber,
          lines: editor?.getModel()?.getLineCount() ?? 0
        });
      }
    };
    editor.onDidChangeCursorPosition(emitCursor);
    emitCursor();

    applyEditorTheme(mode.current);

    const resizeObserver = new ResizeObserver((entries) => {
      editor?.layout({
        height: entries[0].contentRect.height,
        width: entries[0].contentRect.width
      });
    });

    if (divElement.parentElement) {
      resizeObserver.observe(divElement);
    }

    return () => {
      resizeObserver.disconnect();
      jsonModel.dispose();
      mermaidModel.dispose();
      editor?.dispose();
    };
  });

  $effect(() => {
    const { errorMarkers, editorMode, code, mermaid } = validatedState.current;
    if (!editor) {
      return;
    }

    const model = editorMode === 'code' ? mermaidModel : jsonModel;

    if (editor.getModel()?.id !== model.id) {
      editor.setModel(model);
    }

    // Update editor text if it's different
    const newText = editorMode === 'code' ? code : mermaid;
    if (newText !== currentText) {
      isUpdatingFromState = true;
      try {
        editor.setScrollTop(0);
        editor.pushUndoStop();
        editor.executeEdits('updateCode', [
          {
            range: model.getFullModelRange(),
            text: newText
          }
        ]);
        editor.pushUndoStop();
        currentText = newText;
      } finally {
        isUpdatingFromState = false;
      }
    }

    // Display/clear errors — only when they (or their model) changed. The
    // markers carry positions in the mermaid CODE document; on the config
    // tab they must not be transplanted onto the JSON (config errors are
    // surfaced by Monaco's own json validation).
    const markers = model === mermaidModel ? errorMarkers : [];
    if (model !== lastMarkersModel || markers !== lastMarkers) {
      lastMarkersModel = model;
      lastMarkers = markers;
      monaco.editor.setModelMarkers(model, 'mermaid', markers);
    }
  });
</script>

<div class="relative h-full grow overflow-hidden">
  <div bind:this={divElement} id="editor" class="h-full w-full"></div>
</div>
