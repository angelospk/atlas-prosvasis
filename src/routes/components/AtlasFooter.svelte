<script lang="ts">
	import { PUBLIC_REPO, PUBLIC_SITE } from '$lib/atlas/url';
	import AtlasMark from './AtlasMark.svelte';
	let { embedded = false, fullUrl = PUBLIC_SITE }: { embedded?: boolean; fullUrl?: string } = $props();
</script>
<footer class:embedded>
	{#if embedded}<span class="credit"><a class="site" href={fullUrl} target="_blank" rel="noopener"><AtlasMark size={18} />Άτλας πρόσβασης</a><span class="src">πηγή: e-ραντεβού</span></span>
	{:else}<span class="credit"><AtlasMark size={22} />© {new Date().getFullYear()} Άτλας πρόσβασης</span>{/if}
	<a class="github" href={PUBLIC_REPO} target="_blank" rel="noopener" aria-label="Κώδικας του Άτλαντα πρόσβασης στο GitHub"><svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path fill="currentColor" d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.77-.24.77-.54v-2.1c-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.39-1.22.71-1.5-2.5-.29-5.13-1.25-5.13-5.56 0-1.23.44-2.23 1.16-3.02-.12-.29-.5-1.43.11-2.98 0 0 .95-.3 3.08 1.15A10.8 10.8 0 0 1 12 6.12c.95 0 1.9.13 2.79.38 2.14-1.45 3.08-1.15 3.08-1.15.62 1.55.23 2.7.12 2.98.72.79 1.15 1.79 1.15 3.02 0 4.32-2.63 5.27-5.14 5.55.4.35.76 1.04.76 2.09v3.1c0 .3.21.65.78.54A11.2 11.2 0 0 0 12 .8Z"/></svg><span class:sr-only={embedded}>GitHub</span></a>
</footer>
<style>
	footer { display:flex; justify-content:space-between; align-items:center; gap:1rem; border-top:1px solid var(--line-2); padding:1.4rem 0 0; color:var(--ink-2); font-size:.82rem; }
	.credit { display:flex; align-items:center; flex-wrap:wrap; gap:.3rem .6rem; min-width:0; } .credit > * { white-space:nowrap; } .site { display:inline-flex; align-items:center; gap:.4rem; font-weight:500; color:var(--ink); }
	.src { color:var(--ink-3); } .github { display:inline-flex; gap:.5rem; align-items:center; min-height:44px; min-width:44px; justify-content:center; flex:none; } .embedded { font-size:.75rem; padding-top:.6rem; } a:hover { text-decoration:underline; }
	.sr-only { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
</style>
