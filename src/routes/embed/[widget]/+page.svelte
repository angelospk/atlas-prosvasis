<script lang="ts">
	import { onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import '../../components/atlas.css';
	import type { AtlasReport, Metric, PrefectureBoundaries, Selection } from '$lib/atlas/types';
	import { SECTORS } from '$lib/atlas/types';
	import { PUBLIC_SITE, readAtlasUrl, writeAtlasUrl, WIDGET_LABELS, type MapMetric, type Widget } from '$lib/atlas/url';
	import { parseKey } from '../../components/format';
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
			const state = readAtlasUrl(new URL(window.location.href), data);
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
		{#if widget === 'coverage' && page.boundaries}
			<PrefectureChoropleth {data} boundaries={page.boundaries} {selection} onSelect={(prefectureId) => update({ prefectureId })} {metric} onMetric={(m) => { metric = m; sync(); }} />
		{:else if widget === 'points'}
			<AccessMap {data} {selection} {selectedKey} onSelect={openCell} />
		{:else if widget === 'waits'}
			<WaitDistribution {data} {selection} onPickSpecialty={(specialtyId) => update({ specialtyId })} onShowOnMap={showOnMap} />
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
</style>
