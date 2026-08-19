<script lang="ts">
  import Actions from '$/components/Actions.svelte';
  import Card from '$/components/Card/Card.svelte';
  import Editor from '$/components/Editor.svelte';
  import History from '$/components/History/History.svelte';
  import { startAutoSave } from '$/components/History/historyState.svelte';
  import Navbar from '$/components/Navbar.svelte';
  import PanZoomToolbar from '$/components/PanZoomToolbar.svelte';
  import Preset from '$/components/Preset.svelte';
  import Share from '$/components/Share.svelte';
  import SyncRoughToolbar from '$/components/SyncRoughToolbar.svelte';
  import * as Resizable from '$/components/ui/resizable';
  import { Switch } from '$/components/ui/switch';
  import { Toggle } from '$/components/ui/toggle';
  import VersionSecurityToolbar from '$/components/VersionSecurityToolbar.svelte';
  import View from '$/components/View.svelte';
  import VisualEditor from '$/components/VisualEditor.svelte';
  import { TID } from '$/constants';
  import type { EditorMode, Tab } from '$/types';
  import { PanZoomState } from '$/util/panZoom';
  import { validatedState, updateCodeStore, urls } from '$/util/state.svelte';
  import { initHandler } from '$/util/util';
  import { onMount } from 'svelte';
  import CodeIcon from '~icons/custom/code';
  import HistoryIcon from '~icons/material-symbols/history';
  import EditIcon from '~icons/material-symbols/edit-note-rounded';
  import GearIcon from '~icons/material-symbols/settings-outline-rounded';

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

  let width = $state(0);
  let isMobile = $derived(width < 640);
  let isViewMode = $state(true);

  onMount(() => initHandler());

  // Record the Timeline for the whole session, not just while the panel is open.
  onMount(() => startAutoSave());

  let isHistoryOpen = $state(false);

  let editorPane: Resizable.Pane | undefined;
  $effect(() => {
    if (isMobile) {
      editorPane?.resize(50);
    }
  });
</script>

<div class="flex h-full flex-col overflow-hidden">
  {#snippet mobileToggle()}
    <div class="flex items-center gap-2">
      编辑 <Switch
        id="editorMode"
        class="data-[state=checked]:bg-accent"
        bind:checked={isViewMode} /> 预览
    </div>
  {/snippet}

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
    <Share />
  </Navbar>

  <div class="flex flex-1 flex-col overflow-hidden" bind:clientWidth={width}>
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
            <VisualEditor active={visualMode} />
          {:else}
            <View {panZoomState} shouldShowGrid={validatedState.current.grid} />
            <div class="absolute top-0 right-0">
              <PanZoomToolbar {panZoomState} fullScreenHref={urls.current.view} />
            </div>
            <div class="absolute right-0 bottom-0"><VersionSecurityToolbar /></div>
            <div class="absolute bottom-0 left-0 sm:left-5"><SyncRoughToolbar /></div>
          {/if}
        </Resizable.Pane>
        {#if isHistoryOpen}
          <Resizable.Handle class="ml-1 hidden opacity-0 sm:block" />
          <Resizable.Pane minSize={15} defaultSize={30} class="hidden h-full grow flex-col sm:flex">
            <History />
          </Resizable.Pane>
        {/if}
      </Resizable.PaneGroup>
    </div>
  </div>
</div>
