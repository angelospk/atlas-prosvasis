<script lang="ts">
	// Comparison: specialties × prefectures, one metric at a time. The inline table has 22px
	// cells with no digits (the readout line above speaks for the hovered or focused cell);
	// «Μεγάλη προβολή» opens the same table in a full-viewport dialog with 30px cells that
	// show their digits. Zero is a plain paper cell; unknown is hatched; a value is a tone of
	// the scale; a flagged distance gets a brick underline. Sorting state is internal.
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
		METRICS,
		METRIC_LABEL,
		nearestFor,
		prefLabel,
		sumCounts,
		titleCase
	} from './format';

	let {
		data,
		sectors,
		metric,
		onMetric,
		onSelect
	}: {
		data: AtlasData;
		sectors: Sector[];
		metric: Metric;
		onMetric: (m: Metric) => void;
		onSelect: (key: string) => void;
	} = $props();

	interface Val {
		key: string;
		count: number;
		per100k: number | null;
		nearestKm: number | null;
		earliestDate: string | null;
		days: number | null;
		/** The metric's value as a number; null = unknown / not measured. */
		v: number | null;
		zero: boolean;
		unknown: boolean;
		flagged: boolean;
	}

	const idx = $derived(buildIndex(data));
	const flagKm = $derived(data.distanceFlagKm);

	function compute(cell: CoverageCell | undefined, pref: Prefecture, spec: Specialty): Val {
		const key = cellKey(pref.id, spec.id);
		if (!cell) return { key, count: 0, per100k: null, nearestKm: null, earliestDate: null, days: null, v: null, zero: false, unknown: true, flagged: false };
		const count = sumCounts(cell.counts, sectors);
		const per100k = pref.population > 0 ? (count / pref.population) * 100_000 : null;
		const near = nearestFor(idx, cell, sectors);
		const earliestDate = earliestFor(idx, cell, sectors);
		const days = daysFromScan(earliestDate, data.scan.at);
		let v: number | null;
		let zero = false;
		let unknown = false;
		switch (metric) {
			case 'count':
				v = count;
				zero = count === 0;
				break;
			case 'per100k':
				v = per100k;
				zero = count === 0;
				unknown = per100k == null;
				break;
			case 'nearestKm':
				v = near.km;
				unknown = near.unknown;
				break;
			case 'earliestDate':
				v = days;
				// No public provider with a date: a real absence when the cell has no public sites,
				// unknown when it has some but the scan got no date.
				zero = days == null && cell.counts.esy + cell.counts.pfy === 0;
				unknown = days == null && !zero;
				break;
		}
		return { key, count, per100k, nearestKm: near.km, earliestDate, days, v, zero, unknown, flagged: near.km != null && near.km > flagKm };
	}

	// values[specIndex][prefIndex]
	const values = $derived(
		data.specialties.map((s) => data.prefectures.map((p) => compute(idx.cellByKey.get(cellKey(p.id, s.id)), p, s)))
	);

	// Scale: sqrt of the value over a p95 ceiling so Athens does not flatten everyone else.
	const ceiling = $derived.by(() => {
		const xs = values.flat().map((c) => c.v).filter((x): x is number => x != null && x > 0).sort((a, b) => a - b);
		if (xs.length === 0) return 1;
		return xs[Math.min(xs.length - 1, Math.floor(xs.length * 0.95))] || 1;
	});
	const tone = (v: number | null) => (v == null || v <= 0 ? 0 : Math.min(1, Math.sqrt(v / ceiling)));
	const darkIsWorse = $derived(metric === 'nearestKm' || metric === 'earliestDate');

	// Sorting: which header was clicked. null = alphabetical.
	let sortPref = $state<number | null>(null);
	let sortSpec = $state<number | null>(null);

	// Biggest first in every metric: most sites, or the farthest / latest (the gaps first).
	const cmp = (a: number | null, b: number | null) => {
		if (a == null && b == null) return 0;
		if (a == null) return 1;
		if (b == null) return -1;
		return b - a;
	};
	const specOrder = $derived.by(() => {
		const order = data.specialties.map((_, i) => i);
		const pi = sortPref == null ? -1 : data.prefectures.findIndex((p) => p.id === sortPref);
		if (pi < 0) return order.sort((a, b) => titleCase(data.specialties[a].name).localeCompare(titleCase(data.specialties[b].name), 'el'));
		return order.sort((a, b) => cmp(values[a][pi].v, values[b][pi].v));
	});
	const prefOrder = $derived.by(() => {
		const order = data.prefectures.map((_, i) => i);
		const si = sortSpec == null ? -1 : data.specialties.findIndex((s) => s.id === sortSpec);
		if (si < 0) return order.sort((a, b) => data.prefectures[a].name.localeCompare(data.prefectures[b].name, 'el'));
		return order.sort((a, b) => cmp(values[si][a].v, values[si][b].v));
	});

	// Readout for the hovered / focused cell.
	let focus = $state<{ s: number; p: number } | null>(null);
	const readout = $derived.by(() => {
		if (!focus) return null;
		const c = values[focus.s][focus.p];
		const spec = data.specialties[focus.s];
		const pref = data.prefectures[focus.p];
		return { c, spec, pref };
	});

	function describe(c: Val, spec: Specialty, pref: Prefecture): string {
		// «Καρδιολόγος, Ν. Σάμου: 1 σημείο · πλησιέστερος 0,4 χλμ» (the colon opens the facts).
		const facts = [c.count === 0 ? 'δεν καταγράφηκε πάροχος' : `${fmtInt(c.count)} σημεία (${fmtPer100k(c.per100k)} ανά 100 χιλ.)`];
		facts.push(c.nearestKm == null ? 'απόσταση άγνωστη' : `πλησιέστερος ${fmtKm(c.nearestKm)}`);
		if (c.earliestDate) facts.push(`πρώτο ραντεβού ${fmtDay(c.earliestDate)}`);
		return `${titleCase(spec.name)}, ${prefLabel(pref)}: ${facts.join(' · ')}`;
	}
	function scaleLabel(v: number): string {
		switch (metric) {
			case 'count':
				return fmtInt(Math.round(v));
			case 'per100k':
				return fmtPer100k(v);
			case 'nearestKm':
				return fmtKm(v);
			case 'earliestDate':
				return fmtOffset(Math.round(v)) || '0 ημ.';
		}
	}
	/** The digits a big cell shows: whole numbers, one decimal for the rate, days for dates. */
	function cellText(c: Val): string {
		if (c.unknown) return '';
		if (c.zero) return '0';
		if (c.v == null) return '';
		switch (metric) {
			case 'count':
				return fmtInt(c.v);
			case 'per100k':
				return c.v >= 10 ? fmtInt(Math.round(c.v)) : fmtPer100k(c.v);
			case 'nearestKm':
				return fmtInt(Math.round(c.v));
			case 'earliestDate':
				return String(Math.round(c.v));
		}
	}

	// ---- the big view: a full-viewport dialog, Escape closes, focus stays inside ----
	let big = $state(false);
	let overlay = $state<HTMLElement | null>(null);
	let opener: HTMLElement | null = null;
	const uid = $props.id();

	function openBig(e: MouseEvent) {
		opener = e.currentTarget as HTMLElement;
		big = true;
	}
	function closeBig() {
		big = false;
		focus = null;
		opener?.focus();
	}
	// A cell opens its evidence in the list: leave the big view so the result is visible.
	function pick(key: string) {
		if (big) {
			big = false;
			focus = null;
		}
		onSelect(key);
	}
	const FOCUSABLE = 'button:not([disabled]), [href], input, select, [tabindex]:not([tabindex="-1"])';
	function trap(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			closeBig();
			return;
		}
		if (e.key !== 'Tab' || !overlay) return;
		const items = Array.from(overlay.querySelectorAll<HTMLElement>(FOCUSABLE));
		if (items.length === 0) return;
		const first = items[0];
		const last = items[items.length - 1];
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	}
	$effect(() => {
		if (!big) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		overlay?.querySelector<HTMLElement>('.close')?.focus();
		return () => {
			document.body.style.overflow = prev;
		};
	});
