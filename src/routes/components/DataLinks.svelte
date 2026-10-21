<script lang="ts">
	// A small download mark next to a section title: the section's open data as CSV or JSON,
	// for the current specialty (or prefecture), plus the way to every file on /dedomena.
	// Static files under /data/v1, so the links work without JavaScript and can be shared.
	import { tick } from 'svelte';
	import type { AtlasData } from '$lib/atlas/types';
	import { DATASETS, datasetPath, type DataFilter, type DatasetId } from '$lib/atlas/datasets';

	let { dataset, data, filter = {} }: { dataset: DatasetId; data: AtlasData; filter?: DataFilter } = $props();

	const meta = $derived(DATASETS.find((d) => d.id === dataset)!);
	// A dataset without filters is always whole.
	const used = $derived<DataFilter>(meta.filters.length ? filter : {});
	const scope = $derived(
		used.specialtyId != null
			? (data.specialties.find((s) => s.id === used.specialtyId)?.name ?? '')
			: used.prefectureId != null
				? (data.prefectures.find((p) => p.id === used.prefectureId)?.name ?? '')
				: meta.filters.length
					? 'όλη η Ελλάδα'
					: ''
	);

	let el: HTMLSpanElement;
	let button: HTMLButtonElement;
	let pop: HTMLDivElement;
	let open = $state(false);
	// Right-aligned under the mark, then shifted so both edges stay 8 px inside the viewport.
	let shift = $state(0);
	async function toggle() {
		open = !open;
		shift = 0;
		if (!open) return;
		await tick();
		const r = pop.getBoundingClientRect();
		const room = document.documentElement.clientWidth - 8;
		shift = r.left < 8 ? 8 - r.left : r.right > room ? room - r.right : 0;
	}
	$effect(() => {
		if (!open) return;
		const close = (e: Event) => {
			if (e instanceof KeyboardEvent) {
				if (e.key !== 'Escape') return;
				open = false;
				button.focus();
			} else if (!el.contains(e.target as Node)) open = false;
		};
		document.addEventListener('click', close);
		document.addEventListener('keydown', close);
		return () => {
			document.removeEventListener('click', close);
			document.removeEventListener('keydown', close);
		};
	});
</script>

<span class="data-links" bind:this={el}>
	<button type="button" class="mark" title={`Δεδομένα: ${meta.title}`} aria-label={`Δεδομένα: ${meta.title}`} aria-expanded={open} bind:this={button} onclick={toggle}>
		<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
			><polyline points="8,2 8,10" /><polyline points="4.8,6.8 8,10 11.2,6.8" /><polyline points="2.5,11 2.5,13.5 13.5,13.5 13.5,11" /></svg
		>
	</button>
	<div class="pop" bind:this={pop} style:translate={shift ? `${shift}px 0` : undefined} hidden={!open} role="group" aria-label={`Δεδομένα: ${meta.title}`}>
		<p class="t">{meta.title}{#if scope}<span> · {scope}</span>{/if}</p>
		<div class="fmt">
			<a href={datasetPath(dataset, 'csv', used)} download>CSV</a>
			<a href={datasetPath(dataset, 'json', used)} target="_blank" rel="noopener">JSON</a>
		</div>
		<a class="all" href={`/dedomena#${dataset}`}>Όλα τα δεδομένα →</a>
	</div>
</span>

<style>
	.data-links {
		position: relative;
		display: inline-block;
		vertical-align: middle;
	}
	.mark {
		border: 0;
		background: none;
		padding: 0;
		display: inline-grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 6px;
		color: var(--ink-3);
		cursor: pointer;
	}
	.mark:hover,
	.mark[aria-expanded='true'] {
		color: var(--accent);
		background: var(--accent-soft);
	}
	.mark:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}
	.pop[hidden] {
		display: none;
	}
	.pop {
		position: absolute;
		right: 0;
		top: calc(100% + 4px);
		z-index: 40;
		width: max-content;
		max-width: min(17rem, 80vw);
		padding: 0.6rem 0.7rem;
		background: var(--card);
		border: 1px solid var(--line-2);
		border-radius: 8px;
		box-shadow: 0 6px 18px #152c3b1f;
		font-size: 0.82rem;
		font-weight: 400;
		color: var(--ink);
		text-align: left;
	}
	.t {
		margin: 0 0 0.45rem;
		font-weight: 600;
	}
	.t span {
		font-weight: 400;
		color: var(--ink-2);
	}
	.fmt {
		display: flex;
		gap: 0.4rem;
		margin-bottom: 0.5rem;
	}
	.fmt a {
		flex: 1;
		text-align: center;
		padding: 0.3rem 0.6rem;
		border: 1px solid var(--line-2);
		border-radius: 6px;
		color: var(--accent-d);
		font-weight: 600;
		text-decoration: none;
	}
	.fmt a:hover {
		background: var(--accent-soft);
	}
	.all {
		color: var(--ink-2);
	}
</style>
