<script lang="ts">
  import { buttonVariants } from '$/components/ui/button';
  import * as Popover from '$/components/ui/popover';
  import { Separator } from '$/components/ui/separator';
  import { TID } from '$/constants';
  import {
    applyConfigPreset,
    CONFIG_PRESET_GROUPS,
    defaultConfigJson,
    formatConfigJson,
    type ConfigPreset
  } from '$/util/configPresets';
  import { notify } from '$/util/notify';
  import { updateConfig, validatedState } from '$/util/state.svelte';
  import { cn } from '$lib/utils';
  import PresetIcon from '~icons/material-symbols/dashboard-customize-outline-rounded';

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
</script>

<Popover.Root>
  <Popover.Trigger
    data-testid={TID.configPresetMenu}
    title="配置模板：一键合并预制配置"
    aria-label="配置模板"
    class={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-1 px-2')}>
    <PresetIcon />
    模板
  </Popover.Trigger>
  <Popover.Content align="end" class="flex w-60 flex-col gap-0.5 p-1">
    {#each CONFIG_PRESET_GROUPS as { group, items } (group)}
      <div class="px-2 pt-1 text-xs text-muted-foreground">{group}</div>
      {#each items as preset (preset.id)}
        <Popover.Close
          data-testid="config-preset-{preset.id}"
          class="flex w-full flex-col rounded px-2 py-1 text-left hover:bg-accent"
          onclick={() => applyPreset(preset)}>
          <span class="text-sm">{preset.label}</span>
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
