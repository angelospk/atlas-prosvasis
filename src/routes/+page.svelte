<script lang="ts">
	// Άτλας πρόσβασης: how well each prefecture and each specialty is covered in the Ministry's
	// e-ραντεβού directory. Simple by default (a map and a list), the deeper tools one tap away.
	// Data is built weekly by scripts/ministry-scan; the components only render it.
	import { tick } from 'svelte';
	import './components/atlas.css';
	import type { AtlasReport, Metric, PrefectureBoundaries, Selection } from '$lib/atlas/types';
	import { SECTORS } from '$lib/atlas/types';
	import { parseKey } from './components/format';
	import SelectionBar from './components/SelectionBar.svelte';
	import MetricSummary from './components/MetricSummary.svelte';
	import CoverageList from './components/CoverageList.svelte';
	import AccessMap from './components/AccessMap.svelte';
	import CoverageMatrix from './components/CoverageMatrix.svelte';
	import WeeklyBriefing from './components/WeeklyBriefing.svelte';
	import PrefectureChoropleth from './components/PrefectureChoropleth.svelte';
	import SpecialtyCoverageBars from './components/SpecialtyCoverageBars.svelte';
	import CoverageRanking from './components/CoverageRanking.svelte';
	import ScanChangeChart from './components/ScanChangeChart.svelte';
	import MethodologyBlock from './components/MethodologyBlock.svelte';
	import WaitDistribution from './components/WaitDistribution.svelte';

	let { data: page }: { data: { atlas: AtlasReport | null; boundaries: PrefectureBoundaries } } = $props();
	const data = $derived(page.atlas);

	// Opens on all Greece, all specialties: the map shows how many specialties each prefecture has.
	const DEFAULT: Selection = { mode: 'place', prefectureId: null, specialtyId: null, sectors: [...SECTORS] };
	let selection = $state<Selection>({ ...DEFAULT, sectors: [...SECTORS] });
	let sort = $state<Metric>('count');
	let matrixMetric = $state<Metric>('count');
	let selectedKey = $state<string | null>(null);
	// A specialty with no prefecture lists prefectures; anything else lists specialties.
	const withMode = (s: Selection): Selection => ({ ...s, mode: s.specialtyId != null && s.prefectureId == null ? 'specialty' : 'place' });

	// Both chosen → the list shows the prefecture's specialties with the chosen one open, so
	// the list, the map and the bar all talk about the same thing.
	const focusKey = (s: Selection) => (s.prefectureId != null && s.specialtyId != null ? `${s.prefectureId}:${s.specialtyId}` : null);
	function select(s: Selection, key: string | null = focusKey(s)) {
		selection = withMode(s);
		selectedKey = key;
		if (key) void tick().then(() => showRow(key));
	}
	function showRow(key: string) {
		const el = document.querySelector<HTMLElement>(`.row[data-key="${CSS.escape(key)}"]`);
		el?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
		// Keyboard and screen-reader users land on the result (the matrix dialog just closed).
		el?.focus({ preventScroll: true });
	}
	function applyFinding(s: Partial<Selection>, evidenceKey: string | null) {
		select({ ...selection, ...s, sectors: s.sectors?.length ? [...s.sectors] : selection.sectors }, evidenceKey ?? undefined);
	}
	function pickPrefecture(prefectureId: number) {
		select({ ...selection, prefectureId });
	}
	function pickSpecialty(specialtyId: number) {
		select({ ...selection, specialtyId });
	}
	// A matrix cell or a point on the map: select its prefecture + specialty and open that row.
	function openCell(key: string) {
		const k = parseKey(key);
		if (!k) return;
		select({ ...selection, prefectureId: k.prefectureId, specialtyId: k.specialtyId }, key);
	}
	function reset() {
		selection = { ...DEFAULT, sectors: [...SECTORS] };
		selectedKey = null;
	}
</script>

