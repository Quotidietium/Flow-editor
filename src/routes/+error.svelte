<script>
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { onMount } from 'svelte';

  // Only redirect if it's a 404 error
  onMount(() => {
    if (page.status === 404) {
      goto(resolve('/'));
    }
  });
</script>

{#if page.status !== 404}
  <div class="container mx-auto p-8">
    <h1 class="mb-4 text-2xl font-bold">错误 {page.status}</h1>
    <p class="mb-4">{page.error?.message || '发生了意外错误'}</p>
    <a href={resolve('/')} class="text-blue-500 hover:underline">返回首页</a>
  </div>
{/if}
