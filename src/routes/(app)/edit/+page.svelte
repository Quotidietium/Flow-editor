<script lang="ts">
  import Actions from '$/components/Actions.svelte';
  import Card from '$/components/Card/Card.svelte';
  import ConfigPresets from '$/components/ConfigPresets.svelte';
  import Editor from '$/components/Editor.svelte';
  import History from '$/components/History/History.svelte';
  import { startAutoSave } from '$/components/History/historyState.svelte';
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
  import { validatedState, updateCodeStore, urls } from '$/util/state.svelte';
  import { initHandler } from '$/util/util';
  import { onMount } from 'svelte';
  import CodeIcon from '~icons/custom/code';
  import HistoryIcon from '~icons/material-symbols/history';
  import EditIcon from '~icons/material-symbols/edit-note-rounded';
  import GearIcon from '~icons/material-symbols/settings-outline-rounded';
  import PluginIcon from '~icons/material-symbols/extension-rounded';

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

  let width = $state(0);
  // 768 与 Navbar 桌面行（md:flex）断点对齐——此前 640–768 灰区两处皆不
  // 渲染，插件/分享/历史在该区间完全不可达（窄视口 e2e 发现）
  let isMobile = $derived(width < 768);
  let isViewMode = $state(true);

  // Record the Timeline for the whole session, not just while the panel is open.
  onMount(() => startAutoSave());

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
      <Share />
    </Navbar>
  {/if}

  <div class="relative flex flex-1 flex-col overflow-hidden" bind:clientWidth={width}>
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
                {#if validatedState.current.editorMode === 'config'}
                  <ConfigPresets />
                {/if}
              {/snippet}
              <Editor {isMobile} />
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