<svelte:head>
	<title>Άτλας πρόσβασης</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Source+Serif+4:wght@600;700&display=swap" />
</svelte:head>

{#if !data}
<div class="atlas page">
	<header class="top">
		<h1>Άτλας πρόσβασης</h1>
		<p class="lede">Δεν υπάρχει ακόμη σάρωση. Τρέξε <code>scripts/ministry-scan/weekly.sh</code>.</p>
	</header>
</div>
{:else}
<div class="atlas page">
	<header class="top">
		<h1>Άτλας πρόσβασης</h1>
		<p class="lede">Ποιες ειδικότητες έχουν ραντεβού σε κάθε νομό στον κατάλογο του Υπουργείου, και πόσο μακριά είναι η πλησιέστερη όταν λείπει.</p>
	</header>

	<SelectionBar
		{data}
		{selection}
		onChange={(s) => select(s)}
		onReset={reset}
	/>

	<WeeklyBriefing report={data} onSelect={applyFinding} />

	<section class="mapblock" aria-label="Χάρτης κάλυψης">
		<div class="choro"><PrefectureChoropleth {data} boundaries={page.boundaries} {selection} onSelect={pickPrefecture} /></div>
		<div class="side"><MetricSummary {data} {selection} /></div>
	</section>

	<div class="explorer">
		<div class="pane list">
			<CoverageList {data} {selection} {sort} onSort={(m) => (sort = m)} {selectedKey} onSelect={(k) => (selectedKey = selectedKey === k ? null : k)} />
		</div>
		<div class="pane map">
			<AccessMap {data} {selection} {selectedKey} onSelect={openCell} />
		</div>
	</div>

	<WaitDistribution {data} {selection} onSelect={openCell} />

	<details class="more">
		<summary>Περισσότερα εργαλεία</summary>
		<CoverageMatrix {data} sectors={selection.sectors} metric={matrixMetric} onMetric={(m) => (matrixMetric = m)} onSelect={openCell} />
		<section class="pair">
			<SpecialtyCoverageBars {data} sectors={selection.sectors} selectedSpecialtyId={selection.specialtyId} onSelect={pickSpecialty} />
			<CoverageRanking {data} {selection} onSelect={pickPrefecture} />
		</section>
		<ScanChangeChart report={data} />
	</details>

	<MethodologyBlock report={data} />
</div>
{/if}

<style>
	.page {
		min-height: 100dvh;
		padding: clamp(1.25rem, 4vw, 2.5rem) clamp(1rem, 4vw, 2rem) 4rem;
		display: grid;
		gap: 1.6rem;
		max-width: 1280px;
		margin: 0 auto;
	}
	.top {
		max-width: 640px;
	}
	h1 {
		font-size: clamp(2rem, 5vw, 2.8rem);
		line-height: 1.05;
		margin-bottom: 0.6rem;
	}
	.lede {
		margin: 0;
		color: var(--ink-2);
		max-width: 56ch;
		text-wrap: pretty;
	}
	.mapblock,
	.pair,
	.explorer {
		display: grid;
		gap: 1.5rem;
		align-items: start;
	}
	@media (min-width: 900px) {
		.mapblock {
			grid-template-columns: minmax(0, 1.4fr) minmax(280px, 0.6fr);
		}
		.explorer {
			grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
		}
		.pair {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			gap: 2.5rem;
		}
		/* Sit under the sticky selection bar. */
		.mapblock .side,
		.pane.map {
			position: sticky;
			top: 7rem;
		}
	}
	@media (max-width: 899px) {
		/* On phones the choropleth is the map; the point map would be a second one. */
		.pane.map {
			display: none;
		}
	}
	.more {
		border-top: 1px solid var(--line);
		padding-top: 1rem;
		display: grid;
		gap: 2rem;
	}
	.more summary {
		cursor: pointer;
		font-weight: 600;
		font-size: 1.05rem;
	}
</style>
