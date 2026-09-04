<script lang="ts">
  import type { EditorProps } from '$/types';
  import { notify } from '$/util/notify';
  import { stripCodeFence } from '$/util/stripCodeFence';
  import { validatedState } from '$/util/state.svelte';
  import { json, jsonLanguage, jsonParseLinter } from '@codemirror/lang-json';
  import { markdown } from '@codemirror/lang-markdown';
  import { yamlFrontmatter } from '@codemirror/lang-yaml';
  import { language } from '@codemirror/language';
  import { linter } from '@codemirror/lint';
  import { Compartment, EditorState, Transaction } from '@codemirror/state';
  import { EditorView } from '@codemirror/view';
  import { vsCodeDark } from '@fsegurai/codemirror-theme-vscode-dark';
  import { vsCodeLight } from '@fsegurai/codemirror-theme-vscode-light';
  import { basicSetup } from 'codemirror';
  import { mode } from 'mode-watcher';
  import { onMount } from 'svelte';

  let editorView: EditorView | undefined;
  let editorContainer: HTMLDivElement;
  // Deliberately not $state: the sync effect below both reads and writes it,
  // so a reactive currentText would make every keystroke re-run the effect
  // against the not-yet-revalidated state and revert the user's input.
  let currentText = '';
  const themeCompartment = new Compartment();
  const languageCompartment = new Compartment();
  const wrapCompartment = new Compartment();
  const fontCompartment = new Compartment();

  const { onUpdate, wordWrap = false, fontSize = 14, onCursor }: EditorProps = $props();

  const fontTheme = (size: number) =>
    EditorView.theme({
      '.cm-content, .cm-gutters': { fontSize: `${size}px` }
    });

  // 「插入片段」入口：替换当前选区（无选区即在光标处插入）。
  export const insertAtCursor = (text: string): void => {
    if (!editorView) return;
    editorView.dispatch(editorView.state.replaceSelection(text));
    editorView.focus();
  };

  // 「定位到错误行」入口（与桌面 Monaco revealPosition 对齐——循环 45
  // 只给了桌面端）：置光标于该行并滚动居中。
  export const revealPosition = (line: number, column: number): void => {
    if (!editorView) return;
    const docLine = editorView.state.doc.line(
      Math.max(1, Math.min(line, editorView.state.doc.lines))
    );
    editorView.dispatch({
      effects: EditorView.scrollIntoView(docLine.from, { y: 'center' }),
      selection: { anchor: docLine.from + Math.max(0, column - 1) }
    });
    editorView.focus();
  };

  $effect(() => {
    // 同 DesktopEditor：先读 wordWrap 再 ?.，否则首跑短路丢掉依赖订阅
    const wrap = wordWrap;
    editorView?.dispatch({
      effects: wrapCompartment.reconfigure(wrap ? EditorView.lineWrapping : [])
    });
  });

  $effect(() => {
    const size = fontSize;
    editorView?.dispatch({
      effects: fontCompartment.reconfigure(fontTheme(size))
    });
  });

  $effect(() => {
    editorView?.dispatch({
      effects: themeCompartment.reconfigure(mode.current === 'dark' ? vsCodeDark : vsCodeLight)
    });
  });

  onMount(() => {
    editorView = new EditorView({
      state: EditorState.create({
        doc: currentText,
        extensions: [
          basicSetup,
          languageCompartment.of([]),
          themeCompartment.of([]),
          // 初始换行状态随创建一次就位（与 DesktopEditor 构造参数同理，
          // 防 effect 首跑早于 editorView 创建丢应用）；后续切换由 effect 管。
          wrapCompartment.of(wordWrap ? EditorView.lineWrapping : []),
          fontCompartment.of(fontTheme(fontSize)),
          // 状态栏：光标行列 + 总行数（与桌面端一致）。
          EditorView.updateListener.of((update) => {
            if (!onCursor || (!update.selectionSet && !update.docChanged)) {
              return;
            }
            const main = update.state.selection.main;
            const head = main.head;
            const line = update.state.doc.lineAt(head);
            onCursor({
              column: head - line.from + 1,
              line: line.number,
              lines: update.state.doc.lines,
              selected: Math.abs(main.to - main.from)
            });
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const newText = update.state.doc.toString();
              if (currentText === newText) {
                return;
              }
              currentText = newText;
              onUpdate(newText);
              // 粘贴整段 Markdown 围栏即剥离（与桌面 Monaco onDidPaste 同
              // 语义）：CM6 粘贴事务带 input.paste 标注，原位替换刚插入的
              // 范围；替换触发的新 update 会再走一遍上面的同步。
              for (const tr of update.transactions) {
                if (!(tr.annotation(Transaction.userEvent) ?? '').startsWith('input.paste')) {
                  continue;
                }
                tr.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
                  const inserted = update.state.doc.sliceString(fromB, toB);
                  const stripped = stripCodeFence(inserted);
                  if (stripped === undefined || stripped === inserted || !editorView) {
                    return;
                  }
                  editorView.dispatch({
                    changes: { from: fromB, to: toB, insert: stripped }
                  });
                  notify('已剥离 Markdown 代码围栏');
                });
              }
            }
          }),
          EditorView.theme({
            '&.cm-focused': {
              outline: 'none'
            },
            '&.cm-editor': {
              height: '100%'
            },
            '&.cm-scroller': {
              overflow: 'auto'
            }
          })
        ]
      }),
      parent: editorContainer
    });

    return () => {
      editorView?.destroy();
    };
  });

  $effect(() => {
    const { editorMode, code, mermaid } = validatedState.current;
    const text = editorMode === 'code' ? code : mermaid;
    if (currentText === text || !editorView) {
      return;
    }
    currentText = text;
    editorView.dispatch({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: text
      }
    });
    const stateLanguage = editorView.state.facet(language);
    const isStateJson = stateLanguage === jsonLanguage;
    const isCodeJson = editorMode === 'config';
    if (stateLanguage && isStateJson === isCodeJson) {
      return;
    }
    editorView.dispatch({
      effects: languageCompartment.reconfigure(
        // 配置模式：JSON 语法高亮 + 行内校验波浪线（与桌面端 Monaco json
        // worker 的 squiggles 对齐——此前移动端配置错误只有横幅没有行内定位）
        isCodeJson ? [json(), linter(jsonParseLinter())] : yamlFrontmatter({ content: markdown() })
      )
    });
  });
</script>

<div bind:this={editorContainer} class="size-full"></div>
