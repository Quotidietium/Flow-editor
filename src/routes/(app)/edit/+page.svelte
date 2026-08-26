<script lang="ts">
  import Actions from '$/components/Actions.svelte';
  import Card from '$/components/Card/Card.svelte';
  import ConfigPresets from '$/components/ConfigPresets.svelte';
  import Editor from '$/components/Editor.svelte';
  import FontSizeMenu from '$/components/FontSizeMenu.svelte';
  import History from '$/components/History/History.svelte';
  import { addManualEntry, startAutoSave } from '$/components/History/historyState.svelte';
  import InsertSnippets from '$/components/InsertSnippets.svelte';
  import Navbar from '$/components/Navbar.svelte';
  import PluginManager from '$/components/PluginManager.svelte';
  import { installEditorApi } from '$/plugins/editorApi';
  import { installBridgeInvoker, startBridge } from '$/plugins/bridge';
  import { loadRegistry } from '$/plugins/registry.svelte';
  import PanZoomToolbar from '$/components/PanZoomToolbar.svelte';
  import Preset from '$/components/Preset.svelte';
  import Share from '$/components/Share.svelte';
  import SyncRoughToolbar from '$/components/SyncRoughToolbar.svelte';
  import { Button } from '$/components/ui/button';
  import * as Resizable from '$/components/ui/resizable';
  import { Switch } from '$/components/ui/switch';
  import { Toggle } from '$/components/ui/toggle';
  import VersionSecurityToolbar from '$/components/VersionSecurityToolbar.svelte';
  import View from '$/components/View.svelte';
  import VisualEditor from '$/components/VisualEditor.svelte';
  import { TID } from '$/constants';
  import type { EditorMode, Tab } from '$/types';
  import { PanZoomState } from '$/util/panZoom';
  import { readJSON, writeJSON } from '$/util/persist.svelte';
  import { notify } from '$/util/notify';
  import { inputState, validatedState, updateCodeStore, urls } from '$/util/state.svelte';
  import { initHandler } from '$/util/util';
  import { editorFontSize } from '$/util/editorFontSize.svelte';
  import { loadFileIntoEditor } from '$/util/loadFile';
  import { mode, setMode } from 'mode-watcher';
  import { onMount, untrack } from 'svelte';
  import CodeIcon from '~icons/custom/code';
  import HistoryIcon from '~icons/material-symbols/history';
  import BackIcon from '~icons/material-symbols/arrow-back-rounded';
  import DarkModeIcon from '~icons/material-symbols/dark-mode-rounded';
  import EditIcon from '~icons/material-symbols/edit-note-rounded';
  import GearIcon from '~icons/material-symbols/settings-outline-rounded';
  import LightModeIcon from '~icons/material-symbols/light-mode-rounded';
  import PluginIcon from '~icons/material-symbols/extension-rounded';
  import MinimapIcon from '~icons/material-symbols/map-outline-rounded';
  import WrapTextIcon from '~icons/material-symbols/wrap-text-rounded';

  const panZoomState = new PanZoomState();

  const tabSelectHandler = (tab: Tab) => {
    const editorMode: EditorMode = tab.id === 'code' ? 'code' : 'config';
    updateCodeStore({ editorMode });
  };

  const editorTabs: Tab[] = [
    {
      icon: CodeIcon,
      id: 'code',
      title: '代码'
    },
    {
      icon: GearIcon,
      id: 'config',
      title: '配置'
    }
  ];

  // WYSIWYG: the visual editor takes over the large preview pane; the left
  // editor keeps the code. `active` makes the visual editor reload external
  // code edits whenever the mode is entered.
  let visualMode = $state(false);
  // 对比模式：可视化编辑旁边再并一栏真正的 Mermaid 预览（同一 View 组件），
  // 形成 代码编辑 | 可视化画布 | 预览 三栏对比；默认关闭（纯代码+可视化两栏）。
  const COMPARE_KEY = 'visualEditorPreview';
  let visualCompare = $state(readJSON<boolean>(COMPARE_KEY, false));
  $effect(() => {
    writeJSON(COMPARE_KEY, visualCompare);
  });

  // 编辑器自动换行偏好（代码/配置共用，Monaco 与 CodeMirror 双端生效）。
  const WRAP_KEY = 'editorWordWrap';
  let wordWrap = $state(readJSON<boolean>(WRAP_KEY, false));
  $effect(() => {
    writeJSON(WRAP_KEY, wordWrap);
  });

  // 编辑器字号偏好（双端生效），默认 14px——单例见 util/editorFontSize.svelte，
  // 主菜单字号行共享同一偏好（移动端 390px 头部菜单被隐藏后也可调）。
  // Monaco 小地图偏好（仅桌面端；长代码导航），默认关。
  const MINIMAP_KEY = 'editorMinimap';
  let minimap = $state(readJSON<boolean>(MINIMAP_KEY, false));
  $effect(() => {
    writeJSON(MINIMAP_KEY, minimap);
  });

  let width = $state(0);
  // 768 与 Navbar 桌面行（md:flex）断点对齐——此前 640–768 灰区两处皆不
  // 渲染，插件/分享/历史在该区间完全不可达（窄视口 e2e 发现）
  let isMobile = $derived(width < 768);
  let isViewMode = $state(true);

  // 拖拽文件进工作区直接打开（与「打开」按钮同走 loadFileIntoEditor：
  // 插件导入钩子优先、输入转换管道、配置安全门）。挂在 window 而非容器
  // div——① 容器是静态元素，元素级 drag 事件触发 a11y 警告而键盘等价路径
  // 本就在「打开」按钮；② 漏拖（drop 未命中任何目标）浏览器默认会导航
  // 走丢现场，window 级 preventDefault 一并堵掉。enter/leave 计数器防
  // 子元素间移动时高亮抖动。
  let dragDepth = $state(0);
  const onDropFile = async (file: File) => {
    const [text, bytes] = await Promise.all([file.text(), file.arrayBuffer()]);
    await loadFileIntoEditor({ bytes: new Uint8Array(bytes), name: file.name, text });
  };
  onMount(() => {
    const onDragEnter = (event: DragEvent) => {
      event.preventDefault();
      dragDepth += 1;
    };
    const onDragOver = (event: DragEvent) => event.preventDefault();
    const onDragLeave = () => {
      dragDepth = Math.max(0, dragDepth - 1);
    };
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      dragDepth = 0;
      const file = event.dataTransfer?.files?.[0];
      if (file) {
        void onDropFile(file);
      }
    };
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  });
  // 移动端开启「可视化」时自动翻到预览半屏：画布挂在右半屏，用户在代码
  // 半屏点开关若无翻页则「点了没反应」。只跟随 visualMode 的上升沿
  // （untrack 摘掉 isMobile/isViewMode 依赖），用户随后翻回代码半屏不被拽回。
  $effect(() => {
    const entering = visualMode;
    untrack(() => {
      if (entering && isMobile && !isViewMode) {
        isViewMode = true;
      }
    });
  });
  // 编辑器组件引用：「插入片段」菜单经其门面方法进入双端编辑器。
  let editorComp: { insertAtCursor?: (text: string) => void } | undefined = $state();

  // Record the Timeline for the whole session, not just while the panel is open.
  onMount(() => startAutoSave());

  // Ctrl+S 把当前状态收藏进历史「已保存」（浏览器默认的保存网页被拦截）。
  onMount(() => {
    const onKeydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (addManualEntry($state.snapshot(inputState))) {
          notify('已收藏到历史「已保存」');
        } else {
          notify('该状态已保存过。');
        }
      }
    };
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  });

  let isHistoryOpen = $state(false);
  let pluginManagerOpen = $state(false);
  let pluginFrontend = $state<undefined | { id: string; sandbox?: string; url: string }>(undefined);

  // Plugins load before init so the URL-share input pipeline (source 'url')
  // and bridge handlers see installed plugins on first entry.
  onMount(() => {
    installEditorApi();
    installBridgeInvoker();
    startBridge();
    void loadRegistry().then(() => initHandler());
  });

  let editorPane: Resizable.Pane | undefined;
  $effect(() => {
    if (isMobile) {
      editorPane?.resize(50);
    }
  });
