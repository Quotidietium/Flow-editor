<script lang="ts">
  import FloatingToolbar from '$/components/FloatingToolbar.svelte';
  import { Button } from '$/components/ui/button';
  import { TID } from '$/constants';
  import { version as mermaidVersion } from 'mermaid/package.json';
  import { mode, setMode } from 'mode-watcher';
  // 显示应用自身版本（此前显示的是 Mermaid 引擎库版本——用户报障时
  // 会拿错的那个），引擎版本并入悬停提示。
  import { version as appVersion } from '../../../package.json';
  import ThemeIcon from './ThemeIcon.svelte';
</script>

<FloatingToolbar>
  <span
    class="text-sm font-semibold opacity-60"
    title="Flow 编辑器 v{appVersion} · Mermaid 引擎 v{mermaidVersion}"
    data-testid="app-version">
    v{appVersion}
  </span>
  <Button
    variant="ghost"
    size="icon"
    data-testid={TID.themeToggleButton}
    title="切换到{mode.current === 'dark' ? '浅色' : '深色'}主题"
    class="[&_svg]:size-5"
    onclick={() => setMode(mode.current === 'dark' ? 'light' : 'dark')}>
    <ThemeIcon />
  </Button>
</FloatingToolbar>
