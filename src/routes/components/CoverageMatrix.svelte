<script lang="ts">
	import type { AtlasData, CoverageCell, Metric, Prefecture, Sector, Specialty } from '$lib/atlas/types';
	import {
		buildIndex,
		cellKey,
		daysFromScan,
		earliestFor,
		fmtDay,
		fmtInt,
		fmtKm,
		fmtOffset,
		fmtPer100k,
		fmtWaitCompact,
		mixOklab,
		readableText,
		METRICS,
		METRIC_LABEL,
		nearestFor,
		prefLabel,
		sumCounts,
		titleCase
	} from './format';
	import { downloadText } from './download';
	import { toCsv } from './format';

	let {
		data,
		sectors,
		metric,
		onMetric,
		onSelect,
		compact = false,
		prefectureId = null,
		onPrefectureChange = (_id: number) => {}
	}: {
		data: AtlasData;
		sectors: Sector[];
		metric: Metric;
		onMetric: (m: Metric) => void;
		onSelect: (key: string) => void;
		compact?: boolean;
		prefectureId?: number | null;
		onPrefectureChange?: (id: number) => void;
	} = $props();

	interface Val {
		key: string;
		count: number;
		per100k: number | null;
		nearestKm: number | null;
		earliestDate: string | null;
		days: number | null;
		v: number | null;
		zero: boolean;
		unknown: boolean;
		flagged: boolean;
	}

	const uid = $props.id();
	const idx = $derived(buildIndex(data));
	const flagKm = $derived(data.distanceFlagKm);
	let matrixEl = $state<HTMLElement | null>(null);
	let availableWidth = $state(1100);
	let prefPage = $state(0);
	let big = $state(false);
	let overlay = $state<HTMLElement | null>(null);
	let opener: HTMLElement | null = null;
	let focusedCell = $state<{ s: number; p: number } | null>(null);

	function compute(cell: CoverageCell | undefined, pref: Prefecture, spec: Specialty): Val {
		const key = cellKey(pref.id, spec.id);
		if (!cell) return { key, count: 0, per100k: null, nearestKm: null, earliestDate: null, days: null, v: null, zero: false, unknown: true, flagged: false };
		const count = sumCounts(cell.counts, sectors);
		const per100k = pref.population > 0 ? (count / pref.population) * 100_000 : null;
		const near = nearestFor(idx, cell, sectors);
		const earliestDate = earliestFor(idx, cell, sectors);
		const days = daysFromScan(earliestDate, data.scan.at);
		let v: number | null = null;
		let zero = false;
		let unknown = false;
		switch (metric) {
			case 'count': v = count; zero = count === 0; break;
			case 'per100k': v = per100k; zero = count === 0; unknown = per100k == null; break;
			case 'nearestKm': v = near.km; unknown = near.unknown; break;
			case 'earliestDate': v = days; zero = days == null && count === 0; unknown = days == null && !zero; break;
		}
		return { key, count, per100k, nearestKm: near.km, earliestDate, days, v, zero, unknown, flagged: near.km != null && near.km > flagKm };
	}

	const values = $derived(data.specialties.map((spec) => data.prefectures.map((pref) => compute(idx.cellByKey.get(cellKey(pref.id, spec.id)), pref, spec))));
	const ceiling = $derived.by(() => {
		const xs = values.flat().map((cell) => cell.v).filter((value): value is number => value != null && value > 0).sort((a, b) => a - b);
		return xs.length ? xs[Math.min(xs.length - 1, Math.floor(xs.length * 0.95))] || 1 : 1;
	});
	const tone = (value: number | null) => value == null || value <= 0 ? 0 : Math.min(1, Math.sqrt(value / ceiling));
	const darkIsWorse = $derived(metric === 'nearestKm' || metric === 'earliestDate');
	// Hex twins of --ink and --accent-d, for picking the digit colour in script.
	const toneHex = $derived(darkIsWorse ? '#152c3b' : '#164e78');

	let sortPref = $state<number | null>(null);
	let sortSpec = $state<number | null>(null);
	const compare = (a: number | null, b: number | null) => {
		if (a == null && b == null) return 0;
		if (a == null) return 1;
		if (b == null) return -1;
		return b - a;
	};
	const specOrder = $derived.by(() => {
		const order = data.specialties.map((_, i) => i);
		const pi = sortPref == null ? -1 : data.prefectures.findIndex((pref) => pref.id === sortPref);
		return order.sort((a, b) => pi < 0 ? titleCase(data.specialties[a].name).localeCompare(titleCase(data.specialties[b].name), 'el') : compare(values[a][pi].v, values[b][pi].v) || titleCase(data.specialties[a].name).localeCompare(titleCase(data.specialties[b].name), 'el'));
	});
	const prefOrder = $derived.by(() => {
		const order = data.prefectures.map((_, i) => i);
		const si = sortSpec == null ? -1 : data.specialties.findIndex((spec) => spec.id === sortSpec);
		return order.sort((a, b) => si < 0 ? data.prefectures[a].name.localeCompare(data.prefectures[b].name, 'el') : compare(values[si][a].v, values[si][b].v) || data.prefectures[a].name.localeCompare(data.prefectures[b].name, 'el'));
	});
	// Row header ~230px, each column 22px + 1px border (30px + 1 in the big view).
	const pageSize = $derived(Math.max(1, Math.floor((availableWidth - 230) / (big ? 31 : 23))));
	const pageCount = $derived(Math.max(1, Math.ceil(prefOrder.length / pageSize)));
	const currentPrefOrder = $derived(prefOrder.slice(prefPage * pageSize, (prefPage + 1) * pageSize));
	const pageStart = $derived(prefOrder.length ? prefPage * pageSize + 1 : 0);
	const pageEnd = $derived(Math.min(prefOrder.length, (prefPage + 1) * pageSize));

	const compactPrefectureId = $derived(prefectureId ?? [...data.prefectures].sort((a, b) => a.name.localeCompare(b.name, 'el'))[0]?.id ?? null);
	const selectedPrefIndex = $derived(data.prefectures.findIndex((pref) => pref.id === compactPrefectureId));
	const compactRows = $derived.by(() => {
		if (selectedPrefIndex < 0) return [] as { spec: Specialty; value: Val }[];
		return data.specialties.map((spec, si) => ({ spec, value: values[si][selectedPrefIndex] })).sort((a, b) => compare(a.value.v, b.value.v) || titleCase(a.spec.name).localeCompare(titleCase(b.spec.name), 'el'));
	});
	const readout = $derived.by(() => {
		if (!focusedCell) return null;
		const cell = values[focusedCell.s]?.[focusedCell.p];
		const spec = data.specialties[focusedCell.s];
		const pref = data.prefectures[focusedCell.p];
		return cell && spec && pref ? describe(cell, spec, pref) : null;
	});

	function describe(cell: Val, spec: Specialty, pref: Prefecture): string {
		const facts = [cell.count === 0 ? 'δεν καταγράφηκε πάροχος' : `${fmtInt(cell.count)} σημεία (${fmtPer100k(cell.per100k)} ανά 100 χιλ.)`];
		facts.push(cell.nearestKm == null ? 'απόσταση άγνωστη' : `πλησιέστερος ${fmtKm(cell.nearestKm)}`);
		if (cell.earliestDate) facts.push(`πρώτο ραντεβού ${fmtDay(cell.earliestDate)}`);
		return `${titleCase(spec.name)}, ${prefLabel(pref)}: ${facts.join(' · ')}`;
	}
	function scaleLabel(value: number): string {
		switch (metric) {
			case 'count': return fmtInt(Math.round(value));
			case 'per100k': return fmtPer100k(value);
			case 'nearestKm': return fmtKm(value);
			case 'earliestDate': return fmtOffset(Math.round(value)) || '0 ημ.';
		}
	}
	function cellText(cell: Val): string {
		if (cell.unknown) return '';
		if (cell.zero) return '0';
		if (cell.v == null) return '';
		switch (metric) {
			case 'count': return fmtInt(cell.v);
			case 'per100k': return cell.v >= 10 ? fmtInt(Math.round(cell.v)) : fmtPer100k(cell.v);
			case 'nearestKm': return fmtInt(Math.round(cell.v));
			case 'earliestDate': return String(Math.round(cell.v));
		}
	}
	function compactValue(cell: Val): string {
		if (cell.unknown) return 'Χωρίς στοιχεία';
		// A prefecture without a site still has a nearest one: that is what «Απόσταση» is for.
		if (metric === 'nearestKm') return cell.nearestKm == null ? 'Χωρίς στοιχεία' : fmtKm(cell.nearestKm);
		if (cell.count === 0) return '0 σημεία';
		switch (metric) {
			case 'count': return `${fmtInt(cell.count)} σημεία`;
			case 'per100k': return `${fmtPer100k(cell.per100k)} ανά 100.000 κατοίκους`;
			case 'earliestDate': return fmtWaitCompact(cell.earliestDate, data.scan.at);
		}
		return '';
	}
	function openBig(event: MouseEvent) { opener = event.currentTarget as HTMLElement; big = true; }
	function closeBig() { big = false; overlay = null; opener?.focus(); }
	function pick(key: string) { if (big) closeBig(); onSelect(key); }
	function exportCsv() {
		const head = ['Ειδικότητα', ...data.prefectures.map((pref) => pref.name)];
		const body = data.specialties.map((spec, si) => [titleCase(spec.name), ...data.prefectures.map((_, pi) => cellText(values[si][pi]))]);
		downloadText(`atlas-πίνακας-${data.scan.at.slice(0, 10)}.csv`, toCsv([head, ...body]));
	}
	const FOCUSABLE = 'button:not([disabled]), [href], input, select, [tabindex]:not([tabindex="-1"])';
	function trap(event: KeyboardEvent) {
		if (event.key === 'Escape') { event.preventDefault(); closeBig(); return; }
		if (event.key !== 'Tab' || !overlay) return;
		const items = [...overlay.querySelectorAll<HTMLElement>(FOCUSABLE)];
		if (!items.length) return;
		const first = items[0];
		const last = items[items.length - 1];
		if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
		else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
	}

	// The desktop matrix mounts only after `compact` turns false, so observe it whenever it
	// appears rather than once at mount.
	$effect(() => {
		const el = matrixEl;
		if (!el) return;
		const measure = () => (availableWidth = Math.max(320, el.getBoundingClientRect().width));
		measure();
		if (typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver(measure);
		observer.observe(el);
		return () => observer.disconnect();
	});
	$effect(() => { if (prefPage >= pageCount) prefPage = pageCount - 1; });
	$effect(() => { if (big) overlay?.querySelector<HTMLElement>('.close')?.focus(); });
</script>

{#if compact}
	<section class="compact-matrix" aria-labelledby={`${uid}-compact-title`}>
		<h2 id={`${uid}-compact-title`}>Κάλυψη ανά νομό</h2>
		<div class="compact-controls">
			<label for={`${uid}-matrix-pref`}>Νομός
				<select id={`${uid}-matrix-pref`} value={compactPrefectureId ?? ''} onchange={(event) => onPrefectureChange(Number((event.currentTarget as HTMLSelectElement).value))}>
					{#each data.prefectures as pref (pref.id)}<option value={pref.id}>{pref.name}</option>{/each}
				</select>
			</label>
			<label for={`${uid}-matrix-metric`}>Μέτρηση
				<select id={`${uid}-matrix-metric`} value={metric} onchange={(event) => onMetric((event.currentTarget as HTMLSelectElement).value as Metric)}>
					<option value="count">Σημεία</option>
					<option value="per100k">Ανά 100.000 κατοίκους</option>
					<option value="earliestDate">Αναμονή</option>
					<option value="nearestKm">Απόσταση</option>
				</select>
			</label>
		</div>
		<ol class="compact-rows">
			{#each compactRows as item (item.spec.id)}
				<li><div><span class="compact-name">{titleCase(item.spec.name)}</span><span class="compact-number">{compactValue(item.value)}</span></div><button type="button" onclick={() => onSelect(item.value.key)}>Δες στη λίστα</button></li>
			{/each}
		</ol>
	</section>
{:else}
	<section class="matrix" bind:this={matrixEl} style:--tone-ink={darkIsWorse ? 'var(--ink)' : 'var(--accent-d)'} aria-labelledby={`${uid}-matrix-title`}>
		<div class="bar"><h2 id={`${uid}-matrix-title`}>Κάλυψη ανά ειδικότητα και νομό</h2><div class="metrics" role="group" aria-label="Μετρική">{#each METRICS as item (item)}<button type="button" class:on={metric === item} aria-pressed={metric === item} onclick={() => onMetric(item)}>{METRIC_LABEL[item]}</button>{/each}</div><button type="button" class="tool" onclick={exportCsv}>CSV</button><button type="button" class="tool" aria-haspopup="dialog" onclick={openBig}>Μεγάλη προβολή</button></div>
		<p class="readout" aria-live="polite">{readout ?? 'Επίλεξε ένα κελί για τις τιμές. Σκούρο σημαίνει μεγαλύτερη τιμή.'}</p>
		<div class="pagination"><button type="button" disabled={prefPage === 0} onclick={() => (prefPage = Math.max(0, prefPage - 1))}>Προηγούμενοι νομοί</button><span>Νομοί {pageStart} έως {pageEnd} από {prefOrder.length}</span><button type="button" disabled={prefPage >= pageCount - 1} onclick={() => (prefPage = Math.min(pageCount - 1, prefPage + 1))}>Επόμενοι νομοί</button></div>
		<div class="scroll"><table><thead><tr><th class="corner"><button type="button" class="hbtn" onclick={() => { sortPref = null; sortSpec = null; }}>Ειδικότητα ↓ · Νομός →</button></th>{#each currentPrefOrder as pi (data.prefectures[pi].id)}{@const pref = data.prefectures[pi]}<th class="col" class:on={sortPref === pref.id}><button type="button" class="hbtn vert" onclick={() => (sortPref = sortPref === pref.id ? null : pref.id)} title={`Ταξινόμηση ειδικοτήτων κατά ${prefLabel(pref)}`}><span>{pref.name}</span></button></th>{/each}</tr></thead><tbody>{#each specOrder as si (data.specialties[si].id)}{@const spec = data.specialties[si]}<tr><th class="row" class:on={sortSpec === spec.id}><button type="button" class="hbtn" onclick={() => (sortSpec = sortSpec === spec.id ? null : spec.id)}>{titleCase(spec.name)}</button></th>{#each currentPrefOrder as pi (data.prefectures[pi].id)}{@const cell = values[si][pi]}{@const t = cell.unknown || cell.zero ? 0 : tone(cell.v)}<td><button type="button" class="cell" class:zero={cell.zero && !cell.unknown} class:unknown={cell.unknown} class:flag={cell.flagged} class:has={!cell.zero && !cell.unknown} style:--t={t} style:color={t > 0 ? readableText(mixOklab('#ffffff', toneHex, t)) : undefined} aria-label={describe(cell, spec, data.prefectures[pi])} onmouseenter={() => (focusedCell = { s: si, p: pi })} onfocus={() => (focusedCell = { s: si, p: pi })} onmouseleave={() => (focusedCell = null)} onclick={() => pick(cell.key)}>{cellText(cell)}</button></td>{/each}</tr>{/each}</tbody></table></div>
		<div class="legend"><span><i class="sw zero"></i>0, δεν καταγράφηκε πάροχος</span><span><i class="sw hatch"></i>χωρίς μέτρηση</span>{#if metric === 'nearestKm'}<span><i class="sw flagsw"></i>πάνω από {flagKm} χλμ από την έδρα</span>{/if}{#if metric === 'earliestDate'}<span>Οι ημέρες μετρούν από τη σάρωση.</span>{/if}</div>
	</section>
	{#if big}
		<div class="overlay" bind:this={overlay} role="dialog" aria-modal="true" aria-labelledby={`${uid}-big-title`} tabindex="-1" onkeydown={trap}>
			<div class="dialog"><div class="dialog-head"><h2 id={`${uid}-big-title`}>Πίνακας σύγκρισης</h2><button type="button" class="close" aria-label="Κλείσιμο" onclick={closeBig}>×</button></div><div class="pagination"><button type="button" disabled={prefPage === 0} onclick={() => (prefPage = Math.max(0, prefPage - 1))}>Προηγούμενοι νομοί</button><span>Νομοί {pageStart} έως {pageEnd} από {prefOrder.length}</span><button type="button" disabled={prefPage >= pageCount - 1} onclick={() => (prefPage = Math.min(pageCount - 1, prefPage + 1))}>Επόμενοι νομοί</button></div><div class="dialog-table"><table class="digits"><thead><tr><th class="corner">Ειδικότητα</th>{#each currentPrefOrder as pi (data.prefectures[pi].id)}<th class="col"><span>{data.prefectures[pi].name}</span></th>{/each}</tr></thead><tbody>{#each specOrder as si (data.specialties[si].id)}<tr><th class="row">{titleCase(data.specialties[si].name)}</th>{#each currentPrefOrder as pi (data.prefectures[pi].id)}{@const cell = values[si][pi]}<td><button type="button" class="cell" class:zero={cell.zero && !cell.unknown} class:unknown={cell.unknown} onclick={() => pick(cell.key)}>{cellText(cell)}</button></td>{/each}</tr>{/each}</tbody></table></div></div>
		</div>
	{/if}
{/if}

<style>
	.compact-matrix, .matrix { display: grid; gap: 0.7rem; min-width: 0; scroll-margin-top: calc(var(--atlas-bar-height, 0px) + 12px); }
	h2 { font-size: clamp(1.35rem, 3vw, 1.8rem); }
	.compact-controls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.6rem; }
	.compact-controls label { display: grid; gap: 0.25rem; color: var(--ink-2); font-size: 0.8rem; font-weight: 600; }
	.compact-controls select { width: 100%; min-width: 0; max-width: 100%; min-height: 44px; box-sizing: border-box; border: 1px solid var(--line-2); border-radius: var(--r-ctl); background: var(--card); color: var(--ink); padding: 0 0.5rem; font: inherit; font-size: 16px; }
	.compact-rows { list-style: none; margin: 0; padding: 0; min-width: 0; }
	.compact-rows li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.8rem; align-items: center; padding: 0.65rem 0; border-bottom: 1px solid var(--line); min-width: 0; }
	.compact-rows li > div { min-width: 0; }
	.compact-name { display: block; overflow-wrap: anywhere; font-weight: 600; }
	.compact-number { display: block; margin-top: 0.15rem; color: var(--ink-2); font-size: 0.82rem; font-variant-numeric: tabular-nums; }
	.compact-rows button, .pagination button, .tool { min-height: 44px; border: 1px solid var(--line-2); border-radius: var(--r-ctl); background: var(--card); color: var(--ink-2); padding: 0 0.7rem; font: inherit; font-size: 0.8rem; font-weight: 600; cursor: pointer; }
	.compact-rows button { white-space: nowrap; }
	.bar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem 1rem; min-width: 0; }
	.bar h2 { margin-right: auto; }
	.metrics { display: inline-flex; overflow: hidden; border: 1px solid var(--line-2); border-radius: var(--r-ctl); }
	.metrics button { min-height: 44px; border: 0; border-right: 1px solid var(--line-2); background: var(--card); color: var(--ink-2); padding: 0 0.7rem; font: inherit; font-size: 0.8rem; cursor: pointer; }
	.metrics button:last-child { border-right: 0; }
	.metrics button.on { background: var(--ink); color: var(--paper); }
	.readout { margin: 0; color: var(--ink-2); font-size: 0.86rem; }
	.pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; color: var(--ink-2); font-size: 0.8rem; font-variant-numeric: tabular-nums; }
	.pagination button:disabled { opacity: 0.45; cursor: default; }
	.scroll, .dialog-table { max-width: 100%; overflow: hidden; border: 1px solid var(--line); border-radius: 10px; background: var(--card); }
	table { border-collapse: separate; border-spacing: 0; font-size: 0.78rem; max-width: 100%; }
	th { position: sticky; z-index: 2; background: var(--card); padding: 0; font-weight: 500; text-align: left; }
	thead th { top: 0; vertical-align: bottom; border-bottom: 1px solid var(--line-2); }
	th.corner { left: 0; z-index: 3; min-width: 10rem; color: var(--ink-3); font-size: 0.72rem; }
	th.row { left: 0; min-width: 10rem; border-right: 1px solid var(--line-2); white-space: nowrap; }
	th.col { width: 22px; min-width: 22px; }
	.hbtn { width: 100%; border: 0; background: none; color: inherit; padding: 0.35rem 0.6rem; font: inherit; text-align: left; cursor: pointer; }
	.hbtn:hover, th.on .hbtn { color: var(--accent-d); }
	.vert { height: 8.5rem; display: flex; align-items: flex-end; justify-content: center; padding: 0.3rem 0; writing-mode: vertical-rl; white-space: nowrap; }
	.cell { position: relative; width: 22px; height: 22px; min-height: 22px; border: 0; border-right: 1px solid var(--paper-2); border-bottom: 1px solid var(--paper-2); background: var(--card); color: var(--ink); padding: 0; font: inherit; font-size: 0.66rem; font-variant-numeric: tabular-nums; cursor: pointer; }
	.cell.has { background: color-mix(in oklab, var(--card), var(--tone-ink) calc(var(--t) * 100%)); }
	.cell.zero { background: var(--paper); color: var(--ink-3); }
	.cell.unknown { background: var(--hatch), var(--card); }
	.cell.flag::after { content: ''; position: absolute; left: 3px; right: 3px; bottom: 2px; height: 2px; background: var(--urgent); }
	.cell:hover, .cell:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; z-index: 1; }
	.legend { display: flex; flex-wrap: wrap; gap: 0.4rem 1.2rem; color: var(--ink-2); font-size: 0.76rem; }
	.legend span { display: inline-flex; align-items: center; gap: 0.4rem; }
	.sw { display: inline-block; width: 16px; height: 12px; border: 1px solid var(--line); border-radius: 2px; background: color-mix(in oklab, var(--card), var(--tone-ink) 35%); }
	.sw.zero { background: var(--paper); }
	.sw.hatch { background: var(--hatch), var(--card); }
	.sw.flagsw { border-bottom: 3px solid var(--urgent); }
	.overlay { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; background: color-mix(in srgb, var(--ink) 34%, transparent); padding: 1rem; }
	.dialog { width: min(100%, 1200px); max-height: 90dvh; display: grid; gap: 0.7rem; overflow: hidden; padding: 1rem; border-radius: var(--r-box); background: var(--paper); }
	.dialog-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
	.close { width: 44px; height: 44px; border: 1px solid var(--line-2); border-radius: 50%; background: var(--card); color: var(--ink); font-size: 1.4rem; cursor: pointer; }
	table.digits .cell { width: 30px; height: 30px; min-height: 30px; }
	@media (max-width: 899px) {
		.compact-controls { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
	}
</style>
