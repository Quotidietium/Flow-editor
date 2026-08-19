<script lang="ts">
  import Card from '$lib/components/Card/Card.svelte';
  import type { HistoryEntry, HistoryType, State, Tab } from '$lib/types';
  import { notify, prompt } from '$lib/util/notify';
  import { serializeState } from '$lib/util/serde';
  import { inputState, replaceInputState } from '$lib/util/state.svelte';
  import dayjs from 'dayjs';
  import dayjsRelativeTime from 'dayjs/plugin/relativeTime';
  import BookmarkIcon from '~icons/material-symbols/bookmark-outline-rounded';
  import TrashAltIcon from '~icons/material-symbols/delete-outline-rounded';
  import DownloadIcon from '~icons/material-symbols/download-rounded';
  import EditIcon from '~icons/material-symbols/edit-outline-rounded';
  import SaveIcon from '~icons/material-symbols/save-outline-rounded';
  import UndoIcon from '~icons/material-symbols/settings-backup-restore-rounded';
  import UploadIcon from '~icons/material-symbols/upload-rounded';
  import HistoryIcon from '~icons/mdi/clock-outline';
  import GitAltIcon from '~icons/mdi/git';
  import OpenInNewIcon from '~icons/material-symbols/open-in-new-rounded';
  import { Button } from '../ui/button';
  import { Separator } from '../ui/separator';
  import {
    addManualEntry,
    clearActive,
    historyState,
    removeEntry,
    renameEntry,
    restoreEntries,
    setMode
  } from './historyState.svelte';

  dayjs.extend(dayjsRelativeTime);

  const baseTabs: Tab[] = [
    { id: 'manual', title: '已保存', icon: BookmarkIcon },
    { id: 'auto', title: '时间线', icon: HistoryIcon }
  ];
  const loaderTab: Tab = { id: 'loader', title: '修订版本', icon: GitAltIcon };

  const tabs = $derived(
    historyState.loaderEntries.length > 0 ? [loaderTab, ...baseTabs] : baseTabs
  );

  // Surface revisions once when they first appear; the user can switch away after.
  let revisionsShown = false;
  $effect(() => {
    if (historyState.loaderEntries.length > 0 && !revisionsShown) {
      revisionsShown = true;
      setMode('loader');
    }
  });

  // Inline rename state for a single entry.
  let editingId: string | null = $state(null);
  let editValue = $state('');

  const commitRename = () => {
    if (editingId !== null && editValue.trim()) {
      renameEntry(editingId, editValue);
    }
    editingId = null;
  };

  const emptyMessage = $derived(
    historyState.mode === 'auto'
      ? '暂无时间线快照。\n时间线每分钟自动保存一次。'
      : '暂无已保存状态。\n点击保存按钮收藏当前图表，稍后可随时恢复。'
  );

  const tabSelectHandler = (tab: Tab) => {
    setMode(tab.id as HistoryType);
  };

  const downloadHistory = () => {
    const data = historyState.entries;
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mermaid-history-${dayjs().format('YYYY-MM-DD-HHmmss')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const uploadHistory = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.addEventListener('change', async ({ target }: Event) => {
      const file = (target as HTMLInputElement)?.files?.[0];
      if (!file) {
        return;
      }
      const data: HistoryEntry[] = JSON.parse(await file.text());
      const { restored, invalid, duplicates } = restoreEntries(data);
      notify(`已恢复 ${restored} 条，重复 ${duplicates} 条，无效 ${invalid} 条。`);
    });
    input.click();
  };

  const saveHistory = () => {
    if (!addManualEntry($state.snapshot(inputState))) {
      notify('该状态已保存过。');
    }
  };

  const clearAll = () => {
    if (prompt('确定清空全部已保存项目？')) {
      clearActive();
    }
  };

  const restoreHistoryItem = (state: State): void => {
    replaceInputState({ ...state, updateDiagram: true });
  };

  // Absolute editor URL for an entry, so the link can be opened in a new tab or copied.
  const entryUrl = (state: State): string =>
    `${window.location.origin}${window.location.pathname}#${serializeState(state)}`;

  // Serialize each entry's URL once per change rather than per row on every render.
  const entriesWithUrl = $derived(
    historyState.entries.map((entry) => ({ ...entry, openUrl: entryUrl(entry.state) }))
  );
</script>

<Card onselect={tabSelectHandler} isOpen isClosable={false} {tabs} activeTabID={historyState.mode}>
  {#snippet actions()}
    <div class="flex items-center gap-2">
      <Button
        size="icon"
        variant="ghost"
        id="uploadHistory"
        onclick={uploadHistory}
        title="导入历史"><UploadIcon /></Button>
      {#if historyState.entries.length > 0}
        <Button
          id="downloadHistory"
          size="icon"
          variant="ghost"
          onclick={downloadHistory}
          title="导出历史"><DownloadIcon /></Button>
      {/if}
      <Separator orientation="vertical" />
      <Button
        id="saveHistory"
        size="icon"
        variant="ghost"
        onclick={saveHistory}
        title="保存当前状态"><SaveIcon /></Button>
      {#if historyState.mode !== 'loader'}
        <Button
          id="clearHistory"
          size="icon"
          variant="ghost"
          class="hover:text-destructive"
          onclick={clearAll}
          title="清空全部已保存状态"><TrashAltIcon /></Button>
      {/if}
    </div>
  {/snippet}
  <ul class="flex h-full flex-col gap-2 overflow-auto p-2" id="historyList">
    {#if entriesWithUrl.length > 0}
      {#each entriesWithUrl as { id, state, time, name, url, type, openUrl } (id)}
        <li class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <div class="flex min-w-0 flex-1 flex-col">
              <div class="flex min-w-0 items-center gap-1 overflow-hidden">
                {#if url}
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener"
                    title="在新标签页打开修订版本"
                    class="min-w-0 truncate text-blue-500 hover:underline">{name}</a>
                {:else if editingId === id}
                  <input
                    class="min-w-0 flex-1 rounded border px-1 text-sm"
                    bind:value={editValue}
                    aria-label="重命名条目"
                    onkeydown={(event) => {
                      if (event.key === 'Enter') {
                        commitRename();
                      } else if (event.key === 'Escape') {
                        editingId = null;
                      }
                    }}
                    onblur={commitRename} />
                {:else}
                  <span class="min-w-0 truncate" title={name}>{name}</span>
                  {#if type !== 'loader'}
                    <button
                      type="button"
                      class="shrink-0 opacity-50 hover:opacity-100"
                      title="重命名"
                      onclick={() => {
                        editingId = id;
                        editValue = name ?? '';
                      }}>
                      <EditIcon class="size-3.5" />
                    </button>
                  {/if}
                {/if}
              </div>
              <span class="text-xs whitespace-nowrap text-primary-foreground/30">
                {new Date(time).toLocaleString()}
              </span>
            </div>

            <div class="flex items-center gap-2">
              <span class="text-sm whitespace-nowrap text-primary-foreground/50">
                {dayjs(time).fromNow()}
              </span>
              <Button
                href={openUrl}
                target="_blank"
                rel="noopener"
                size="icon"
                variant="ghost"
                title="在新标签页打开">
                <OpenInNewIcon />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                title="恢复此版本"
                onclick={() => restoreHistoryItem(state)}>
                <UndoIcon />
              </Button>
              {#if type !== 'loader'}
                <Button
                  size="icon"
                  variant="ghost"
                  class="hover:text-destructive"
                  title="删除此版本"
                  onclick={() => removeEntry(id)}>
                  <TrashAltIcon />
                </Button>
              {/if}
            </div>
          </div>
          <Separator />
        </li>
      {/each}
    {:else}
      <div class="m-2 text-center whitespace-pre-line">{emptyMessage}</div>
    {/if}
  </ul>
</Card>
