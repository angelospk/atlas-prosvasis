<script lang="ts">
	import { onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import '../../components/atlas.css';
	import type { AtlasReport, Metric, PrefectureBoundaries, Selection } from '$lib/atlas/types';
	import { SECTORS } from '$lib/atlas/types';
	import { pickerHidden, PUBLIC_SITE, readAtlasUrl, SPECIALTY_WIDGETS, writeAtlasUrl, WIDGET_LABELS, type MapMetric, type Widget } from '$lib/atlas/url';
	import { parseKey, titleCase } from '../../components/format';
	import AtlasFooter from '../../components/AtlasFooter.svelte';
	import MetricSummary from '../../components/MetricSummary.svelte';
	import CoverageList from '../../components/CoverageList.svelte';
	import AccessMap from '../../components/AccessMap.svelte';
	import CoverageMatrix from '../../components/CoverageMatrix.svelte';
	import WeeklyBriefing from '../../components/WeeklyBriefing.svelte';
	import PrefectureChoropleth from '../../components/PrefectureChoropleth.svelte';
	import SpecialtyCoverageBars from '../../components/SpecialtyCoverageBars.svelte';
	import CoverageRanking from '../../components/CoverageRanking.svelte';
	import ScanChangeChart from '../../components/ScanChangeChart.svelte';
	import WaitDistribution from '../../components/WaitDistribution.svelte';

	let { data: page }: { data: { widget: Widget; atlas: AtlasReport | null; boundaries: PrefectureBoundaries | null } } = $props();
	const data = $derived(page.atlas);
	const widget = $derived(page.widget);

	let selection = $state<Selection>({ mode: 'place', prefectureId: null, specialtyId: null, sectors: [...SECTORS] });
	let metric = $state<MapMetric>('coverage');
	let sort = $state<Metric>('count');
	let matrixMetric = $state<Metric>('count');
	let selectedKey = $state<string | null>(null);
	let compact = $state(true);
	let matrixPrefectureId = $state<number | null>(null);
	let ready = $state(false);
	// Shown only after the query is read, so a locked embed never flashes the picker.
	let specialtyPicker = $state(false);
	// A new specialty drops the selected cell, so the point map does not keep the old one's line.
	const pickSpecialty = (specialtyId: number | null) => { selectedKey = null; update({ specialtyId }); };
	const sortedSpecs = $derived(data ? [...data.specialties].sort((a, b) => titleCase(a.name).localeCompare(titleCase(b.name), 'el')) : []);

	// The full atlas opens on the same view, at the section that holds this widget.
	const SECTION: Record<Widget, string> = {
		coverage: 'atlas-map', summary: 'atlas-map', briefing: 'atlas-map', points: 'atlas-point-map', list: 'atlas-list',
		waits: 'atlas-waits', matrix: 'atlas-details', specialties: 'atlas-details', ranking: 'atlas-details', changes: 'atlas-details'
	};
	const fullUrl = $derived.by(() => {
		const url = writeAtlasUrl(new URL('/', PUBLIC_SITE), selection, metric);
		url.hash = SECTION[widget];
		return url.href;
	});
	const firstPrefectureId = $derived(data ? [...data.prefectures].sort((a, b) => a.name.localeCompare(b.name, 'el'))[0]?.id ?? null : null);

	function update(next: Partial<Selection>) {
		const merged = { ...selection, ...next };
		selection = { ...merged, mode: merged.specialtyId != null && merged.prefectureId == null ? 'specialty' : 'place' };
		sync();
	}
	function sync() {
		const url = writeAtlasUrl(new URL(window.location.href), selection, metric);
		if (url.href !== window.location.href) replaceState(url, {});
	}
	function openCell(key: string) {
		const parsed = parseKey(key);
		if (!parsed) return;
		selectedKey = key;
		update({ prefectureId: parsed.prefectureId, specialtyId: parsed.specialtyId });
	}

	// Opens the full atlas on the chosen row (not the embed's broader view), at the point map.
	function showOnMap(key: string) {
		const parsed = parseKey(key);
		const url = writeAtlasUrl(new URL('/', PUBLIC_SITE), parsed ? { ...selection, ...parsed, mode: parsed.prefectureId == null ? 'specialty' : 'place' } : selection, metric);
		url.hash = 'atlas-point-map';
		window.open(url.href, '_blank', 'noopener');
	}

	onMount(() => {
		if (data) {
			const url = new URL(window.location.href);
			const state = readAtlasUrl(url, data);
			specialtyPicker = !pickerHidden(url);
			selection = state.selection;
			metric = state.metric;
			if (selection.prefectureId != null && selection.specialtyId != null) selectedKey = `${selection.prefectureId}:${selection.specialtyId}`;
		}
		const media = window.matchMedia('(max-width: 899px)');
		const syncCompact = () => (compact = media.matches);
		syncCompact();
		media.addEventListener?.('change', syncCompact);
		ready = true;
		return () => media.removeEventListener?.('change', syncCompact);
	});
</script>

<svelte:head>
	<title>{WIDGET_LABELS[widget]} · Άτλας πρόσβασης</title>
	<meta name="robots" content="noindex" />
	<link rel="canonical" href={`${PUBLIC_SITE}/#${SECTION[widget]}`} />
</svelte:head>

<div class="atlas embed" aria-busy={!ready}>
	{#if !data}
		<p>Δεν υπάρχει ακόμη σάρωση.</p>
	{:else}
		{#if specialtyPicker && SPECIALTY_WIDGETS.includes(widget) && widget !== 'coverage' && widget !== 'waits'}
			<label class="spec">Ειδικότητα
				<select value={selection.specialtyId ?? ''} onchange={(e) => { const v = e.currentTarget.value; pickSpecialty(v ? +v : null); }}>
					<option value="">Όλες οι ειδικότητες</option>
					{#each sortedSpecs as sp (sp.id)}<option value={sp.id}>{titleCase(sp.name)}</option>{/each}
				</select>
			</label>
		{/if}
		{#if widget === 'coverage' && page.boundaries}
			<PrefectureChoropleth {data} boundaries={page.boundaries} {selection} onSelect={(prefectureId) => update({ prefectureId: selection.prefectureId === prefectureId ? null : prefectureId })} {metric} onMetric={(m) => { metric = m; sync(); }} onSpecialty={specialtyPicker ? pickSpecialty : null} />
		{:else if widget === 'points'}
			<AccessMap {data} {selection} {selectedKey} onSelect={openCell} />
		{:else if widget === 'waits'}
			<WaitDistribution {data} {selection} onPickSpecialty={pickSpecialty} onShowOnMap={showOnMap} {specialtyPicker} />
		{:else if widget === 'list'}
			<CoverageList {data} {selection} {sort} onSort={(s) => { sort = s; selectedKey = null; }} {selectedKey} onSelect={(key) => (selectedKey = key != null && selectedKey !== key ? key : null)} {compact} expanded={true} onExpandedChange={() => {}} />
		{:else if widget === 'summary'}
			<MetricSummary {data} {selection} />
		{:else if widget === 'matrix'}
			<CoverageMatrix {data} sectors={selection.sectors} metric={matrixMetric} onMetric={(m) => (matrixMetric = m)} onSelect={openCell} {compact} prefectureId={matrixPrefectureId ?? selection.prefectureId ?? firstPrefectureId} onPrefectureChange={(id) => (matrixPrefectureId = id)} />
		{:else if widget === 'specialties'}
			<SpecialtyCoverageBars {data} sectors={selection.sectors} selectedSpecialtyId={selection.specialtyId} onSelect={(specialtyId) => update({ specialtyId })} />
		{:else if widget === 'ranking'}
			<CoverageRanking {data} {selection} onSelect={(prefectureId) => update({ prefectureId })} />
		{:else if widget === 'changes'}
			<ScanChangeChart report={data} />
		{:else if widget === 'briefing'}
			<WeeklyBriefing report={data} onSelect={(partial) => update(partial)} />
		{/if}
		<AtlasFooter embedded {fullUrl} />
	{/if}
</div>

<style>
	.embed { display: grid; gap: 1rem; padding: clamp(0.75rem, 3vw, 1.25rem); min-width: 0; max-width: 1200px; margin: 0 auto; }
	:global(body:has(.embed)) { background: var(--card, #fff); }
	.spec { display: grid; gap: 0.25rem; max-width: 22rem; font-size: 0.78rem; font-weight: 600; color: var(--ink-2); }
	.spec select { height: 44px; border: 1px solid var(--line-2); border-radius: var(--r-ctl); background: var(--card); color: var(--ink); padding: 0 0.5rem; font: inherit; font-size: 16px; }
</style>
