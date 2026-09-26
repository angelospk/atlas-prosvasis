<script lang="ts">
	import { onMount, tick } from 'svelte';
	import './components/atlas.css';
	import type { AtlasReport, Metric, PrefectureBoundaries, Selection } from '$lib/atlas/types';
	import { SECTORS } from '$lib/atlas/types';
	import { calculateActiveSection, SECTION_IDS, SECTION_ORDER, type Section } from './components/navigation';
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

	const DEFAULT: Selection = { mode: 'place', prefectureId: null, specialtyId: null, sectors: [...SECTORS] };
	let selection = $state<Selection>({ ...DEFAULT, sectors: [...SECTORS] });
	let pendingSelection = $state<Selection | null>(null);
	let updating = $state(false);
	let sort = $state<Metric>('count');
	let matrixMetric = $state<Metric>('count');
	let selectedKey = $state<string | null>(null);
	let expandedWaitKey = $state<string | null>(null);
	let coverageExpanded = $state(false);
	let matrixPrefectureId = $state<number | null>(null);
	let compact = $state(true);
	let pointMapOpen = $state(false);
	let toolsOpen = $state(false);
	let activeSection = $state<Section>('map');
	let barHeight = $state(0);
	let pointHeading = $state<HTMLElement | null>(null);
	let requestToken = 0;
	let mounted = false;
	let alive = true;
	const pendingFrames = new Set<number>();
	let sectionObserver: IntersectionObserver | null = null;

	const withMode = (s: Selection): Selection => ({
		...s,
		sectors: [...s.sectors],
		mode: s.specialtyId != null && s.prefectureId == null ? 'specialty' : 'place'
	});
	const focusKey = (s: Selection) => s.prefectureId != null && s.specialtyId != null ? `${s.prefectureId}:${s.specialtyId}` : null;
	const firstMatrixPrefectureId = $derived(data ? [...data.prefectures].sort((a, b) => a.name.localeCompare(b.name, 'el'))[0]?.id ?? null : null);
	const effectiveMatrixPrefectureId = $derived(matrixPrefectureId ?? firstMatrixPrefectureId);

	function nextFrame(): Promise<void> {
		if (typeof requestAnimationFrame === 'undefined') return Promise.resolve();
		return new Promise((resolve) => {
			const id = requestAnimationFrame(() => {
				pendingFrames.delete(id);
				resolve();
			});
			pendingFrames.add(id);
		});
	}

	type SelectionRequest = {
		focusKey?: string | null;
		mapKey?: string | null;
		openPointMap?: boolean;
	};

	function requestSelection(next: Selection, request: SelectionRequest = {}) {
		const token = ++requestToken;
		const candidate = withMode(next);
		pendingSelection = candidate;
		updating = true;
		void (async () => {
			await tick();
			await nextFrame();
			await nextFrame();
			if (!alive || token !== requestToken) return;
			selection = candidate;
			pendingSelection = null;
			expandedWaitKey = null;
			coverageExpanded = false;
			if (request.openPointMap) pointMapOpen = true;
			const requestedKey = request.focusKey !== undefined ? request.focusKey : focusKey(candidate);
			selectedKey = request.mapKey !== undefined ? request.mapKey : requestedKey;
			if (requestedKey && compact) coverageExpanded = true;
			await tick();
			if (!alive || token !== requestToken) return;
			updating = false;
			await tick();
			if (!alive || token !== requestToken) return;
			if (request.openPointMap) focusPointMap();
			else if (requestedKey) showRow(requestedKey);
		})();
	}

	function showRow(key: string) {
		if (typeof document === 'undefined') return;
		const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(key) : key.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
		const element = document.querySelector<HTMLElement>(`.coverage-list .row[data-key="${escaped}"]`);
		if (!element) return;
		element.scrollIntoView({ behavior: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
		element.focus({ preventScroll: true });
	}

	function focusPointMap() {
		if (!pointHeading) return;
		pointHeading.scrollIntoView({ behavior: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
		pointHeading.focus({ preventScroll: true });
	}

	function applyFinding(partial: Partial<Selection>, evidenceKey: string | null) {
		requestSelection({ ...selection, ...partial, sectors: partial.sectors?.length ? [...partial.sectors] : [...selection.sectors] }, { focusKey: evidenceKey });
	}
	function pickPrefecture(prefectureId: number) { requestSelection({ ...selection, prefectureId }); }
	function pickSpecialty(specialtyId: number) { requestSelection({ ...selection, specialtyId }); }
	function openCell(key: string) {
		const parsed = parseKey(key);
		if (!parsed) return;
		requestSelection({ ...selection, prefectureId: parsed.prefectureId, specialtyId: parsed.specialtyId }, { focusKey: parsed.prefectureId == null ? null : key, mapKey: key });
	}
	function showWaitOnMap(key: string) {
		const parsed = parseKey(key);
		if (!parsed) return;
		requestSelection({ ...selection, prefectureId: parsed.prefectureId, specialtyId: parsed.specialtyId }, { focusKey: parsed.prefectureId == null ? null : key, mapKey: key, openPointMap: true });
	}
	function reset() { requestSelection({ ...DEFAULT, sectors: [...SECTORS] }, { focusKey: null, mapKey: null }); }
	function toggleCoverage(key: string | null) { selectedKey = key != null && selectedKey !== key ? key : null; }
	function changeSort(next: Metric) { sort = next; coverageExpanded = false; selectedKey = null; }
	function navigate(section: Section) { if (section === 'details') toolsOpen = true; }
	function togglePointMap() {
		pointMapOpen = !pointMapOpen;
		if (!pointMapOpen) return;
		void tick().then(focusPointMap);
	}

	function updateActiveSection() {
		if (typeof window === 'undefined' || typeof document === 'undefined') return;
		const starts = SECTION_ORDER.map((section) => {
			const element = document.getElementById(SECTION_IDS[section]);
			return element ? { section, top: element.getBoundingClientRect().top } : null;
		}).filter((start): start is { section: Section; top: number } => start != null);
		const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
		activeSection = calculateActiveSection(starts, barHeight + 12, atBottom);
	}
	function rebuildSectionObserver() {
		sectionObserver?.disconnect();
		sectionObserver = null;
		if (!mounted || typeof IntersectionObserver === 'undefined' || typeof document === 'undefined') return;
		const bottomBand = Math.max(80, window.innerHeight - barHeight - 140);
		sectionObserver = new IntersectionObserver(() => updateActiveSection(), {
			root: null,
			rootMargin: `-${barHeight + 12}px 0px -${bottomBand}px 0px`,
			threshold: [0, 1]
		});
		for (const section of SECTION_ORDER) {
			const element = document.getElementById(SECTION_IDS[section]);
			if (element) sectionObserver.observe(element);
		}
		updateActiveSection();
	}
	function publishBarHeight(height: number) {
		if (barHeight === height) return;
		barHeight = height;
		if (mounted) rebuildSectionObserver();
	}

	onMount(() => {
		mounted = true;
		alive = true;
		const media = window.matchMedia('(max-width: 899px)');
		const syncCompact = () => (compact = media.matches);
		syncCompact();
		media.addEventListener?.('change', syncCompact);
		const onScroll = () => updateActiveSection();
		const onResize = () => { syncCompact(); rebuildSectionObserver(); updateActiveSection(); };
		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onResize);
		rebuildSectionObserver();
		updateActiveSection();
		return () => {
			alive = false;
			media.removeEventListener?.('change', syncCompact);
			window.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', onResize);
			sectionObserver?.disconnect();
			sectionObserver = null;
			for (const id of pendingFrames) cancelAnimationFrame(id);
			pendingFrames.clear();
		};
	});
</script>

<svelte:head>
	<title>Άτλας πρόσβασης</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Source+Serif+4:wght@600;700&display=swap" />
</svelte:head>

{#if !data}
	<div class="atlas page"><header class="top"><h1>Άτλας πρόσβασης</h1><p class="lede">Δεν υπάρχει ακόμη σάρωση. Τρέξε <code>scripts/ministry-scan/weekly.sh</code>.</p></header></div>
{:else}
	<div class="atlas page">
		<header class="top"><h1>Άτλας πρόσβασης</h1><p class="lede">Ποιες ειδικότητες έχουν ραντεβού σε κάθε νομό στον κατάλογο του Υπουργείου, και πόσο μακριά είναι η πλησιέστερη όταν λείπει.</p></header>

		<SelectionBar data={data} selection={pendingSelection ?? selection} onChange={requestSelection} onReset={reset} {activeSection} onNavigate={navigate} {updating} onHeightChange={publishBarHeight} />

		<div class="results" aria-busy={updating}>
			<WeeklyBriefing report={data} onSelect={applyFinding} />

			<section id="atlas-map" class="mapblock" aria-label="Χάρτης κάλυψης">
				<div class="choro"><PrefectureChoropleth {data} boundaries={page.boundaries} selection={selection} onSelect={pickPrefecture} /></div>
				<div class="side"><MetricSummary {data} {selection} /></div>
			</section>

			<div class="explorer">
				<div class="pane list">
					<CoverageList data={data} selection={selection} {sort} onSort={changeSort} {selectedKey} onSelect={toggleCoverage} {compact} expanded={coverageExpanded} onExpandedChange={(next) => (coverageExpanded = next)} />
				</div>
				<div class="pane map">
					<div class="point-map-controls">
						{#if compact}<button type="button" aria-expanded={pointMapOpen} aria-controls="atlas-point-map" onclick={togglePointMap}>{pointMapOpen ? 'Απόκρυψη χάρτη σημείων' : 'Εμφάνιση χάρτη σημείων'}</button>{/if}
					</div>
					{#if !compact || pointMapOpen}
						<section id="atlas-point-map" class="point-map-panel" aria-labelledby="atlas-point-map-heading">
							<h2 id="atlas-point-map-heading" tabindex="-1" bind:this={pointHeading}>Χάρτης σημείων</h2>
							<AccessMap data={data} selection={selection} {selectedKey} onSelect={openCell} />
						</section>
					{/if}
				</div>
			</div>

			<WaitDistribution data={data} selection={selection} expandedKey={expandedWaitKey} onToggle={(key) => (expandedWaitKey = expandedWaitKey === key ? null : key)} onShowOnMap={showWaitOnMap} />

			<details id="atlas-details" class="more" bind:open={toolsOpen} ontoggle={() => { toolsOpen = (document.getElementById('atlas-details') as HTMLDetailsElement | null)?.open ?? toolsOpen; void tick().then(() => { rebuildSectionObserver(); updateActiveSection(); }); }}>
				<summary>Αναλυτικά</summary>
				<CoverageMatrix data={data} sectors={selection.sectors} metric={matrixMetric} onMetric={(metric) => (matrixMetric = metric)} onSelect={openCell} {compact} prefectureId={effectiveMatrixPrefectureId} onPrefectureChange={(id) => (matrixPrefectureId = id)} />
				<section class="pair"><SpecialtyCoverageBars data={data} sectors={selection.sectors} selectedSpecialtyId={selection.specialtyId} onSelect={pickSpecialty} /><CoverageRanking data={data} selection={selection} onSelect={pickPrefecture} /></section>
				<ScanChangeChart report={data} />
			</details>

			<MethodologyBlock report={data} />
		</div>
	</div>
{/if}

<style>
	.page { min-height: 100dvh; padding: clamp(1.25rem, 4vw, 2.5rem) clamp(1rem, 4vw, 2rem) 4rem; display: grid; gap: 1.6rem; max-width: 1280px; margin: 0 auto; min-width: 0; }
	.top { max-width: 640px; min-width: 0; }
	h1 { font-size: clamp(2rem, 5vw, 2.8rem); line-height: 1.05; margin-bottom: 0.6rem; }
	.lede { margin: 0; color: var(--ink-2); max-width: 56ch; text-wrap: pretty; }
	.results { display: grid; gap: 1.6rem; min-width: 0; transition: opacity 120ms ease; }
	.results[aria-busy='true'] { opacity: 0.72; }
	.mapblock, .pair, .explorer { display: grid; gap: 1.5rem; align-items: start; min-width: 0; }
	.point-map-panel { display: grid; gap: 0.65rem; min-width: 0; scroll-margin-top: calc(var(--atlas-bar-height, 0px) + 12px); }
	.point-map-panel h2 { font-size: clamp(1.35rem, 3vw, 1.8rem); }
	.point-map-controls { min-width: 0; }
	.point-map-controls button { min-height: 44px; border: 1px solid var(--line-2); border-radius: var(--r-ctl); background: var(--card); color: var(--ink-2); padding: 0 0.8rem; font: inherit; font-size: 0.84rem; font-weight: 600; cursor: pointer; }
	.more { border-top: 1px solid var(--line); padding-top: 1rem; display: grid; gap: 2rem; min-width: 0; scroll-margin-top: calc(var(--atlas-bar-height, 0px) + 12px); }
	.more summary { cursor: pointer; font-weight: 600; font-size: 1.05rem; }
	@media (min-width: 900px) {
		.mapblock { grid-template-columns: minmax(0, 1.4fr) minmax(280px, 0.6fr); }
		.pair { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 2.5rem; }
		.explorer { grid-template-columns: minmax(0, 1.5fr) minmax(320px, 0.7fr); }
		/* The point map stays beside the long list while it scrolls. */
		.mapblock .side, .pane.map { position: sticky; top: calc(var(--atlas-bar-height, 0px) + 12px); }
	}
	@media (max-width: 899px) {
		.results { gap: 1.3rem; }
		.point-map-panel h2 { margin-top: 0.2rem; }
	}
</style>
