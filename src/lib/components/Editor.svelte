<script lang="ts">
  import DesktopEditor from '$/components/DesktopEditor.svelte';
  import MobileEditor from '$/components/MobileEditor.svelte';
  import { TID } from '$/constants';
  import { updateCode, updateConfig, validatedState } from '$lib/util/state.svelte';
  import { debounce } from 'lodash-es';
  import ExclamationCircleIcon from '~icons/material-symbols/error-outline-rounded';

  const {
    isMobile,
    wordWrap = false,
    fontSize = 14
  } = $props<{
    fontSize?: number;
    isMobile: boolean;
    wordWrap?: boolean;
  }>();
  const onUpdate = (text: string) => {
    if (validatedState.current.editorMode === 'code') {
      updateCode(text);
    } else {
      updateConfig(text);
    }
  };

  let showError = $state(false);

  // 桌面端错误条「定位到错误行」：经 bind:this 调用 DesktopEditor 暴露的
  // revealPosition；移动端无 Monaco 标记体系，按钮不渲染。
  let desktopEditor:
    | {
        insertAtCursor?: (text: string) => void;
        revealPosition?: (line: number, column: number) => void;
      }
    | undefined = $state();
  const revealFirstError = () => {
    const marker = validatedState.current.errorMarkers[0];
    if (marker) {
      desktopEditor?.revealPosition?.(marker.startLineNumber, marker.startColumn);
    }
  };

  // 「插入片段」门面：编辑页菜单经此统一进入双端编辑器。
  let mobileEditor: { insertAtCursor?: (text: string) => void } | undefined = $state();
  export const insertAtCursor = (text: string): void => {
    if (isMobile) {
      mobileEditor?.insertAtCursor?.(text);
    } else {
      desktopEditor?.insertAtCursor?.(text);
    }
  };

  const showErrorDebounced = debounce(() => {
    showError = true;
  }, 3000);

  $effect(() => {
    if (validatedState.current.error) {
      showErrorDebounced();
    } else {
      showErrorDebounced.cancel();
      showError = false;
    }

    return () => {
      showErrorDebounced.cancel();
    };
  });
</script>

<div class="flex h-full flex-col">
  {#if isMobile}
    <MobileEditor {onUpdate} {wordWrap} {fontSize} bind:this={mobileEditor} />
  {:else}
    <DesktopEditor {onUpdate} {wordWrap} {fontSize} bind:this={desktopEditor} />
  {/if}
  {#if showError && validatedState.current.error instanceof Error}
    <div class="flex flex-col text-sm" data-testid={TID.errorContainer}>
      <div class="flex items-center justify-between gap-2 bg-slate-900 p-2 text-white">
        <div class="flex w-fit items-center gap-2">
          <ExclamationCircleIcon class="size-6 text-destructive" aria-hidden="true" />
          <p>语法错误</p>
        </div>
        {#if !isMobile && validatedState.current.errorMarkers.length > 0}
          <button
            class="rounded px-2 py-0.5 text-xs hover:bg-slate-700"
            data-testid="error-reveal"
            onclick={revealFirstError}>
            定位到错误行
          </button>
        {/if}
      </div>
      <output class="max-h-32 overflow-auto bg-muted p-2" name="mermaid-error" for="editor">
        <pre>{validatedState.current.error?.toString()}</pre>
      </output>
    </div>
  {/if}
</div>
