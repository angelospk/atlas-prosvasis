<script lang="ts">
	// What the directory gained or stopped returning for the current prefecture / specialty /
	// sectors between the last two comparable scans. «Removed» is «no longer returned», never
	// «closed». Private and ΕΟΠΥΥ doctors are never named (providerName).
	import type { AtlasReport, ChangeItem, Selection } from '$lib/atlas/types';
	import { buildIndex, fmtDayShort, prefLabel, providerName, selectionChanges, titleCase } from './format';

	let { report, selection }: { report: AtlasReport; selection: Selection } = $props();
	const uid = $props.id();
	const idx = $derived(buildIndex(report));
	const changes = $derived(selectionChanges(report, selection));
	const SHOWN = 6;
	let showAll = $state(false);

	function label(x: ChangeItem): string {
		const parts = [providerName(x)];
		if (selection.specialtyId == null) parts.push(titleCase(idx.specById.get(x.specialtyId)?.name ?? ''));
		if (selection.prefectureId == null && x.prefectureId != null) parts.push(prefLabel(idx.prefById.get(x.prefectureId)));
		return parts.filter(Boolean).join(' · ');
	}
</script>

{#snippet list(title: string, items: ChangeItem[], cls: string)}
	{#if items.length}
		<div class="side {cls}">
			<h4>{title} <span class="n">{items.length}</span></h4>
			<ul>{#each (showAll ? items : items.slice(0, SHOWN)) as x (`${x.providerId}:${x.specialtyId}`)}<li>{label(x)}</li>{/each}</ul>
			{#if !showAll && items.length > SHOWN}<p class="rest">και {items.length - SHOWN} ακόμη</p>{/if}
		</div>
	{/if}
{/snippet}

{#if changes}
	<section class="sel-changes" aria-labelledby={`${uid}-title`}>
		<h3 id={`${uid}-title`}>Τι άλλαξε από τη σάρωση της {fmtDayShort(changes.from)} στη σάρωση της {fmtDayShort(changes.to)}</h3>
		{#if changes.added.length === 0 && changes.removed.length === 0}
			<p class="none">{changes.partial ? 'Καμία καταγεγραμμένη αλλαγή σε δημόσια μονάδα.' : 'Καμία αλλαγή στον κατάλογο.'}</p>
		{:else}
			{@render list('Νέες καταχωρίσεις', changes.added, 'added')}
			{@render list('Δεν επιστρέφονται πλέον', changes.removed, 'removed')}
		{/if}
		{#if changes.added.length > SHOWN || changes.removed.length > SHOWN}<button type="button" class="toggle" aria-expanded={showAll} onclick={() => (showAll = !showAll)}>{showAll ? 'Λιγότερες' : 'Όλες οι αλλαγές'}</button>{/if}
		{#if changes.partial}<p class="note">Η σάρωση καταγράφει ονομαστικά μόνο δημόσιες μονάδες· αλλαγές σε ιδιώτες και ΕΟΠΥΥ δεν φαίνονται εδώ.</p>{/if}
	</section>
{/if}

<style>
	.sel-changes { display: grid; gap: 0.55rem; margin-top: 1rem; padding: 0.8rem 0.9rem; background: var(--card); border: 1px solid var(--line); border-radius: 10px; font-size: 0.82rem; }
	h3 { margin: 0; font: 600 0.88rem var(--sans); color: var(--ink); }
	h4 { margin: 0 0 0.25rem; font: 600 0.76rem var(--sans); color: var(--ink-2); }
	.n { color: var(--ink-3); font-weight: 500; }
	.added h4::before { content: '+ '; color: var(--accent-d); }
	.removed h4::before { content: '− '; color: var(--urgent); }
	ul { display: grid; gap: 0.2rem; margin: 0; padding: 0; list-style: none; }
	li { overflow-wrap: anywhere; line-height: 1.3; }
	.none, .rest, .note { margin: 0; color: var(--ink-3); }
	.note { font-size: 0.74rem; }
	.toggle { justify-self: start; min-height: 44px; padding: 0 0.9rem; border: 1px solid var(--line-2); border-radius: var(--r-ctl); background: var(--card); color: var(--ink); font: inherit; font-size: 0.78rem; font-weight: 500; cursor: pointer; }
</style>
