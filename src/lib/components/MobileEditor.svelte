<script lang="ts">
  import type { EditorProps } from '$/types';
  import { validatedState } from '$/util/state.svelte';
  import { json, jsonLanguage } from '@codemirror/lang-json';
  import { markdown } from '@codemirror/lang-markdown';
  import { yamlFrontmatter } from '@codemirror/lang-yaml';
  import { language } from '@codemirror/language';
  import { Compartment, EditorState } from '@codemirror/state';
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

  const { onUpdate, wordWrap = false }: EditorProps = $props();

  // 「插入片段」入口：替换当前选区（无选区即在光标处插入）。
  export const insertAtCursor = (text: string): void => {
    if (!editorView) return;
    editorView.dispatch(editorView.state.replaceSelection(text));
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
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const newText = update.state.doc.toString();
              if (currentText === newText) {
                return;
              }
              currentText = newText;
              onUpdate(newText);
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
        isCodeJson ? json() : yamlFrontmatter({ content: markdown() })
      )
    });
  });
</script>

<div bind:this={editorContainer} class="size-full"></div>
