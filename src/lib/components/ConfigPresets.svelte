<script lang="ts">
  import { buttonVariants } from '$/components/ui/button';
  import { onMount } from 'svelte';
  import * as Popover from '$/components/ui/popover';
  import { Separator } from '$/components/ui/separator';
  import { TID } from '$/constants';
  import {
    applyConfigPreset,
    CONFIG_PRESET_GROUPS,
    defaultConfigJson,
    deleteUserPreset,
    diffConfigLeaves,
    formatConfigJson,
    isConfigSubset,
    loadUserPresets,
    saveUserPreset,
    type ConfigPreset,
    type UserPreset
  } from '$/util/configPresets';
  import { notify } from '$/util/notify';
  import { updateConfig, validatedState } from '$/util/state.svelte';
  import { cn } from '$lib/utils';
  import PresetIcon from '~icons/material-symbols/dashboard-customize-outline-rounded';
  import DeleteIcon from '~icons/material-symbols/delete-outline-rounded';
  import EditIcon from '~icons/material-symbols/edit-outline-rounded';

  // 模板按深合并写入：同名标量覆盖、对象递归、数组替换——用户既有的
  // 其它键全部保留；JSON 无法解析时不做任何写入（手头内容优先）。
  const applyPreset = (preset: ConfigPreset) => {
    const next = applyConfigPreset(validatedState.current.mermaid, preset);
    if (next === undefined) {
      notify('当前配置 JSON 无法解析，模板未应用（可先「重置为默认」）');
      return;
    }
    updateConfig(next);
    notify(`已应用模板「${preset.label}」`);
  };

  const formatCurrent = () => {
    const next = formatConfigJson(validatedState.current.mermaid);
    if (next === undefined) {
      notify('当前配置 JSON 无法解析，无法格式化');
      return;
    }
    updateConfig(next);
    notify('已格式化配置 JSON');
  };

  const resetDefault = () => {
    // 菜单路径的重置是对「正在用的配置」的主动覆盖且不可撤销——确认一次
    // （与清空历史同款交互）；错误横幅的直达钮是损坏后的恢复语义，不设卡。
    if (confirm('确定重置为默认配置？当前的全部配置项将被覆盖。')) {
      updateConfig(defaultConfigJson());
      notify('已重置为默认配置');
    }
  };

  /* ---------------- 我的模板（用户自定义，localStorage 持久化） ---------------- */

  // 当前配置（解析失败按空对象）：给「已生效」模板打勾（子集匹配——
  // 配置的每个叶子值都在当前配置中出现即视为生效）。
  const currentConfig = $derived.by((): Record<string, unknown> => {
    try {
      const parsed: unknown = JSON.parse(validatedState.current.mermaid || '{}');
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  });
  const isActive = (preset: ConfigPreset): boolean => isConfigSubset(currentConfig, preset.config);

  let userPresets = $state<UserPreset[]>(loadUserPresets());

  // 资产导入联动：导入直接写 storage，重读本列表（不刷新页面）
  onMount(() => {
    const refresh = () => (userPresets = loadUserPresets());
    window.addEventListener('flow-assets-changed', refresh);
    return () => window.removeEventListener('flow-assets-changed', refresh);
  });
  let saveOpen = $state(false);
  let saveName = $state('');

  const startSave = () => {
    saveName = '';
    saveOpen = true;
  };

  // 保存的是「当前配置的完整快照」：应用时与手头配置深合并，语义与内置模板一致。
  const confirmSave = () => {
    const label = saveName.trim();
    if (!label) {
      notify('请输入模板名称');
      return;
    }
    let current: unknown;
    try {
      current = JSON.parse(validatedState.current.mermaid || '{}');
    } catch {
      notify('当前配置 JSON 无法解析，未保存（可先修正或重置）');
      return;
    }
    if (typeof current !== 'object' || current === null || Array.isArray(current)) {
      notify('当前配置不是对象，未保存');
      return;
    }
    userPresets = saveUserPreset(label, current as Record<string, unknown>);
    saveOpen = false;
    // 保存成功即收菜单（片段菜单同款）：存完多半要回编辑器；基线行为本就
    // 依赖关闭（旧实现靠焦点外溢偶然触发），bind:open 后须显式关门。
    open = false;
    notify(`已保存模板「${label}」`);
  };

  const removeUserPreset = (preset: UserPreset) => {
    userPresets = deleteUserPreset(preset.id);
    notify(`已删除模板「${preset.label}」`);
  };

  // 双击重命名（我的示例/片段同款）：按新名建条（同名覆盖）+删旧条，
  // 配置体原样保留。
  const renameUserPreset = (preset: UserPreset) => {
    const next = prompt('重命名模板', preset.label)?.trim();
    if (!next || next === preset.label) {
      return;
    }
    userPresets = deleteUserPreset(preset.id);
    userPresets = saveUserPreset(next, preset.config);
    notify(`已重命名为「${next}」`);
  };

  /* ---------------- 差异预览：跟随高亮（悬停/聚焦/↑/↓）列出将修改的叶子键 ---------------- */

  // 动作行（格式化/重置）与模板同纳入过滤和键盘导航——键盘路径不用挪手。
  const ACTIONS = [
    { id: 'format', label: '格式化 JSON', run: formatCurrent },
    { id: 'reset', label: '重置为默认', run: resetDefault }
  ];

  /* ---------------- 搜索过滤 + ↑/↓ 导航（片段菜单同款，循环 167/168） ---------------- */

  let open = $state(false);
  let query = $state('');
  let searchEl: HTMLInputElement | undefined = $state();
  const queryLower = $derived(query.trim().toLowerCase());
  const filteredUser = $derived(
    queryLower === ''
      ? userPresets
      : userPresets.filter((preset) => preset.label.toLowerCase().includes(queryLower))
  );
  const filteredGroups = $derived(
    queryLower === ''
      ? CONFIG_PRESET_GROUPS
      : CONFIG_PRESET_GROUPS.map((group) => ({
          items: group.items.filter(
            (preset) =>
              preset.label.toLowerCase().includes(queryLower) ||
              preset.hint.toLowerCase().includes(queryLower) ||
              group.group.toLowerCase().includes(queryLower)
          ),
          group: group.group
        })).filter((group) => group.items.length > 0)
  );
  const filteredActions = $derived(
    queryLower === ''
      ? ACTIONS
      : ACTIONS.filter((action) => action.label.toLowerCase().includes(queryLower))
  );

  // 拍平展示序：我的模板 → 内置模板（按组序）→ 动作行。start = 组首项下标。
  type NavRow =
    | { action: (typeof ACTIONS)[number]; kind: 'action' }
    | { kind: 'preset'; preset: ConfigPreset }
    | { kind: 'user'; preset: UserPreset };
  const groupedRows = $derived.by(() => {
    let start = filteredUser.length;
    return filteredGroups.map((group) => {
      const row = { ...group, start };
      start += group.items.length;
      return row;
    });
  });
  const actionStart = $derived(
    filteredUser.length + filteredGroups.reduce((total, group) => total + group.items.length, 0)
  );
  const flatRows = $derived<NavRow[]>([
    ...filteredUser.map((preset): NavRow => ({ kind: 'user', preset })),
    ...filteredGroups.flatMap((group) =>
      group.items.map((preset): NavRow => ({ kind: 'preset', preset }))
    ),
    ...filteredActions.map((action): NavRow => ({ action, kind: 'action' }))
  ]);

  // 虚拟高亮：manualIndex = 方向键/悬停/聚焦的手动选择；未手动时派生
  // 默认位（有词钉首匹配、空词无高亮）；越界自动回落。
  let manualIndex = $state<number>();
  const activeIndex = $derived(
    manualIndex !== undefined && manualIndex < flatRows.length
      ? manualIndex
      : queryLower !== '' && flatRows.length > 0
        ? 0
        : -1
  );
  const activeRow = $derived(activeIndex >= 0 ? flatRows[activeIndex] : undefined);

  let contentEl: HTMLDivElement | null = $state(null);

  const moveActive = (delta: 1 | -1) => {
    const count = flatRows.length;
    if (count === 0) {
      return;
    }
    const base = activeIndex === -1 ? (delta === 1 ? -1 : 0) : activeIndex;
    manualIndex = (base + delta + count) % count;
    // 键盘导航让高亮项滚入可视区（按 id 直取，不等渲染）。悬停路径不做：
    // 鼠标下的行本就可见，滚动反而在超长菜单里酿成「滚动-悬停」互追。
    contentEl?.querySelector(`#preset-opt-${manualIndex}`)?.scrollIntoView({ block: 'nearest' });
  };

  // 差异预览的数据源 = 高亮行：键盘导航与悬停（悬停同步 manualIndex）
  // 自然归一，不再有「最后悬停」残影——高亮移到动作行时明确无预览。
  const previewPreset = $derived<ConfigPreset | undefined>(
    activeRow?.kind === 'preset'
      ? activeRow.preset
      : activeRow?.kind === 'user'
        ? {
            config: activeRow.preset.config,
            hint: '',
            id: activeRow.preset.id,
            label: activeRow.preset.label
          }
        : undefined
  );
  const previewEntries = $derived(
    previewPreset ? diffConfigLeaves(currentConfig, previewPreset.config) : []
  );
  const changedEntries = $derived(previewEntries.filter((entry) => entry.changed));
  const PREVIEW_MAX_ROWS = 4;

  // Enter 执行高亮行：模板=应用，动作=运行；键盘路径不经 Popover.Close，手动收菜单。
  const runActive = () => {
    if (!activeRow) {
      return;
    }
    if (activeRow.kind === 'preset') {
      applyPreset(activeRow.preset);
    } else if (activeRow.kind === 'user') {
      applyPreset({
        config: activeRow.preset.config,
        hint: '',
        id: activeRow.preset.id,
        label: activeRow.preset.label
      });
    } else {
      activeRow.action.run();
    }
    open = false;
  };
  // 重开归零：上次的关键词与手动高亮不残留。
  $effect(() => {
    if (!open) {
      query = '';
      manualIndex = undefined;
    }
  });
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    data-testid={TID.configPresetMenu}
    title="配置模板：一键合并预制配置"
    aria-label="配置模板"
    class={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-1 px-2')}>
    <PresetIcon />
    <span class="hidden sm:inline">模板</span>
  </Popover.Trigger>
  <Popover.Content
    bind:ref={contentEl}
    align="end"
    class="flex max-h-[70vh] w-60 flex-col gap-0.5 overflow-y-auto p-1"
    onOpenAutoFocus={(event) => {
      event.preventDefault();
      // 移动端不抢焦点（不弹虚拟键盘）；桌面打开即键入（循环 167）
      if (window.innerWidth >= 768) {
        searchEl?.focus();
      }
    }}>
    <!-- 打开即聚焦搜索框（桌面），直接键入即过滤（片段菜单同款） -->
    <input
      bind:this={searchEl}
      class="mx-1 mb-1 h-7 rounded border bg-background px-1.5 text-sm"
      placeholder="搜索模板…（↑/↓ 选择，Enter 应用）"
      aria-label="搜索模板"
      aria-activedescendant={activeIndex >= 0 ? `preset-opt-${activeIndex}` : undefined}
      data-testid="config-preset-search"
      bind:value={query}
      onkeydown={(event) => {
        if (event.isComposing || event.keyCode === 229) {
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          runActive();
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          moveActive(1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          moveActive(-1);
        } else if (event.key === 'Escape' && query !== '') {
          // 有词先清词（不关菜单）；空词放行照常关闭
          event.stopPropagation();
          query = '';
        }
      }} />
    {#if queryLower !== '' && flatRows.length === 0}
      <div class="px-2 py-1 text-xs text-muted-foreground" data-testid="config-preset-search-empty">
        无匹配模板（Esc 清除）
      </div>
    {/if}
    {#if filteredUser.length > 0}
      <div class="px-2 pt-1 text-xs text-muted-foreground">我的模板</div>
    {/if}
    {#each filteredUser as preset, i (preset.id)}
      <div class="group flex items-center">
        <Popover.Close
          id="preset-opt-{i}"
          data-testid="config-preset-user-{preset.id}"
          data-active={i === activeIndex}
          class={cn(
            'flex w-full flex-col rounded px-2 py-1 text-left hover:bg-accent',
            i === activeIndex && 'bg-accent'
          )}
          onfocus={() => (manualIndex = i)}
          onmouseenter={() => (manualIndex = i)}
          onclick={() =>
            applyPreset({ config: preset.config, hint: '', id: preset.id, label: preset.label })}>
          <span class="text-sm">{preset.label}</span>
        </Popover.Close>
        <!-- 行内重命名钮（历史条目同款）：条目本体是 Popover.Close（点击即
             应用并关菜单），双击会被首次点击吃掉——重命名走独立小钮 -->
        <button
          class="rounded p-1 opacity-40 hover:bg-accent hover:opacity-100"
          title="重命名模板「{preset.label}」"
          aria-label="重命名模板{preset.label}"
          data-testid="config-preset-rename-{preset.id}"
          onclick={(event) => {
            event.stopPropagation();
            renameUserPreset(preset);
          }}>
          <EditIcon class="size-3.5" />
        </button>
        <button
          class="rounded p-1 opacity-40 hover:bg-accent hover:opacity-100"
          title="删除模板「{preset.label}」"
          aria-label="删除模板{preset.label}"
          data-testid="config-preset-delete-{preset.id}"
          onclick={(event) => {
            event.stopPropagation();
            removeUserPreset(preset);
          }}>
          <DeleteIcon class="size-3.5" />
        </button>
      </div>
    {/each}
    {#if saveOpen}
      <div class="flex items-center gap-1 px-1 py-0.5">
        <input
          class="h-7 w-full rounded border bg-background px-1.5 text-sm"
          placeholder="模板名称…"
          aria-label="模板名称"
          data-testid="config-preset-save-name"
          bind:value={saveName}
          onkeydown={(event) => {
            if (event.key === 'Enter') {
              // 关闭悬浮层后焦点回到触发钮，Enter 的默认激活会把菜单重开——拦掉。
              event.preventDefault();
              confirmSave();
            } else if (event.key === 'Escape') {
              saveOpen = false;
            }
          }} />
        <button
          class="h-7 shrink-0 rounded border px-2 text-xs hover:bg-accent"
          data-testid="config-preset-save-confirm"
          onclick={confirmSave}>
          保存
        </button>
      </div>
    {:else if queryLower === ''}
      <!-- 过滤态不掺保存入口（打断结果流）；保存表单打开时照常顶替 -->
      <button
        class="flex w-full rounded px-2 py-1 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        data-testid="config-preset-save"
        onclick={startSave}>
        ＋ 保存当前配置为模板
      </button>
    {/if}
    {#if queryLower === ''}
      <Separator class="my-1" />
    {/if}
    {#each groupedRows as group (group.group)}
      <div class="px-2 pt-1 text-xs text-muted-foreground">{group.group}</div>
      {#each group.items as preset, ii (preset.id)}
        <Popover.Close
          id="preset-opt-{group.start + ii}"
          data-testid="config-preset-{preset.id}"
          data-active={group.start + ii === activeIndex}
          class={cn(
            'flex w-full flex-col rounded px-2 py-1 text-left hover:bg-accent',
            group.start + ii === activeIndex && 'bg-accent'
          )}
          onfocus={() => (manualIndex = group.start + ii)}
          onmouseenter={() => (manualIndex = group.start + ii)}
          onclick={() => applyPreset(preset)}>
          <span class="flex items-center justify-between text-sm">
            <span>{preset.label}</span>
            {#if isActive(preset)}
              <span class="text-primary" data-testid="config-preset-active-{preset.id}">✓</span>
            {/if}
          </span>
          <span class="text-xs text-muted-foreground">{preset.hint}</span>
        </Popover.Close>
      {/each}
    {/each}
    {#if filteredActions.length > 0}
      <Separator class="my-1" />
    {/if}
    {#each filteredActions as action, ai (action.id)}
      <Popover.Close
        id="preset-opt-{actionStart + ai}"
        data-testid="config-preset-{action.id}"
        data-active={actionStart + ai === activeIndex}
        class={cn(
          'flex w-full rounded px-2 py-1 text-left text-sm hover:bg-accent',
          actionStart + ai === activeIndex && 'bg-accent'
        )}
        onmouseenter={() => (manualIndex = actionStart + ai)}
        onclick={action.run}>
        {action.label}
      </Popover.Close>
    {/each}
    <Separator class="my-1" />
    <!-- 差异预览：应用前告知会改哪些键（键路径: 旧值 → 新值），降低一键合并的不确定性 -->
    <div class="px-2 py-1 text-xs" data-testid="config-preset-diff">
      {#if previewPreset}
        <div class="font-medium">「{previewPreset.label}」将修改：</div>
        {#if changedEntries.length === 0}
          <div class="text-muted-foreground">已全部生效，应用后无变化</div>
        {:else}
          {#each changedEntries.slice(0, PREVIEW_MAX_ROWS) as entry (entry.path)}
            <div
              class="truncate font-mono text-muted-foreground"
              title="{entry.path}: {entry.from ?? '（未设置）'} → {entry.to}">
              {entry.path}: {entry.from ?? '（未设置）'} → {entry.to}
            </div>
          {/each}
          {#if changedEntries.length > PREVIEW_MAX_ROWS}
            <div class="text-muted-foreground">…共 {changedEntries.length} 项变化</div>
          {/if}
        {/if}
      {:else}
        <div class="text-muted-foreground">悬停/↑↓ 选中模板可预览将修改的配置项</div>
      {/if}
    </div>
  </Popover.Content>
</Popover.Root>
