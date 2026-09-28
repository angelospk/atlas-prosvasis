<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { pushState, replaceState } from '$app/navigation';
	import { readAtlasUrl, writeAtlasUrl, type MapMetric } from '$lib/atlas/url';
	import AtlasNav from './components/AtlasNav.svelte';
	import AtlasFooter from './components/AtlasFooter.svelte';
	import ShareWidget from './components/ShareWidget.svelte';
	import './components/atlas.css';
	import type { AtlasReport, Metric, PrefectureBoundaries, Selection } from '$lib/atlas/types';
	import { SECTORS } from '$lib/atlas/types';
	import { calculateActiveSection, SECTION_IDS, SECTION_ORDER, type Section } from './components/navigation';
	import { parseKey } from './components/format';
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
	let mapMetric = $state<MapMetric>('coverage');
	let syncingUrl = false;
	let scrollLockUntil = 0;
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
	// The phone matrix follows the chosen prefecture until its own picker is used.
	const effectiveMatrixPrefectureId = $derived(matrixPrefectureId ?? selection.prefectureId ?? firstMatrixPrefectureId);

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
		/** Switch the prefecture map to this metric and scroll to it. */
		mapMetric?: MapMetric;
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
			if (request.mapMetric) mapMetric = request.mapMetric;
			const pushed = syncUrl(true);
			coverageExpanded = false;
			if (request.openPointMap) pointMapOpen = true;
			const requestedKey = request.focusKey ?? null;
			selectedKey = request.mapKey !== undefined ? request.mapKey : requestedKey;
			if (requestedKey && compact) coverageExpanded = true;
			await tick();
			if (!alive || token !== requestToken) return;
			updating = false;
			await tick();
			if (!alive || token !== requestToken) return;
			if (request.openPointMap) focusPointMap();
			else if (request.mapMetric) navigate('map', !pushed);
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
		scrollLockUntil = Date.now() + 1200; syncUrl(false, 'atlas-point-map');
		pointHeading.scrollIntoView({ behavior: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
		pointHeading.focus({ preventScroll: true });
	}

	// «Δες το στον χάρτη» goes to the prefecture map; «Δες αναλυτικά» to the finding's sites on the point map.
	function applyFinding(partial: Partial<Selection>, evidenceKey: string | null, target: 'map' | 'points') {
		const next = { ...selection, ...partial, sectors: partial.sectors?.length ? [...partial.sectors] : [...selection.sectors] };
		requestSelection(next, target === 'points' ? { focusKey: evidenceKey, mapKey: evidenceKey, openPointMap: true } : { focusKey: null, mapKey: evidenceKey, mapMetric: 'coverage' });
	}
	function pickPrefecture(prefectureId: number) { requestSelection({ ...selection, prefectureId }); }
	function pickSpecialty(specialtyId: number | null) { requestSelection({ ...selection, specialtyId }); }
	// On the map a second tap on the chosen prefecture goes back to all of Greece.
	function togglePrefecture(prefectureId: number) { requestSelection({ ...selection, prefectureId: selection.prefectureId === prefectureId ? null : prefectureId }); }
	function openCell(key: string) {
		const parsed = parseKey(key);
		if (!parsed) return;
		requestSelection({ ...selection, prefectureId: parsed.prefectureId, specialtyId: parsed.specialtyId }, { focusKey: parsed.prefectureId == null ? null : key, mapKey: key });
	}
	// From the waits: the prefecture map, coloured by mean wait. Waits are per specialty, so
	// without one (no key) the map shows coverage instead.
	function showWaitOnMap(key: string | null) {
		const parsed = key ? parseKey(key) : null;
		const next = parsed ? { ...selection, prefectureId: parsed.prefectureId, specialtyId: parsed.specialtyId } : selection;
		requestSelection(next, { focusKey: null, mapKey: key, mapMetric: parsed ? 'mean' : 'coverage' });
	}
	function reset() { requestSelection({ ...DEFAULT, sectors: [...SECTORS] }, { focusKey: null, mapKey: null }); }
	function toggleCoverage(key: string | null) { selectedKey = key != null && selectedKey !== key ? key : null; }
	function changeSort(next: Metric) { sort = next; coverageExpanded = false; selectedKey = null; }
	/** Returns whether a new history entry was pushed. */
	function syncUrl(push = false, hash?: string): boolean {
  if (!mounted || syncingUrl) return false;
  const url = writeAtlasUrl(new URL(window.location.href), selection, mapMetric);
  if (hash) url.hash = hash;
  if (url.href === window.location.href) return false;
  (push ? pushState : replaceState)(url, {});
  return push;
 }
 function setMetric(metric: MapMetric) { mapMetric = metric; syncUrl(true); }
 // push = false when the selection change already made its own history entry.
 function navigate(section: Section, push = true) {
  if (section === 'details') toolsOpen = true;
  activeSection = section;
  scrollLockUntil = Date.now() + 1200;
  syncUrl(push, SECTION_IDS[section]);
  void tick().then(() => document.getElementById(SECTION_IDS[section])?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
 }
 async function restoreUrl() {
  if (!data) return;
  syncingUrl = true;
  ++requestToken;
  pendingSelection = null; updating = false;
  const state = readAtlasUrl(new URL(window.location.href), data);
  selection = state.selection; mapMetric = state.metric; selectedKey = focusKey(selection);
  coverageExpanded = selectedKey != null;
  const hash = window.location.hash.slice(1);
  if (hash === 'atlas-details') toolsOpen = true;
  if (hash === 'atlas-point-map') pointMapOpen = true;
  const section = SECTION_ORDER.find((s) => SECTION_IDS[s] === hash);
  if (section) activeSection = section;
  scrollLockUntil = Date.now() + 1200;
  await tick(); await nextFrame();
  if (!alive) return;
  if (hash) document.getElementById(hash)?.scrollIntoView({ behavior: 'instant' });
  syncingUrl = false;
 }
	function togglePointMap() {
		pointMapOpen = !pointMapOpen;
		if (!pointMapOpen) return;
		void tick().then(focusPointMap);
	}

	function updateActiveSection() {
		if (typeof window === 'undefined' || typeof document === 'undefined' || syncingUrl || Date.now() < scrollLockUntil) return;
		const starts = SECTION_ORDER.map((section) => {
			const element = document.getElementById(SECTION_IDS[section]);
			return element ? { section, top: element.getBoundingClientRect().top } : null;
		}).filter((start): start is { section: Section; top: number } => start != null);
		const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
		const next = calculateActiveSection(starts, barHeight + 12, atBottom);
		if (activeSection !== next) { activeSection = next; syncUrl(false, SECTION_IDS[next]); }
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
		void restoreUrl();
		window.addEventListener('popstate', restoreUrl);
		window.addEventListener('hashchange', restoreUrl);
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
			window.removeEventListener('popstate', restoreUrl);
			window.removeEventListener('hashchange', restoreUrl);
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
	<title>Άτλας πρόσβασης · Δημόσια ιατρική φροντίδα, νομό προς νομό</title>
	<meta name="description" content="Ανοιχτά δεδομένα από το e-ραντεβού: ποιες ειδικότητες καλύπτει η δημόσια ασφάλιση σε κάθε νομό, πόσο απέχουν και πόσο περιμένεις για ραντεβού." />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Source+Serif+4:wght@600;700&display=swap" />
</svelte:head>

{#if !data}
	<div class="atlas page"><header class="top"><h1>Άτλας πρόσβασης</h1><p class="lede">Δεν υπάρχει ακόμη σάρωση. Τρέξε <code>scripts/ministry-scan/weekly.sh</code>.</p></header></div>
{:else}
	<div class="atlas site">
  <a class="skip-link" href="#atlas-map">Μετάβαση στον χάρτη</a>
  <AtlasNav {data} selection={pendingSelection ?? selection} onChange={requestSelection} onReset={reset} {updating} {activeSection} onNavigate={navigate} onHeightChange={publishBarHeight} />
  <main class="page">
  <header class="top"><div><h1>Δημόσια ιατρική φροντίδα,<br />νομό προς νομό.</h1><p class="lede">Ανοιχτά δεδομένα από το e-ραντεβού του Υπουργείου Υγείας: πού βρίσκεις την ειδικότητα που σου καλύπτει η δημόσια ασφάλιση, πόσο απέχει και πόσες ημέρες μέχρι το πρώτο ραντεβού.</p></div><div class="edition"><strong>{data.prefectures.length} νομοί<span> / </span>{data.specialties.length} ειδικότητες</strong><span>Σάρωση {new Date(data.scan.at).toLocaleDateString('el-GR', { timeZone: 'UTC' })}</span></div></header>

		<div class="results" aria-busy={updating}>
			<div class="briefing"><WeeklyBriefing report={data} onSelect={applyFinding} /><ShareWidget widget="briefing" {selection} /></div>

			<section id="atlas-map" class="mapblock" aria-label="Χάρτης κάλυψης">
				<div class="choro"><PrefectureChoropleth {data} boundaries={page.boundaries} selection={selection} onSelect={togglePrefecture} metric={mapMetric} onMetric={setMetric} /><ShareWidget widget="coverage" {selection} metric={mapMetric} /></div>
				<div class="side"><MetricSummary {data} {selection} /><ShareWidget widget="summary" {selection} /></div>
			</section>

			<div class="explorer">
				<div class="pane list">
					<CoverageList data={data} selection={selection} {sort} onSort={changeSort} {selectedKey} onSelect={toggleCoverage} {compact} expanded={coverageExpanded} onExpandedChange={(next) => (coverageExpanded = next)} /><ShareWidget widget="list" {selection} />
				</div>
				<div class="pane map">
					<div class="point-map-controls">
						{#if compact}<button type="button" aria-expanded={pointMapOpen} aria-controls="atlas-point-map" onclick={togglePointMap}>{pointMapOpen ? 'Απόκρυψη χάρτη σημείων' : 'Εμφάνιση χάρτη σημείων'}</button>{/if}
					</div>
					{#if !compact || pointMapOpen}
						<section id="atlas-point-map" class="point-map-panel" aria-labelledby="atlas-point-map-heading">
							<h2 id="atlas-point-map-heading" tabindex="-1" bind:this={pointHeading}>Χάρτης σημείων</h2>
							<AccessMap data={data} selection={selection} {selectedKey} onSelect={openCell} /><ShareWidget widget="points" {selection} />
						</section>
					{/if}
				</div>
			</div>

			<div class="wait-section"><WaitDistribution data={data} {selection} onShowOnMap={showWaitOnMap} specialtyPicker={false} /><ShareWidget widget="waits" {selection} /></div>

			<details id="atlas-details" class="more" bind:open={toolsOpen} ontoggle={() => { toolsOpen = (document.getElementById('atlas-details') as HTMLDetailsElement | null)?.open ?? toolsOpen; void tick().then(() => { rebuildSectionObserver(); updateActiveSection(); }); }}>
				<summary>Αναλυτικά</summary>
				<CoverageMatrix data={data} sectors={selection.sectors} metric={matrixMetric} onMetric={(metric) => (matrixMetric = metric)} onSelect={openCell} {compact} prefectureId={effectiveMatrixPrefectureId} onPrefectureChange={(id) => (matrixPrefectureId = id)} /><ShareWidget widget="matrix" {selection} />
				<section class="pair"><div><SpecialtyCoverageBars data={data} sectors={selection.sectors} selectedSpecialtyId={selection.specialtyId} onSelect={pickSpecialty} /><ShareWidget widget="specialties" {selection} /></div><div><CoverageRanking data={data} selection={selection} onSelect={pickPrefecture} /><ShareWidget widget="ranking" {selection} /></div></section>
				<ScanChangeChart report={data} /><ShareWidget widget="changes" {selection} />
			</details>

			<MethodologyBlock report={data} /><AtlasFooter />
		</div>
	</main></div>
{/if}

<style>
	.page { min-height: 100dvh; padding: clamp(1.25rem, 4vw, 2.5rem) clamp(1rem, 4vw, 2rem) 4rem; display: grid; gap: 1.6rem; max-width: 1360px; margin: 0 auto; min-width: 0; }
	.top { display:grid; grid-template-columns:1.5fr 1fr; gap:2rem; align-items:end; min-width:0; padding:1.8rem 0 1.5rem; border-bottom:1px solid var(--line-2); }
 .edition { display:grid; gap:.7rem; justify-self:end; font-size:.8rem; color:var(--ink-3); } .edition strong { font-size:1.1rem; color:var(--ink); font-weight:500; } .edition strong span { color:var(--line-2); padding:0 .3rem; }
	h1 { font-size: clamp(2.8rem, 6vw, 4.8rem); line-height: 1.05; margin-bottom: 0.6rem; }
	.lede { margin: 0; color: var(--ink-2); max-width: 56ch; text-wrap: pretty; }
	.results { display: grid; gap: 3rem; min-width: 0; transition: opacity 120ms ease; }
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
		.results { gap: 2rem; }
 .top { grid-template-columns:1fr; padding:.5rem 0 1rem; gap:1.2rem; } .edition { justify-self:start; gap:.3rem; }
		.point-map-panel h2 { margin-top: 0.2rem; }
	}
</style>
