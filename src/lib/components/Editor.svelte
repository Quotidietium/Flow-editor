<script lang="ts">
  import DesktopEditor from '$/components/DesktopEditor.svelte';
  import MobileEditor from '$/components/MobileEditor.svelte';
  import { TID } from '$/constants';
  import { defaultConfigJson } from '$/util/configPresets';
  import {
    lastValidCode,
    loadState,
    updateCode,
    updateConfig,
    validatedState
  } from '$lib/util/state.svelte';
  import { shareLinkHash } from '$lib/util/serde';
  import { notify } from '$lib/util/notify';
  import { detectDiagramKind, KIND_SPECS } from '$lib/util/visualEditor/model';
  import { debounce } from 'lodash-es';
  import ExclamationCircleIcon from '~icons/material-symbols/error-outline-rounded';

  const {
    isMobile,
    wordWrap = false,
    fontSize = 14,
    minimap = false
  } = $props<{
    fontSize?: number;
    isMobile: boolean;
    minimap?: boolean;
    wordWrap?: boolean;
  }>();
  const onUpdate = (text: string) => {
    if (validatedState.current.editorMode === 'code') {
      updateCode(text);
    } else {
      updateConfig(text);
    }
  };

  // 状态栏：光标行列 + 总行数（语法错误行号的对照锚点），双端同构。
  let cursor = $state({ column: 1, line: 1, lines: 0, selected: 0 });
  const onCursor = (info: { column: number; line: number; lines: number; selected: number }) => {
    cursor = info;
  };

  // 状态栏左侧的图类型标识（与历史徽章/示例高亮同源的 detectDiagramKind）：
  // 多图来回切换时一眼看出正在编辑哪类图；配置模式无图可识别，不显示。
  const diagramKindLabel = $derived.by(() => {
    if (validatedState.current.editorMode !== 'code') {
      return undefined;
    }
    const kind = detectDiagramKind(validatedState.current.code);
    return kind ? KIND_SPECS[kind]?.label : undefined;
  });

  // 字符数：分享链接长度随代码增长（URL 有物理上限），状态栏给早期预警；
  // 配置模式显示配置 JSON 的字符数。
  const charCount = $derived(
    validatedState.current.editorMode === 'code'
      ? validatedState.current.code.length
      : validatedState.current.mermaid.length
  );

  // 标签页标题跟随图类型：多标签开多张图时一眼区分（浏览器原生标题栏/
  // 标签悬停），与状态栏标识同源；无法识别时保持默认标题。
  const titleKindLabel = $derived.by(() => {
    const kind = detectDiagramKind(validatedState.current.code);
    return kind ? KIND_SPECS[kind]?.label : undefined;
  });
  $effect(() => {
    document.title = titleKindLabel
      ? `${titleKindLabel} - Flow 编辑器`
      : '在线流程图与图表编辑器 - Flow 编辑器';
  });

  let showError = $state(false);

  // 错误条「定位到错误行」：经 bind:this 调用两端各自暴露的
  // revealPosition（桌面 Monaco / 移动 CodeMirror 对齐——循环 107 补移动端）。
  let desktopEditor:
    | {
        insertAtCursor?: (text: string) => void;
        revealPosition?: (line: number, column: number) => void;
      }
    | undefined = $state();
  const revealFirstError = () => {
    const marker = validatedState.current.errorMarkers[0];
    if (marker) {
      const reveal = isMobile ? mobileEditor?.revealPosition : desktopEditor?.revealPosition;
      reveal?.(marker.startLineNumber, marker.startColumn);
    }
  };

  // 「插入片段」门面：编辑页菜单经此统一进入双端编辑器。
  let mobileEditor:
    | {
        insertAtCursor?: (text: string) => void;
        revealPosition?: (line: number, column: number) => void;
      }
    | undefined = $state();
  export const insertAtCursor = (text: string): void => {
    if (isMobile) {
      mobileEditor?.insertAtCursor?.(text);
    } else {
      desktopEditor?.insertAtCursor?.(text);
    }
  };

  // 错误内容一键复制（排查/反馈时免手选长文本），双端可用。
  const copyError = async () => {
    const text = validatedState.current.error?.toString();
    if (!text) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      notify('已复制错误内容');
    } catch {
      notify('复制失败');
    }
  };

  // 配置错误的一键恢复：横幅现场给「重置为默认配置」直达钮——用户不必
  // 知道模板菜单里藏着同一个功能（双端可用，与模板菜单的重置同语义）。
  const resetConfig = () => {
    updateConfig(defaultConfigJson());
    notify('已重置为默认配置');
  };

  // 代码错误的一键恢复：回到最后一次解析成功的那份代码（粒度=每次有效
  // 键击，比历史时间线的 60s 快照细）。仅代码错误时提供——配置错误已有
  // 专属的重置钮；从无有效版本则无钮可给。
  const restoreLastValid = () => {
    const code = lastValidCode();
    if (code === undefined) {
      return;
    }
    updateCode(code);
    notify('已恢复到最近可用的版本');
  };

  // 分享链接整串误粘进代码区是高频误操作：横幅识别后一键载入——走与
  // URL 初始化同一条链路（反序列化 + 配置安全门 + url 源输入管道），
  // 预览因 code 变化自动重渲染。
  const loadSharedLink = () => {
    const hash = shareLinkHash(validatedState.current.code);
    if (!hash) {
      return;
    }
    void loadState(hash).then(() => notify('已载入链接中的图表'));
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
    <MobileEditor {onUpdate} {wordWrap} {fontSize} {onCursor} bind:this={mobileEditor} />
  {:else}
    <DesktopEditor
      {onUpdate}
      {wordWrap}
      {fontSize}
      {minimap}
      {onCursor}
      bind:this={desktopEditor} />
  {/if}
  <div
    class="flex flex-none items-center justify-end gap-3 px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums"
    data-testid="editor-status">
    {#if diagramKindLabel}
      <span class="mr-auto" data-testid="editor-kind">{diagramKindLabel}</span>
    {/if}
    {#if cursor.selected > 0}
      <!-- VSCode 同款：有选区时显示已选长度（复制/删除前的 sanity check） -->
      <span data-testid="editor-selection">已选 {cursor.selected} 字符</span>
    {/if}
    <span data-testid="editor-char-count">{charCount} 字符</span>
    <span>行 {cursor.line}，列 {cursor.column}</span>
    <span>共 {cursor.lines} 行</span>
  </div>
  {#if showError && validatedState.current.error instanceof Error}
    <div class="flex flex-col text-sm" data-testid={TID.errorContainer}>
      <div class="flex items-center justify-between gap-2 bg-slate-900 p-2 text-white">
        <div class="flex w-fit items-center gap-2">
          <ExclamationCircleIcon class="size-6 text-destructive" aria-hidden="true" />
          <p>
            {validatedState.current.errorSource === 'config' ? '配置 JSON 错误' : '图表语法错误'}
          </p>
        </div>
        <!-- 标记只带代码文档位置（state 网关只对 mermaid 代码产出 markers）；
             配置错误横幅或配置页在前时若仍给「定位」，会拿代码旧标记在配置
             文档里跳错行——只在「代码错误 + 代码页在前」时提供跳转。
             双端可用（移动端经 CodeMirror revealPosition，循环 107）。 -->
        {#if validatedState.current.errorSource === 'code' && validatedState.current.editorMode === 'code' && validatedState.current.errorMarkers.length > 0}
          <button
            class="rounded px-2 py-0.5 text-xs hover:bg-slate-700"
            data-testid="error-reveal"
            onclick={revealFirstError}>
            定位到错误行
          </button>
        {/if}
        {#if validatedState.current.errorSource === 'code' && lastValidCode() !== undefined}
          <button
            class="rounded px-2 py-0.5 text-xs hover:bg-slate-700"
            data-testid="error-restore-last"
            onclick={restoreLastValid}>
            恢复到最近可用版本
          </button>
        {/if}
        {#if validatedState.current.errorSource === 'code' && shareLinkHash(validatedState.current.code)}
          <button
            class="rounded px-2 py-0.5 text-xs hover:bg-slate-700"
            data-testid="error-load-link"
            onclick={loadSharedLink}>
            载入链接中的图表
          </button>
        {/if}
        {#if validatedState.current.errorSource === 'config'}
          <button
            class="rounded px-2 py-0.5 text-xs hover:bg-slate-700"
            data-testid="error-reset-config"
            onclick={resetConfig}>
            重置为默认配置
          </button>
        {/if}
        <button
          class="rounded px-2 py-0.5 text-xs hover:bg-slate-700"
          data-testid="error-copy"
          onclick={() => void copyError()}>
          复制错误内容
        </button>
      </div>
      <output class="max-h-32 overflow-auto bg-muted p-2" name="mermaid-error" for="editor">
        <pre>{validatedState.current.error?.toString()}</pre>
      </output>
    </div>
  {/if}
</div>
