<script lang="ts">
	// «Τα δεδομένα έδειξαν ότι…»: the chosen headlines (insights.ts FEATURED), right under the
	// header. Each loads its selection on the prefecture map, or opens the evidence in detail.
	import type { AtlasData } from '$lib/atlas/types';
	import { tick } from 'svelte';
	import { SECTORS } from '$lib/atlas/types';
	import { writeAtlasUrl } from '$lib/atlas/url';
	import { featured, FEATURED_VISIBLE, type Insight } from './insights';

	let { data, onMap, onDetail }: { data: AtlasData; onMap: (i: Insight) => void; onDetail: (i: Insight) => void } = $props();
	const items = $derived(featured(data));
	let all = $state(false);
	const shown = $derived(all ? items : items.slice(0, FEATURED_VISIBLE));
	// The link carries the finding's selection, so a copied or new-tab link opens the same view.
	function href(i: Insight): string {
		const selection = { mode: 'place' as const, prefectureId: null, specialtyId: null, ...i.selection, sectors: [...(i.selection.sectors ?? SECTORS)] };
		const url = writeAtlasUrl(new URL('http://x/'), selection, i.metric);
		url.hash = i.detail === 'list' ? 'atlas-list' : 'atlas-map';
		return url.search + url.hash;
	}
	// Collapsing removes the cards above the button: keep it where it was on screen, or the
	// page jumps down past the findings.
	function toggle(button: HTMLElement) {
		if (all) {
			const top = button.getBoundingClientRect().top;
			void tick().then(() => {
				const shift = button.getBoundingClientRect().top - top;
				if (shift) window.scrollBy({ top: shift, behavior: 'instant' });
			});
		}
		all = !all;
	}
	// A modified click (new tab, new window) keeps the browser's default.
	const plain = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
</script>

{#if items.length}
	<section class="key" aria-labelledby="atlas-key-title">
		<h2 id="atlas-key-title">Τα δεδομένα έδειξαν ότι…</h2>
		<!-- Block flow: a sticky toggle may only travel inside its containing block (a grid row otherwise). -->
		<div class="fold">
		<ol id="atlas-key-list">
			{#each shown as item (item.id)}
				{@const at = item.link ? item.text.indexOf(item.link) : -1}
				<li>
					<p id={`key-${item.id}`}>{#if at >= 0 && item.link}{item.text.slice(0, at)}<a href={href(item)} onclick={(e) => { if (!plain(e)) return; e.preventDefault(); onDetail(item); }}>{item.link}</a>{item.text.slice(at + item.link.length)}{:else}{item.text}{/if}</p>
					<div class="actions">
						<button type="button" class="primary" aria-describedby={`key-${item.id}`} onclick={() => onMap(item)}>Φόρτωσε στον χάρτη</button>
						<button type="button" aria-describedby={`key-${item.id}`} onclick={() => onDetail(item)}>Δες αναλυτικά</button>
					</div>
				</li>
			{/each}
		</ol>
		{#if items.length > FEATURED_VISIBLE}
			<button type="button" class="toggle" class:stuck={all} aria-expanded={all} aria-controls="atlas-key-list" onclick={(e) => toggle(e.currentTarget)}>{all ? 'Λιγότερα ευρήματα' : `Περισσότερα ευρήματα (${items.length - FEATURED_VISIBLE})`}</button>
		{/if}
		</div>
	</section>
{/if}

<style>
	.key { display: grid; gap: 1rem; min-width: 0; }
	h2 { font-size: clamp(1.3rem, 2.4vw, 1.7rem); }
	ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.8rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr)); }
	li { display: grid; grid-template-rows: 1fr auto; gap: 0.9rem; padding: 1rem 1.1rem; background: var(--card); border: 1px solid var(--line); border-top: 3px solid var(--accent); border-radius: var(--r-box); min-width: 0; }
	p { margin: 0; font-size: 1rem; line-height: 1.45; text-wrap: pretty; }
	p a { color: inherit; text-decoration: underline; text-decoration-color: var(--accent); text-underline-offset: 3px; }
	p a:hover { color: var(--accent-d); }
	.actions { display: flex; flex-wrap: wrap; gap: 0.4rem; }
	button { min-height: 40px; padding: 0 0.8rem; border: 1px solid var(--line-2); border-radius: var(--r-ctl); background: var(--card); color: var(--accent-d); font: inherit; font-size: 0.8rem; font-weight: 600; cursor: pointer; }
	button:hover { border-color: var(--accent); }
	button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
	button.primary:hover { background: var(--accent-d); }
	.actions button:not(.primary) { border-color: transparent; background: none; padding: 0 0.4rem; text-decoration: underline; text-decoration-color: var(--line-2); text-underline-offset: 3px; }
	.actions button:not(.primary):hover { text-decoration-color: var(--accent); }
	.fold { min-width: 0; }
	.toggle { margin-top: 1rem; }
	/* While all findings show, «Λιγότερα ευρήματα» stays at the bottom of the screen. */
	.toggle.stuck { position: sticky; bottom: max(12px, env(safe-area-inset-bottom)); z-index: 2; box-shadow: var(--shadow); }
	button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
