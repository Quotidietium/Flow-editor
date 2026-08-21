<script lang="ts">
  import { Toaster } from '$/components/ui/sonner/index.js';
  import { toggleDarkTheme } from '$/util/state.svelte';
  import { initHandler } from '$/util/util';
  import { base } from '$app/paths';
  import { mode, ModeWatcher } from 'mode-watcher';
  import { onMount, type Snippet } from 'svelte';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();

  // This can be removed once https://github.com/sveltejs/kit/issues/1612 is fixed.
  // Then move it into src and vite will bundle it automatically.
  onMount(() => {
    window.addEventListener('hashchange', () => {
      void initHandler();
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register(`${base}/service-worker.js`, { scope: `${base}/` })
        .then(function (registration) {
          console.log('Registration successful, scope is:', registration.scope);
        })
        .catch(function (error) {
          console.log('Service worker registration failed, error:', error);
        });
    }
  });

  $effect(() => {
    toggleDarkTheme(mode.current === 'dark');
  });
</script>

<ModeWatcher />
<Toaster visibleToasts={4} />

<main class="h-dvh">
  {@render children()}
</main>
