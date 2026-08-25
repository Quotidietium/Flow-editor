<script lang="ts">
  import { buttonVariants } from '$/components/ui/button';
  import * as Popover from '$/components/ui/popover';
  import { Separator } from '$/components/ui/separator';
  import { TID } from '$/constants';
  import {
    applyConfigPreset,
    CONFIG_PRESET_GROUPS,
    defaultConfigJson,
    deleteUserPreset,
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
    updateConfig(defaultConfigJson());
    notify('已重置为默认配置');
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
    notify(`已保存模板「${label}」`);
  };

  const removeUserPreset = (preset: UserPreset) => {
    userPresets = deleteUserPreset(preset.id);
    notify(`已删除模板「${preset.label}」`);
  };
</script>

<Popover.Root>
  <Popover.Trigger
    data-testid={TID.configPresetMenu}
    title="配置模板：一键合并预制配置"
    aria-label="配置模板"
    class={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-1 px-2')}>
    <PresetIcon />
    <span class="hidden sm:inline">模板</span>
  </Popover.Trigger>
  <Popover.Content align="end" class="flex max-h-[70vh] w-60 flex-col gap-0.5 overflow-y-auto p-1">
    <div class="px-2 pt-1 text-xs text-muted-foreground">我的模板</div>
    {#each userPresets as preset (preset.id)}
      <div class="group flex items-center">
        <Popover.Close
          data-testid="config-preset-user-{preset.id}"
          class="flex w-full flex-col rounded px-2 py-1 text-left hover:bg-accent"
          onclick={() =>
            applyPreset({ config: preset.config, hint: '', id: preset.id, label: preset.label })}>
          <span class="text-sm">{preset.label}</span>
        </Popover.Close>
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
    {:else}
      <button
        class="flex w-full rounded px-2 py-1 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        data-testid="config-preset-save"
        onclick={startSave}>
        ＋ 保存当前配置为模板
      </button>
    {/if}
    <Separator class="my-1" />
    {#each CONFIG_PRESET_GROUPS as { group, items } (group)}
      <div class="px-2 pt-1 text-xs text-muted-foreground">{group}</div>
      {#each items as preset (preset.id)}
        <Popover.Close
          data-testid="config-preset-{preset.id}"
          class="flex w-full flex-col rounded px-2 py-1 text-left hover:bg-accent"
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
    <Separator class="my-1" />
    <Popover.Close
      data-testid="config-preset-format"
      class="flex w-full rounded px-2 py-1 text-left text-sm hover:bg-accent"
      onclick={formatCurrent}>
      格式化 JSON
    </Popover.Close>
    <Popover.Close
      data-testid="config-preset-reset"
      class="flex w-full rounded px-2 py-1 text-left text-sm hover:bg-accent"
      onclick={resetDefault}>
      重置为默认
    </Popover.Close>
  </Popover.Content>
</Popover.Root>