</script>

<div class="flex h-full flex-col overflow-hidden">
  {#snippet viewPane()}
    <View {panZoomState} shouldShowGrid={validatedState.current.grid} />
    <div class="absolute top-0 right-0">
      <PanZoomToolbar {panZoomState} fullScreenHref={urls.current.view} />
    </div>
    <div class="absolute right-0 bottom-0"><VersionSecurityToolbar /></div>
    <div class="absolute bottom-0 left-0 sm:left-5"><SyncRoughToolbar /></div>
  {/snippet}

  {#snippet mobileToggle()}
    <div class="flex items-center gap-2">
      编辑 <Switch
        id="editorMode"
        class="data-[state=checked]:bg-accent"
        bind:checked={isViewMode} /> 预览
    </div>
  {/snippet}

  {#if !pluginFrontend}
    <!-- 插件前端激活时导航栏必须卸载：它是根 flex 容器的 flex item，z-50 直接
         生效，会压在全屏前端覆盖层（z-40）之上拦截顶部条带的点击。 -->
    <Navbar mobileToggle={isMobile ? mobileToggle : undefined}>
      <Toggle bind:pressed={isHistoryOpen} size="sm" title="历史记录" aria-label="历史记录">
        <HistoryIcon />
      </Toggle>
      <Toggle
        bind:pressed={visualMode}
        size="sm"
        data-testid={TID.visualTab}
        title="可视化编辑"
        aria-label="可视化编辑">
        <EditIcon />
        可视化
      </Toggle>
      <Button
        size="sm"
        variant="outline"
        data-testid={TID.pluginManagerOpen}
        title="插件管理"
        onclick={() => (pluginManagerOpen = true)}>
        <PluginIcon />
        插件
      </Button>
      <!-- 明暗一键切换：主菜单里也有，但深埋一层——高频操作给直达钮 -->
      <Button
        size="sm"
        variant="ghost"
        class="px-2"
        data-testid="theme-toggle"
        title={mode.current === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
        aria-label="切换明暗主题"
        aria-pressed={mode.current === 'dark'}
        onclick={() => setMode(mode.current === 'dark' ? 'light' : 'dark')}>
        {#if mode.current === 'dark'}
          <LightModeIcon />
        {:else}
          <DarkModeIcon />
        {/if}
      </Button>
      <Share />
    </Navbar>
  {/if}

  <div
    class={[
      'relative flex flex-1 flex-col overflow-hidden',
      dragDepth > 0 && 'ring-2 ring-inset ring-primary'
    ]}
    bind:clientWidth={width}
    data-testid="edit-workspace">
    <div
      class={[
        'size-full',
        isMobile && ['w-[200%] duration-300', isViewMode && '-translate-x-1/2']
      ]}>
      <Resizable.PaneGroup
        direction="horizontal"
        autoSaveId="liveEditor"
        class="gap-4 p-2 pt-0 sm:gap-0 sm:p-6 sm:pt-0">
        <Resizable.Pane bind:this={editorPane} defaultSize={30} minSize={15}>
          <div class="flex h-full flex-col gap-4 sm:gap-6">
            <Card
              onselect={tabSelectHandler}
              isOpen
              tabs={editorTabs}
              activeTabID={validatedState.current.editorMode}
              isClosable={false}>
              {#snippet actions()}
                <Toggle
                  bind:pressed={wordWrap}
                  size="sm"
                  data-testid="editor-word-wrap"
                  title="自动换行"
                  aria-label="自动换行">
                  <WrapTextIcon />
                </Toggle>
                <FontSizeMenu
                  size={editorFontSize.current}
                  onSizeChange={(next) => (editorFontSize.current = next)} />
                <Toggle
                  bind:pressed={minimap}
                  size="sm"
                  class="hidden sm:inline-flex"
                  data-testid="editor-minimap"
                  title="小地图（长代码导航）"
                  aria-label="小地图">
                  <MinimapIcon />
                </Toggle>
                {#if validatedState.current.editorMode === 'config'}
                  <ConfigPresets />
                {:else}
                  <InsertSnippets onInsert={(text) => editorComp?.insertAtCursor?.(text)} />
                {/if}
              {/snippet}
              <Editor
                {isMobile}
                {wordWrap}
                fontSize={editorFontSize.current}
                {minimap}
                bind:this={editorComp} />
            </Card>

            <div class="group flex flex-wrap justify-between gap-4 sm:gap-6">
              <Preset />
              <Actions />
            </div>
          </div>
        </Resizable.Pane>
        <Resizable.Handle class="mr-1 hidden opacity-0 sm:block" />
        <Resizable.Pane minSize={15} class="relative flex h-full flex-1 flex-col overflow-hidden">
          {#if visualMode}
            <div class="flex h-full min-h-0 w-full">
              <div class="min-h-0 min-w-0 flex-1">
                <VisualEditor
                  active={visualMode}
                  compareOpen={visualCompare}
                  onToggleCompare={() => (visualCompare = !visualCompare)} />
              </div>
              {#if visualCompare}
                <div
                  class="relative hidden min-h-0 min-w-0 flex-1 flex-col border-l sm:flex"
                  data-testid={TID.visualPreview}>
                  <div class="flex-none border-b px-2 py-1 text-xs text-muted-foreground">
                    预览（Mermaid 渲染）
                  </div>
                  <div class="relative min-h-0 flex-1 overflow-hidden">
                    {@render viewPane()}
                  </div>
                </div>
              {/if}
            </div>
          {:else}
            {@render viewPane()}
          {/if}
        </Resizable.Pane>
        {#if isHistoryOpen && !isMobile}
          <Resizable.Handle class="ml-1 hidden opacity-0 sm:block" />
          <Resizable.Pane minSize={15} defaultSize={30} class="hidden h-full grow flex-col sm:flex">
            <History />
          </Resizable.Pane>
        {/if}
      </Resizable.PaneGroup>
    </div>
    {#if isHistoryOpen && isMobile}
      <!-- The swipe layout has no room for a third column; below sm the pane
           used to mount invisibly (hidden sm:flex) while its toggle showed
           pressed — the panel now takes over the workspace instead. -->
      <div class="absolute inset-0 z-30 flex flex-col bg-background p-2">
        <!-- 全屏接管时显式返回路径：导航栏开关对新用户不够可见 -->
        <Button
          size="sm"
          variant="outline"
          class="absolute top-3 right-3 z-10 bg-background/90"
          data-testid="history-mobile-close"
          title="返回编辑"
          onclick={() => (isHistoryOpen = false)}>
          <BackIcon />
          返回
        </Button>
        <History />
      </div>
    {/if}
  </div>

  {#if pluginFrontend}
    <!-- Full-screen overlay: the plugin page completely replaces the UI. -->
    <div class="absolute inset-0 z-40 overflow-hidden">
      <iframe
        title="插件前端"
        src={pluginFrontend.url}
        class="h-full w-full border-0"
        sandbox={pluginFrontend.sandbox ??
          'allow-scripts allow-same-origin allow-forms allow-popups'}></iframe>
    </div>
    <Button
      size="sm"
      variant="outline"
      class="fixed top-2 right-2 z-50"
      data-testid={TID.pluginFrontendExit}
      onclick={() => (pluginFrontend = undefined)}>
      退出插件前端
    </Button>
  {/if}

  <PluginManager
    bind:open={pluginManagerOpen}
    onFrontendSelect={(frontend) => {
      pluginManagerOpen = false;
      pluginFrontend = frontend;
    }} />
</div>