</script>

{#snippet metricsCtl()}
	<div class="metrics" role="group" aria-label="Μετρική">
		{#each METRICS as m (m)}
			<button type="button" class:on={metric === m} aria-pressed={metric === m} onclick={() => onMetric(m)}>{METRIC_LABEL[m]}</button>
		{/each}
	</div>
{/snippet}

{#snippet readoutLine(hint: string)}
	<p class="readout" aria-live="polite">
		{#if readout}
			{describe(readout.c, readout.spec, readout.pref)}
		{:else}
			{hint}
		{/if}
	</p>
{/snippet}

{#snippet grid(digits: boolean)}
	<table class:digits>
		<thead>
			<tr>
				<th class="corner">
					<button type="button" class="hbtn" onclick={() => { sortPref = null; sortSpec = null; }} title="Αλφαβητική ταξινόμηση">
						Ειδικότητα ↓ · Νομός →
					</button>
				</th>
				{#each prefOrder as pi (data.prefectures[pi].id)}
					{@const p = data.prefectures[pi]}
					<th class="col" class:on={sortPref === p.id} scope="col">
						<button type="button" class="hbtn vert" onclick={() => (sortPref = sortPref === p.id ? null : p.id)} title={`Ταξινόμηση ειδικοτήτων κατά ${prefLabel(p)}`}>
							<span>{p.name}</span>
						</button>
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each specOrder as si (data.specialties[si].id)}
				{@const s = data.specialties[si]}
				<tr>
					<th class="row" class:on={sortSpec === s.id} scope="row">
						<button type="button" class="hbtn" onclick={() => (sortSpec = sortSpec === s.id ? null : s.id)} title="Ταξινόμηση νομών κατά αυτή την ειδικότητα">
							{titleCase(s.name)}
						</button>
					</th>
					{#each prefOrder as pi (data.prefectures[pi].id)}
						{@const c = values[si][pi]}
						{@const t = c.unknown || c.zero ? 0 : tone(c.v)}
						<td>
							<button
								type="button"
								class="cell"
								class:zero={c.zero && !c.unknown}
								class:unknown={c.unknown}
								class:flag={c.flagged}
								class:has={!c.zero && !c.unknown}
								class:light={t > 0.55}
								style:--t={t}
								aria-label={describe(c, s, data.prefectures[pi])}
								onmouseenter={() => (focus = { s: si, p: pi })}
								onfocus={() => (focus = { s: si, p: pi })}
								onmouseleave={() => (focus = null)}
								onclick={() => pick(c.key)}
							>{#if digits}{cellText(c)}{/if}</button>
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
{/snippet}

{#snippet legend()}
	<div class="legend">
		<span class="lg"><span class="sw zero"></span> 0, δεν καταγράφηκε πάροχος</span>
		<span class="lg"><span class="sw hatch"></span> χωρίς μέτρηση</span>
		<span class="lg scale">
			<span class="sw" style:--t={0.15}></span><span class="sw" style:--t={0.4}></span><span class="sw" style:--t={0.65}></span><span class="sw" style:--t={1}></span>
			<span class="num">{scaleLabel(ceiling * 0.02)} έως {scaleLabel(ceiling)}{darkIsWorse ? ' (σκούρο = χειρότερο)' : ''}</span>
		</span>
		{#if metric === 'nearestKm'}
			<span class="lg"><span class="sw flagsw"></span> πάνω από {flagKm} χλμ από την έδρα, σε ευθεία</span>
		{/if}
		{#if metric === 'earliestDate'}
			<span class="lg">στη μεγάλη προβολή: ημέρες από τη σάρωση</span>
		{/if}
	</div>
{/snippet}

<div class="matrix" style:--tone-ink={darkIsWorse ? 'var(--ink)' : 'var(--accent-d)'}>
	<div class="bar">
		{@render metricsCtl()}
		<button type="button" class="tool" onclick={openBig} aria-haspopup="dialog">Μεγάλη προβολή</button>
		{@render readoutLine('Πέρασε τον δείκτη πάνω από ένα κελί, κλικ για τα στοιχεία. Κλικ σε επικεφαλίδα για ταξινόμηση.')}
	</div>

	<div class="scroll">{@render grid(false)}</div>
	<p class="phone-hint">Ο πίνακας χωράει μόνο στη μεγάλη προβολή.</p>

	{@render legend()}
</div>

{#if big}
	<div
		class="overlay"
		role="dialog"
		aria-modal="true"
		aria-labelledby="{uid}-big-title"
		tabindex="-1"
		bind:this={overlay}
		onkeydown={trap}
		style:--tone-ink={darkIsWorse ? 'var(--ink)' : 'var(--accent-d)'}
	>
		<div class="ohead">
			<h2 id="{uid}-big-title">Πίνακας σύγκρισης</h2>
			{@render metricsCtl()}
			<button type="button" class="close" onclick={closeBig} aria-label="Κλείσιμο">
				<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" /></svg>
			</button>
			{@render readoutLine('Πέρασε τον δείκτη πάνω από ένα κελί. Escape κλείνει.')}
		</div>
		<div class="oscroll">{@render grid(true)}</div>
		<div class="ofoot">{@render legend()}</div>
	</div>
{/if}

<style>
	.matrix {
		display: grid;
		gap: 0.6rem;
		--cell: 22px;
	}
	.bar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem 1.2rem;
		align-items: center;
	}
	.metrics {
		display: inline-flex;
		border: 1px solid var(--line-2);
		border-radius: var(--r-ctl);
		overflow: hidden;
	}
	.metrics button {
		background: var(--card);
		border: 0;
		border-right: 1px solid var(--line-2);
		padding: 0.4rem 0.8rem;
		font-size: 0.84rem;
		font-weight: 500;
		color: var(--ink-2);
		cursor: pointer;
		transition: background-color 0.15s ease, color 0.15s ease;
	}
	.metrics button:last-child {
		border-right: 0;
	}
	.metrics button.on {
		background: var(--ink);
		color: var(--paper);
	}
	.tool {
		background: var(--card);
		border: 1px solid var(--line-2);
		border-radius: var(--r-ctl);
		padding: 0.4rem 0.8rem;
		font-size: 0.84rem;
		font-weight: 600;
		color: var(--ink-2);
		cursor: pointer;
	}
	.tool:hover {
		border-color: var(--ink-3);
		color: var(--ink);
	}
	.readout {
		margin: 0;
		font-size: 0.88rem;
		color: var(--ink-2);
		min-height: 1.4em;
		flex: 1 1 24ch;
		font-variant-numeric: tabular-nums;
	}
	.scroll {
		overflow: auto;
		max-height: 70vh;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--card);
	}
	.phone-hint {
		display: none;
		margin: 0;
		font-size: 0.84rem;
		color: var(--ink-3);
	}
	table {
		border-collapse: separate;
		border-spacing: 0;
		font-size: 0.78rem;
	}
	th {
		position: sticky;
		background: var(--card);
		font-weight: 500;
		text-align: left;
		padding: 0;
		z-index: 2;
	}
	thead th {
		top: 0;
		border-bottom: 1px solid var(--line-2);
		vertical-align: bottom;
	}
	th.row {
		left: 0;
		border-right: 1px solid var(--line-2);
		white-space: nowrap;
		font-size: 0.84rem;
	}
	th.corner {
		left: 0;
		z-index: 3;
		font-size: 0.72rem;
		color: var(--ink-3);
	}
	.hbtn {
		background: none;
		border: 0;
		padding: 0.35rem 0.6rem;
		font: inherit;
		color: inherit;
		cursor: pointer;
		text-align: left;
		width: 100%;
	}
	.hbtn:hover {
		color: var(--accent-d);
	}
	th.on .hbtn {
		color: var(--accent-d);
		font-weight: 600;
	}
	th.col {
		width: var(--cell);
		min-width: var(--cell);
		height: 7.5rem;
	}
	.vert {
		height: 100%;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding: 0.3rem 0;
	}
	.vert span {
		writing-mode: vertical-rl;
		transform: rotate(180deg);
		white-space: nowrap;
		font-size: 0.74rem;
	}
	td {
		padding: 0;
		width: var(--cell);
		height: var(--cell);
		border-bottom: 1px solid var(--paper-2);
	}
	.cell {
		display: block;
		width: var(--cell);
		height: var(--cell);
		border: 0;
		border-right: 1px solid var(--paper-2);
		padding: 0;
		cursor: pointer;
		background: var(--card);
		position: relative;
		font: inherit;
		font-size: 0.66rem;
		font-variant-numeric: tabular-nums;
		color: var(--ink);
		line-height: 1;
		overflow: hidden;
	}
	.cell.has {
		background: color-mix(in oklab, var(--card), var(--tone-ink) calc(var(--t) * 100%));
	}
	.cell.has.light {
		color: var(--paper);
	}
	.cell.zero {
		background: var(--paper);
		color: var(--ink-3);
	}
	.cell.unknown {
		background: var(--hatch), var(--card);
	}
	.cell.flag::after {
		content: '';
		position: absolute;
		left: 3px;
		right: 3px;
		bottom: 2px;
		height: 2px;
		background: var(--urgent);
	}
	.cell:hover,
	.cell:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
		z-index: 1;
	}
	/* The big table: 30px cells that carry their digits. */
	table.digits {
		--cell: 30px;
	}
	table.digits th.col {
		height: 8.5rem;
	}
	table.digits th.row {
		font-size: 0.88rem;
	}
	table.digits .vert span {
		font-size: 0.8rem;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1.4rem;
		font-size: 0.76rem;
		color: var(--ink-2);
		align-items: center;
	}
	.lg {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}
	.lg.scale {
		gap: 2px;
	}
	.lg.scale .num {
		margin-left: 0.4rem;
		font-variant-numeric: tabular-nums;
	}
	.sw {
		display: inline-block;
		width: 16px;
		height: 12px;
		border: 1px solid var(--line);
		border-radius: 2px;
		background: color-mix(in oklab, var(--card), var(--tone-ink) calc(var(--t, 0) * 100%));
	}
	.sw.zero {
		background: var(--paper);
	}
	.sw.hatch {
		background: var(--hatch), var(--card);
	}
	.sw.flagsw {
		background: var(--card);
		border-bottom: 2px solid var(--urgent);
	}

	/* ---- the big view ---- */
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 80;
		background: var(--paper);
		color: var(--ink);
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		gap: 0.6rem;
		padding: 0.8rem clamp(0.8rem, 2vw, 1.5rem);
	}
	.ohead {
		display: grid;
		grid-template-columns: auto auto minmax(0, 1fr) auto;
		gap: 0.5rem 1rem;
		align-items: center;
	}
	.ohead h2 {
		font-size: 1.2rem;
	}
	.ohead .readout {
		grid-column: 1 / -1;
	}
	.close {
		width: 36px;
		height: 36px;
		border: 1px solid var(--line-2);
		border-radius: var(--r-ctl);
		background: var(--card);
		display: grid;
		place-items: center;
		color: var(--ink-2);
		cursor: pointer;
		justify-self: end;
	}
	.close:hover {
		border-color: var(--ink-3);
		color: var(--ink);
	}
	.oscroll {
		overflow: auto;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--card);
		min-height: 0;
	}
	@media (max-width: 719px) {
		.scroll {
			display: none;
		}
		.phone-hint {
			display: block;
		}
		.ohead {
			grid-template-columns: minmax(0, 1fr) auto;
		}
		.ohead .metrics {
			grid-column: 1 / -1;
		}
	}
</style>
