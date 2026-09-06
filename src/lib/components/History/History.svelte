<script lang="ts">
  import Card from '$lib/components/Card/Card.svelte';
  import type { HistoryEntry, HistoryType, State, Tab } from '$lib/types';
  import { diffLines, diffToText } from '$lib/util/lineDiff';
  import { notify, prompt } from '$lib/util/notify';
  import { serializeState } from '$lib/util/serde';
  import { inputState, replaceInputState } from '$lib/util/state.svelte';
  import { codePreview } from '$/util/codePreview';
  import { detectDiagramKind, KIND_SPECS } from '$lib/util/visualEditor/model';
  import dayjs from 'dayjs';
  import dayjsRelativeTime from 'dayjs/plugin/relativeTime';
  import BookmarkIcon from '~icons/material-symbols/bookmark-outline-rounded';
  import BookmarkAddIcon from '~icons/material-symbols/bookmark-add-outline-rounded';
  import CloseIcon from '~icons/material-symbols/close-rounded';
  import DifferenceIcon from '~icons/material-symbols/difference-rounded';
  import LinkIcon from '~icons/material-symbols/link-rounded';
  import SwapIcon from '~icons/material-symbols/swap-horiz-rounded';
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
  import * as Dialog from '$/components/ui/dialog';
  import { Input } from '../ui/input';
  import { Separator } from '../ui/separator';
  import {
    addManualEntry,
    clearActive,
    historyCounts,
    historyState,
    removeEntry,
    renameEntry,
    restoreEntries,
    setMode
  } from './historyState.svelte';

  dayjs.extend(dayjsRelativeTime);

  const baseTabs: Tab[] = $derived([
    { id: 'manual', title: `已保存 (${historyCounts.manual})`, icon: BookmarkIcon },
    { id: 'auto', title: `时间线 (${historyCounts.auto})`, icon: HistoryIcon }
  ]);
  const loaderTab: Tab = $derived({
    id: 'loader',
    title: `修订版本 (${historyState.loaderEntries.length})`,
    icon: GitAltIcon
  });

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
      // Uploaded files are untrusted input: cap the size (a giant blob would
      // block the main thread in JSON.parse) and surface parse failures —
      // an unhandled rejection here would silently do nothing.
      if (file.size > 5 * 1024 * 1024) {
        notify('文件过大（上限 5MB）');
        return;
      }
      let data: unknown;
      try {
        data = JSON.parse(await file.text());
      } catch {
        notify('无法解析该文件（需为历史记录导出的 JSON）');
        return;
      }
      if (!Array.isArray(data)) {
        notify('文件格式不正确（需为历史记录导出的 JSON 数组）');
        return;
      }
      const { restored, invalid, duplicates } = restoreEntries(data as HistoryEntry[]);
      notify(`已恢复 ${restored} 条，重复 ${duplicates} 条，无效 ${invalid} 条。`);
    });
    input.click();
  };

  const saveHistory = () => {
    if (!addManualEntry($state.snapshot(inputState))) {
      notify('该状态已保存过。');
    }
  };

  // 时间线条目收藏到「已保存」：保留原名称，去重语义与手动保存一致。
  const bookmarkEntry = (state: State, name?: string) => {
    if (addManualEntry($state.snapshot(state), name)) {
      notify('已收藏到「已保存」。');
    } else {
      notify('该状态已在「已保存」中。');
    }
  };

  const clearAll = () => {
    // 清空作用于「当前标签页」的存储（clearActive）：时间线页清自动条目、
    // 已保存页清手动条目——确认文案按页分流，此前两页都写「已保存」。
    const onTimeline = historyState.mode === 'auto';
    if (prompt(onTimeline ? '确定清空时间线全部条目？' : '确定清空全部已保存项目？')) {
      clearActive();
    }
  };

  const restoreHistoryItem = (state: State, name?: string): void => {
    replaceInputState({ ...state, updateDiagram: true });
    // 恢复是静默的全量替换：toast 给出明确反馈（尤其对比模式/窄屏下
    // 用户不一定立刻注意到画布已换）
    notify(`已恢复「${name ?? '该版本'}」。`);
  };

  // 分享某历史版本的最短路径：链接已由 entriesWithUrl 序列化好，
  // 免「新标签打开 → 复制地址栏」两跳。
  const copyEntryLink = async (url: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url);
      notify('已复制该版本的分享链接');
    } catch {
      notify('复制失败');
    }
  };

  // Absolute editor URL for an entry, so the link can be opened in a new tab or copied.
  const entryUrl = (state: State): string =>
    `${window.location.origin}${window.location.pathname}#${serializeState(state)}`;

  // Serialize each entry's URL once per change rather than per row on every render.
  // 类型徽章复用可视化模型的首行探测（frontmatter/注释跳过）与本地化类型名。
  const kindLabelOf = (code: string): string | undefined => {
    const kind = detectDiagramKind(code);
    return kind ? KIND_SPECS[kind]?.label : undefined;
  };
  const entriesWithUrl = $derived(
    historyState.entries.map((entry) => ({
      ...entry,
      // 悬停速览：自动条目名是随机 slug、手动条目也可能同名——title 里放
      // 压缩后的代码开头（共享 codePreview，与我的示例按钮同款）
      codePreview: codePreview(entry.state.code),
      kindLabel: kindLabelOf(entry.state.code),
      openUrl: entryUrl(entry.state)
    }))
  );

  // 搜索过滤：默认名是随机英文 slug，只按名称搜等于没得搜——同时匹配
  // 图表代码内容（中文标签、节点 id），大小写不敏感。
  let searchQuery = $state('');

  // ↑/↓ 在条目间移动焦点（循环 141）：列表动辄几十条、每条 4-6 个
  // 按钮，纯 Tab 穿越要上百次。焦点落在条目主入口（名称）之间，
  // Enter/Space 进入重命名、其他按钮仍可 Tab 内聚访问。
  let listEl: HTMLUListElement | undefined = $state();
  const onListKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }
    const rows = Array.from(listEl?.querySelectorAll('[data-history-entry]') ?? []);
    const current = rows.indexOf(document.activeElement as HTMLElement);
    if (current === -1) {
      return;
    }
    const next = (event.key === 'ArrowDown' ? rows[current + 1] : rows[current - 1]) as
      HTMLElement | undefined;
    if (next) {
      event.preventDefault();
      next.focus();
    }
  };
  const filteredEntries = $derived.by(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return entriesWithUrl;
    }
    return entriesWithUrl.filter(
      (entry) =>
        (entry.name ?? '').toLowerCase().includes(query) ||
        entry.state.code.toLowerCase().includes(query)
    );
  });

  // 「与当前对比」→「版本对比」（循环 128/132）：行级 LCS 对比（无依赖
  // diff，util/lineDiff）。左右双槽皆可选本页签任意版本（'' = 当前编辑
  // 器），可对调方向；左侧为历史条目时可在对话框内一键恢复。对比的是
  // 代码——配置 JSON 不入对比（差异预览在配置模板菜单另有其责）。
  const MAX_DIFF_ROWS = 400;
  interface DiffCandidate {
    code: string;
    id: string; // '' = 当前编辑器
    name: string;
  }
  let diffOpen = $state(false);
  let diffLeftId = $state('');
  let diffRightId = $state('');
  const openDiff = (id: string): void => {
    diffLeftId = id;
    diffRightId = '';
    diffOpen = true;
  };
  const closeDiff = (): void => {
    diffOpen = false;
    diffLeftId = '';
    diffRightId = '';
  };
  // 循环 132：反过来看差异（「A → B」改读「B → A」）一键完成
  const swapDiff = (): void => {
    [diffLeftId, diffRightId] = [diffRightId, diffLeftId];
  };
  const diffCandidates = $derived.by<DiffCandidate[]>(() => {
    if (!diffOpen) {
      return [];
    }
    return [
      { code: inputState.code, id: '', name: '当前编辑器' },
      ...historyState.entries.map((entry) => ({
        code: entry.state.code,
        id: entry.id,
        name: entry.name ?? '该版本'
      }))
    ];
  });
  // 条目在对话框打开期间被删除时回退到首项（当前编辑器）
  const candidateById = (id: string): DiffCandidate | undefined =>
    diffCandidates.find((candidate) => candidate.id === id) ?? diffCandidates[0];
  const diffLeft = $derived(candidateById(diffLeftId));
  const diffRight = $derived(candidateById(diffRightId));
  const diffRows = $derived(diffLines(diffLeft?.code ?? '', diffRight?.code ?? ''));
  // 左侧是历史条目时才可直达恢复（当前编辑器无可恢复对象）
  const diffLeftEntry = $derived(historyState.entries.find((entry) => entry.id === diffLeftId));
  const restoreDiffLeft = (): void => {
    if (!diffLeftEntry) {
      return;
    }
    restoreHistoryItem(diffLeftEntry.state, diffLeftEntry.name);
    closeDiff();
  };
  const diffStats = $derived.by(() => {
    let added = 0;
    let removed = 0;
    for (const row of diffRows) {
      if (row.type === 'add') {
        added += 1;
      } else if (row.type === 'del') {
        removed += 1;
      }
    }
    return { added, removed };
  });

  // 行内复制（循环 135）：对比时「这一版不错，发我」的最短路径——
  // 免关闭对话框回编辑器手选复制。
  const copyDiffCode = async (
    side: '左' | '右',
    candidate: DiffCandidate | undefined
  ): Promise<void> => {
    if (!candidate) {
      return;
    }
    try {
      await navigator.clipboard.writeText(candidate.code);
      notify(`已复制${side}版代码`);
    } catch {
      notify('复制失败');
    }
  };

  // 复制差异行（unified 风格片段，diffToText）——贴进 issue / 聊天
  // 说明「改了什么」；无差异时按钮禁用。
  const copyDiffText = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(diffToText(diffRows));
      notify('已复制差异行');
    } catch {
      notify('复制失败');
    }
  };
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
          title={historyState.mode === 'auto' ? '清空时间线全部条目' : '清空全部已保存状态'}
          ><TrashAltIcon /></Button>
      {/if}
    </div>
  {/snippet}
  {#if entriesWithUrl.length > 0}
    <div class="flex flex-none items-center gap-1 px-2 pt-2">
      <Input
        type="search"
        class="h-8"
        placeholder="搜索名称或图表内容…"
        aria-label="搜索历史"
        data-testid="history-search"
        bind:value={searchQuery}
        onkeydown={(event) => {
          if (event.key === 'Escape') {
            searchQuery = '';
          }
        }} />
      {#if searchQuery}
        <Button
          size="icon"
          variant="ghost"
          title="清空搜索"
          aria-label="清空搜索"
          onclick={() => (searchQuery = '')}>
          <CloseIcon />
        </Button>
      {/if}
    </div>
  {/if}
  <!-- 键盘委托在 ul 上：a11y 告警豁免——监听的是方向键导航（列表
       本身非交互目标，焦点仍在条目内），行为等价 listbox 的 roving 模式 -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <ul
    class="flex h-full flex-col gap-2 overflow-auto p-2"
    id="historyList"
    bind:this={listEl}
    onkeydown={onListKeydown}>
    {#if filteredEntries.length > 0}
      {#each filteredEntries as { id, state, time, name, url, type, kindLabel, openUrl, codePreview } (id)}
        <li class="flex flex-col gap-2">
          <!-- 循环 138：小屏（<sm）名称块与按钮组分两行——6 个图标按钮
               加 nowrap 时间戳在 390px 内互相挤压（按钮组被列表裁剪）；
               sm 及以上保持原单行。 -->
          <div
            class="flex items-center justify-between max-sm:flex-col max-sm:items-stretch max-sm:gap-2">
            <div class="flex min-w-0 flex-1 flex-col">
              <div class="flex min-w-0 items-center gap-1 overflow-hidden">
                {#if url}
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener"
                    title="在新标签页打开修订版本"
                    data-history-entry
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
                  <!-- 名称自身即重命名入口（双击/回车/空格——MC 树行同款全键盘
                       可达模式；铅笔按钮保留为视觉发现路径） -->
                  <span
                    class="min-w-0 cursor-pointer truncate"
                    role="button"
                    tabindex="0"
                    data-history-entry
                    title="{name} · {codePreview}"
                    ondblclick={() => {
                      editingId = id;
                      editValue = name ?? '';
                    }}
                    onkeydown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        editingId = id;
                        editValue = name ?? '';
                      }
                    }}>
                    {name}
                  </span>
                  {#if kindLabel}
                    <span
                      class="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground"
                      data-testid="history-kind-badge">
                      {kindLabel}
                    </span>
                  {/if}
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

            <div class="flex items-center justify-end gap-1 sm:gap-2">
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
                title="复制该版本的分享链接"
                aria-label="复制该版本的分享链接"
                onclick={() => void copyEntryLink(openUrl)}>
                <LinkIcon />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                title="与当前对比"
                aria-label="与当前对比"
                onclick={() => openDiff(id)}>
                <DifferenceIcon />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                title="恢复此版本"
                onclick={() => restoreHistoryItem(state, name)}>
                <UndoIcon />
              </Button>
              {#if type === 'auto'}
                <!-- 时间线只留 30 条且先进先出：重要版本一键收进「已保存」（200 条槽位） -->
                <Button
                  size="icon"
                  variant="ghost"
                  title="收藏到「已保存」"
                  onclick={() => bookmarkEntry(state, name)}>
                  <BookmarkAddIcon />
                </Button>
              {/if}
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
    {:else if entriesWithUrl.length > 0}
      <div class="m-2 text-center whitespace-pre-line">
        没有匹配「{searchQuery.trim()}」的条目。
      </div>
    {:else}
      <div class="m-2 flex flex-col items-center gap-2 text-center whitespace-pre-line">
        <span>{emptyMessage}</span>
        {#if historyState.mode === 'manual'}
          <!-- 空态即引导：新用户的第一条收藏零查找成本 -->
          <Button
            size="sm"
            variant="outline"
            data-testid="history-empty-save"
            onclick={saveHistory}>
            <SaveIcon />
            立即收藏当前图表
          </Button>
        {/if}
      </div>
    {/if}
  </ul>
  {#if historyState.mode === 'auto' && entriesWithUrl.length > 0}
    <!-- FIFO 规则进 UI：时间线只留 30 条且先进先出——不知道这条规则，
         用户会以为旧版本「丢了」；指引重要版本收进「已保存」（200 槽位）。
         放 ul 外：li 伪元素会撞 '#historyList li' 的计数断言（循环77 实证） -->
    <div
      class="border-t px-2 py-1.5 text-center text-[11px] text-muted-foreground"
      data-testid="history-fifo-hint">
      时间线自动保留最近 30 条（先进先出）；重要版本请收藏到「已保存」（可存 200 条）
    </div>
  {/if}
</Card>

<Dialog.Root
  open={diffOpen}
  onOpenChange={(open) => {
    if (!open) {
      closeDiff();
    }
  }}>
  <Dialog.Content class="max-w-xl" data-testid="history-diff-dialog">
    <Dialog.Header>
      <Dialog.Title>版本对比：{diffLeft?.name} → {diffRight?.name}</Dialog.Title>
      <Dialog.Description>
        行级对比（增 = 右侧新增，删 = 左侧独有）：
        <span class="text-green-600">增 {diffStats.added}</span>
        · <span class="text-red-600">删 {diffStats.removed}</span>（仅对比图表代码）
      </Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-wrap items-center gap-2 pb-1 text-xs">
      <label class="text-muted-foreground" for="history-diff-target">对比对象</label>
      <select
        id="history-diff-target"
        class="h-7 rounded border bg-background px-1"
        data-testid="history-diff-target"
        bind:value={diffRightId}>
        {#each diffCandidates as candidate (candidate.id)}
          <option value={candidate.id}>{candidate.name}</option>
        {/each}
      </select>
      <Button
        size="sm"
        variant="ghost"
        class="h-7 px-1.5"
        data-testid="history-diff-swap"
        title="对调对比方向"
        onclick={swapDiff}>
        <SwapIcon class="size-3.5" />
        对调
      </Button>
      {#if diffLeftEntry}
        <!-- 对比中发现要的就是旧版：免关闭对话框回列表找条目 -->
        <Button
          size="sm"
          variant="outline"
          class="h-7 px-1.5"
          data-testid="history-diff-restore"
          title="恢复左侧版本到编辑器"
          onclick={restoreDiffLeft}>
          <UndoIcon class="size-3.5" />
          恢复左侧版本
        </Button>
      {/if}
    </div>
    <div
      class="max-h-[55vh] overflow-auto rounded border bg-muted/40 p-2 font-mono text-xs"
      data-testid="history-diff-rows">
      <!-- 双行号列（循环 144）：旧文件 | 新文件 1-based 行号，定位「改了
           第几行」；add 行无旧号、del 行无新号，留空。 -->
      {#each diffRows.slice(0, MAX_DIFF_ROWS) as row, index (index)}
        <div
          class="flex gap-2 whitespace-pre"
          title="{row.oldLine === undefined ? '' : `旧行 ${row.oldLine}`}{row.oldLine !==
            undefined && row.newLine !== undefined
            ? ' · '
            : ''}{row.newLine === undefined ? '' : `新行 ${row.newLine}`}">
          <span
            class="w-9 shrink-0 text-right text-muted-foreground/50 tabular-nums"
            data-testid="history-diff-old-line">{row.oldLine ?? ''}</span>
          <span
            class="w-9 shrink-0 text-right text-muted-foreground/50 tabular-nums"
            data-testid="history-diff-new-line">{row.newLine ?? ''}</span>
          <span
            class="w-3 shrink-0 text-center {row.type === 'add'
              ? 'text-green-600'
              : row.type === 'del'
                ? 'text-red-600'
                : 'text-transparent'}"
            >{row.type === 'add' ? '+' : row.type === 'del' ? '−' : ' '}</span>
          <span class="min-w-0 break-all {row.type === 'same' && 'text-muted-foreground'}"
            >{row.text === '' ? ' ' : row.text}</span>
        </div>
      {/each}
      {#if diffRows.length > MAX_DIFF_ROWS}
        <div class="pt-1 text-center text-muted-foreground">
          差异过大，仅显示前 {MAX_DIFF_ROWS} 行（统计为全量）
        </div>
      {/if}
    </div>
    <div class="flex items-center justify-end gap-2 pt-2">
      <Button
        size="sm"
        variant="outline"
        data-testid="history-diff-copy-diff"
        disabled={diffStats.added + diffStats.removed === 0}
        title="复制差异行（unified 风格：- 旧行 / + 新行）"
        onclick={() => void copyDiffText()}>
        复制差异
      </Button>
      <Button
        size="sm"
        variant="outline"
        data-testid="history-diff-copy-left"
        onclick={() => void copyDiffCode('左', diffLeft)}>
        复制左版代码
      </Button>
      <Button
        size="sm"
        variant="outline"
        data-testid="history-diff-copy-right"
        onclick={() => void copyDiffCode('右', diffRight)}>
        复制右版代码
      </Button>
    </div>
  </Dialog.Content>
</Dialog.Root>
