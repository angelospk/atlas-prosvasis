<script lang="ts">
	import type { AtlasData, Selection } from '$lib/atlas/types';
	import { buildIndex, fmtDay, fmtInt, fmtStat, parseKey, selectionLabel, toCsv, waitRows } from './format';
	import { downloadText } from './download';

	let {
		data,
		selection,
		expandedKey = null,
		onToggle = (_key: string) => {},
		onShowOnMap = (_key: string) => {}
	}: {
		data: AtlasData;
		selection: Selection;
		expandedKey?: string | null;
		onToggle?: (key: string) => void;
		onShowOnMap?: (key: string) => void;
	} = $props();

	const uid = $props.id();
	const SHOW = 12;
	const idx = $derived(buildIndex(data));
	const rows = $derived(waitRows(data, idx, selection));
	const byPrefecture = $derived(selection.specialtyId != null && selection.prefectureId == null);
	let showingAll = $state(false);
	const shown = $derived(showingAll ? rows : rows.slice(0, SHOW));
	const axisMax = $derived(Math.max(7, Math.ceil(Math.max(0, ...rows.map((r) => r.stats.max)) / 7) * 7));
	const ticks = $derived.by(() => {
		const step = axisMax <= 28 ? 7 : axisMax <= 84 ? 14 : 30;
		const out: number[] = [];
		for (let d = 0; d <= axisMax; d += step) out.push(d);
		return out;
	});
	const pct = (days: number) => `${(days / axisMax) * 100}%`;
	const explanationId = (key: string) => `${uid}-wait-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

	function exportCsv() {
		const head = [byPrefecture ? 'Νομός' : 'Ειδικότητα', 'Σημεία', 'Με ημερομηνία', 'Ελάχιστο', '25%', 'Διάμεσος', 'Μέσος όρος', '75%', 'Μέγιστο'];
		const body = rows.map((r) => {
			const s = r.stats;
			return [r.name, r.sites, s.n, s.min, s.q1, s.median, Math.round(s.mean * 10) / 10, s.q3, s.max];
		});
		const meta = [['Σάρωση', data.scan.at.slice(0, 10), data.scan.source]];
		downloadText(`atlas-αναμονή-${data.scan.at.slice(0, 10)}.csv`, toCsv([...meta, head, ...body]));
	}
</script>

<section id="atlas-waits" class="waits" aria-labelledby={`${uid}-waits-title`}>
	<header class="head">
		<div>
			<h2 id={`${uid}-waits-title`}>Αναμονή ραντεβού</h2>
			<p class="sub">{fmtDay(data.scan.at)} μία τιμή · {selectionLabel(idx, selection)}</p>
		</div>
		<p class="sample-note">Με ημερομηνία / σύνολο σημείων.</p>
	</header>

	{#if rows.length === 0}
		<p class="empty">Κανένα σημείο με ημερομηνία ραντεβού για αυτή την επιλογή.</p>
	{:else}
		<div class="legend" aria-label="Υπόμνημα αναμονής">
			<span><i class="lg-point"></i>Σημείο</span>
			<span><i class="lg-mean"></i>Μέσος όρος</span>
			<span><i class="lg-median"></i>Διάμεσος</span>
			<span><i class="lg-box"></i>Μεσαίο 50%</span>
			<span><i class="lg-whisk"></i>Συνήθες εύρος</span>
			<span><i class="lg-out"></i>Ακραίες τιμές</span>
		</div>
		<div class="axis" aria-hidden="true">
			<span class="axis-name"></span>
			<span class="scale">{#each ticks as tick (tick)}<span class="tick" style:left={pct(tick)}>{tick}</span>{/each}</span>
			<span class="axis-value">ημέρες</span>
		</div>
		<p class="note">Πάτησε μια γραμμή για τις τιμές.</p>
		<ol class="list">
			{#each shown as r (r.key)}
				{@const s = r.stats}
				{@const open = expandedKey === r.key}
				{@const controlId = explanationId(r.key)}
				<li class:open>
					<button type="button" class="row" data-key={r.key} aria-expanded={open} aria-controls={controlId} onclick={() => onToggle(r.key)}>
						<span class="name">{r.name}</span>
						<span class="plot" aria-hidden="true">
							{#each ticks as tick (tick)}<span class="grid" style:left={pct(tick)}></span>{/each}
							{#if s.n >= 5}
								<span class="whisk" style:left={pct(s.lo)} style:width={pct(s.hi - s.lo)}></span>
								<span class="cap" style:left={pct(s.lo)}></span>
								<span class="cap" style:left={pct(s.hi)}></span>
								<span class="box" style:left={pct(s.q1)} style:width={pct(Math.max(s.q3 - s.q1, 0.4))}></span>
								<span class="median" style:left={pct(s.median)}></span>
								{#each s.outliers as outlier, i (i)}<span class="outlier" style:left={pct(outlier)}></span>{/each}
							{:else}
								{#each r.values as value, i (i)}<span class="sample-dot" style={`left:${pct(value)};top:calc(50% + ${(i - (s.n - 1) / 2) * 8}px)`}></span>{/each}
							{/if}
							<span class="mean" style:left={pct(s.mean)}></span>
						</span>
						<span class="value"><b>{s.n < 5 ? `Μέσος ${fmtStat(s.mean)} ημ.` : `Διάμεσος ${fmtStat(s.median)} ημ.`}</b><span>{fmtInt(s.n)}/{fmtInt(r.sites)} σημεία</span></span>
					</button>
					<div id={controlId} class="explanation" hidden={!open}>
						<dl>
							<div><dt>Διάμεσος:</dt><dd>{fmtStat(s.median)} ημ.</dd></div>
							<div><dt>Μέσος όρος:</dt><dd>{fmtStat(s.mean)} ημ.</dd></div>
							<div><dt>Εύρος:</dt><dd>{fmtStat(s.min)} έως {fmtStat(s.max)} ημ.</dd></div>
							<div><dt>Σημεία με ημερομηνία:</dt><dd>{fmtInt(s.n)} από {fmtInt(r.sites)}</dd></div>
						</dl>
						<p>Διάμεσος: η μεσαία τιμή. Μέσος όρος: το άθροισμα διαιρεμένο με τα σημεία. Εύρος: από τη μικρότερη έως τη μεγαλύτερη τιμή.</p>
						<button type="button" class="map-action" onclick={() => onShowOnMap(r.key)}>Δες στον χάρτη</button>
						<span class="action-note">Αλλάζει την επιλογή στα φίλτρα.</span>
					</div>
				</li>
			{/each}
		</ol>
		{#if rows.length > SHOW}
			<button type="button" class="more" aria-expanded={showingAll} onclick={() => (showingAll = !showingAll)}>{showingAll ? 'Λιγότερες' : 'Περισσότερες'}</button>
		{/if}
		<div class="tools"><span></span><button type="button" class="tool" onclick={exportCsv}>CSV</button></div>
	{/if}
</section>

<style>
	.waits { display: grid; gap: 0.65rem; min-width: 0; scroll-margin-top: calc(var(--atlas-bar-height, 0px) + 12px); }
	.head { display: flex; align-items: end; justify-content: space-between; gap: 1rem; min-width: 0; }
	h2 { font-size: clamp(1.35rem, 3vw, 1.8rem); }
	.sub, .sample-note, .note, .empty { margin: 0; color: var(--ink-3); font-size: 0.82rem; }
	.sample-note { text-align: right; }
	.legend { display: flex; flex-wrap: wrap; gap: 0.4rem 1.2rem; color: var(--ink-2); font-size: 0.76rem; }
	.legend span { display: inline-flex; align-items: center; gap: 0.4rem; }
	.legend i { display: inline-block; width: 14px; height: 10px; position: relative; flex: none; }
	.lg-point, .lg-out { width: 8px !important; height: 8px !important; border-radius: 50%; background: var(--ink-2); }
	.lg-out { background: var(--paper); border: 1px solid var(--ink-2); }
	.lg-mean { width: 9px !important; height: 9px !important; background: var(--urgent); transform: rotate(45deg); }
	.lg-median { width: 2px !important; background: var(--ink); }
	.lg-box { background: color-mix(in srgb, var(--accent) 28%, var(--paper)); border: 1px solid var(--accent); }
	.lg-whisk { height: 1px !important; margin-top: 5px; background: var(--ink-3); }
	.axis, .row { display: grid; grid-template-columns: minmax(0, 12rem) minmax(0, 1fr) minmax(8rem, 11rem); gap: 0.8rem; align-items: center; min-width: 0; }
	.axis { padding: 0 0.4rem; color: var(--ink-3); font-size: 0.72rem; font-variant-numeric: tabular-nums; }
	.scale { position: relative; height: 1rem; min-width: 0; }
	.tick { position: absolute; transform: translateX(-50%); }
	.axis-value { text-align: right; }
	.list { list-style: none; padding: 0; margin: 0; min-width: 0; }
	.list li { border-bottom: 1px solid var(--line); min-width: 0; }
	.row { width: 100%; min-height: 58px; padding: 0.45rem 0.4rem; border: 0; border-bottom: 1px solid transparent; background: none; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
	.row:hover, li.open .row { background: var(--card); }
	.name { min-width: 0; overflow-wrap: anywhere; font-size: 0.95rem; font-weight: 500; line-height: 1.25; }
	.plot { position: relative; height: 20px; min-width: 0; margin-inline: 6px; }
	.plot > span { position: absolute; }
	.grid { top: 0; bottom: 0; width: 1px; background: var(--line); }
	.whisk { top: 50%; height: 1px; background: var(--ink-3); }
	.cap { top: 4px; bottom: 4px; width: 1px; background: var(--ink-3); }
	.box { top: 2px; bottom: 2px; background: color-mix(in srgb, var(--accent) 28%, var(--paper)); border: 1px solid var(--accent); border-radius: 2px; }
	.median { top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--ink); }
	.mean { top: 50%; width: 8px; height: 8px; margin: -4px 0 0 -4px; background: var(--urgent); transform: rotate(45deg); }
	.sample-dot, .outlier { width: 8px; height: 8px; margin: -4px 0 0 -4px; border-radius: 50%; background: var(--ink-2); }
	.outlier { background: var(--paper); border: 1px solid var(--ink-2); }
	.value { min-width: 0; display: grid; justify-items: end; gap: 0.1rem; text-align: right; font-variant-numeric: tabular-nums; }
	.value b { font-weight: 600; white-space: nowrap; }
	.value span { color: var(--ink-3); font-size: 0.75rem; white-space: nowrap; }
	.explanation { margin: 0 0 0.7rem; padding: 0.7rem 0.5rem 0.85rem 1rem; border-left: 2px solid var(--accent); background: var(--card); font-size: 0.86rem; }
	.explanation dl { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.4rem 1rem; margin: 0; }
	.explanation dl div { min-width: 0; }
	.explanation dt { color: var(--ink-3); font-size: 0.78rem; }
	.explanation dd { margin: 0.1rem 0 0; font-weight: 600; font-variant-numeric: tabular-nums; }
	.explanation p { margin: 0.75rem 0; color: var(--ink-2); }
	.map-action, .more, .tool { min-height: 44px; border: 1px solid var(--line-2); border-radius: var(--r-ctl); background: var(--card); padding: 0 0.8rem; color: var(--ink-2); font: inherit; font-size: 0.82rem; font-weight: 600; cursor: pointer; }
	.action-note { margin-left: 0.55rem; color: var(--ink-3); font-size: 0.78rem; }
	.more { justify-self: start; }
	.tools { display: flex; justify-content: space-between; align-items: center; gap: 0.7rem; }
	@media (max-width: 899px) {
		.head { display: block; }
		.sample-note { margin-top: 0.25rem; text-align: left; }
		.axis, .row { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: 'name value' 'plot plot'; gap: 0.25rem 0.7rem; }
		.axis { display: none; }
		.row { padding: 0.7rem 0.4rem; }
		.name { grid-area: name; }
		.value { grid-area: value; }
		.plot { grid-area: plot; width: auto; margin-inline: 6px; }
		.explanation dl { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	}
	@media (max-width: 420px) {
		.explanation dl { grid-template-columns: minmax(0, 1fr); }
		.action-note { display: block; margin: 0.35rem 0 0; }
	}
</style>
