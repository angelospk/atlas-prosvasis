<script lang="ts">
	// How long you wait for a first appointment: one box plot per line. The box is the
	// middle half of the sites (25th to 75th percentile), the bar in it the median, the
	// diamond the mean, the whiskers the usual range (Tukey, 1.5 × IQR) and the dots
	// beyond them the rare waits. Lines follow the selection: specialties (Greece or the
	// chosen prefecture), prefectures (the chosen specialty), or the one chosen cell.
	import type { AtlasData, Selection } from '$lib/atlas/types';
	import { buildIndex, fmtDay, fmtInt, parseKey, selectionLabel, toCsv, waitRows } from './format';
	import { downloadText } from './download';

	let {
		data,
		selection,
		onSelect
	}: {
		data: AtlasData;
		selection: Selection;
		onSelect: (key: string) => void;
	} = $props();

	const SHOW = 12;
	const idx = $derived(buildIndex(data));
	const rows = $derived(waitRows(data, idx, selection));
	const byPrefecture = $derived(selection.specialtyId != null && selection.prefectureId == null);
	let expanded = $state(false);
	const shown = $derived(expanded ? rows : rows.slice(0, SHOW));

	// One axis for every line, in days, rounded up to whole weeks.
	const axisMax = $derived(Math.max(7, Math.ceil(Math.max(0, ...rows.map((r) => r.stats.max)) / 7) * 7));
	const ticks = $derived.by(() => {
		const step = axisMax <= 28 ? 7 : axisMax <= 84 ? 14 : 30;
		const out: number[] = [];
		for (let d = 0; d <= axisMax; d += step) out.push(d);
		return out;
	});
	const pct = (d: number) => `${(d / axisMax) * 100}%`;
	const days = (d: number) => (Math.round(d) === 1 ? '1 ημέρα' : `${fmtInt(Math.round(d))} ημέρες`);

	function exportCsv() {
		const head = [byPrefecture ? 'Νομός' : 'Ειδικότητα', 'Σημεία', 'Με ημερομηνία', 'Ελάχιστη', '25%', 'Διάμεσος', 'Μέσος όρος', '75%', 'Μέγιστη'];
		const body = rows.map((r) => {
			const s = r.stats;
			return [r.name, r.sites, s.n, s.min, s.q1, s.median, Math.round(s.mean * 10) / 10, s.q3, s.max];
		});
		const meta = [[`Ημέρες έως το πρώτο ελεύθερο ραντεβού · ${selectionLabel(idx, selection)}`], [`Σάρωση ${data.scan.at.slice(0, 10)} · ${data.scan.source}`], []];
		downloadText(`atlas-αναμονή-${data.scan.at.slice(0, 10)}.csv`, toCsv([...meta, head, ...body]));
	}
</script>

<section class="waits" aria-labelledby="atlas-waits-title">
	<header>
		<h2 id="atlas-waits-title">Αναμονή για πρώτο ραντεβού</h2>
		<p class="sub">
			Ημέρες από τη σάρωση της {fmtDay(data.scan.at)} έως το πρώτο ελεύθερο ραντεβού, ένα σημείο παροχής = μία τιμή ·
			{selectionLabel(idx, selection)}
		</p>
	</header>

	{#if rows.length === 0}
		<p class="empty">Κανένα σημείο με ημερομηνία ραντεβού για αυτή την επιλογή.</p>
	{:else}
		<div class="legend" aria-hidden="true">
			<span><i class="lg-box"></i>τα μισά σημεία (25% έως 75%)</span>
			<span><i class="lg-med"></i>διάμεσος</span>
			<span><i class="lg-mean"></i>μέσος όρος</span>
			<span><i class="lg-whisk"></i>συνήθες εύρος</span>
			<span><i class="lg-out"></i>σπάνιες τιμές</span>
		</div>

		<div class="axis" aria-hidden="true">
			<span class="spacer-name"></span>
			<span class="scale">
				{#each ticks as t (t)}<span class="tick" style:left={pct(t)}>{t}</span>{/each}
			</span>
			<span class="spacer-val">ημέρες</span>
		</div>

		<ol class="list">
			{#each shown as r (r.key)}
				{@const s = r.stats}
				{@const k = parseKey(r.key)}
				<li>
					<button
						type="button"
						class="row"
						onclick={() => onSelect(r.key)}
						title={`${r.name}: διάμεσος ${days(s.median)}, μέσος όρος ${days(s.mean)}, τα μισά σημεία ${Math.round(s.q1)} έως ${Math.round(s.q3)} ημέρες, από ${s.min} έως ${s.max} · ${s.n} από ${r.sites} σημεία με ημερομηνία`}
						data-pref={k?.prefectureId}
					>
						<span class="name">{r.name}</span>
						<span class="plot" aria-hidden="true">
							{#each ticks as t (t)}<span class="grid" style:left={pct(t)}></span>{/each}
							<span class="whisk" style:left={pct(s.lo)} style:width={pct(s.hi - s.lo)}></span>
							<span class="cap" style:left={pct(s.lo)}></span>
							<span class="cap" style:left={pct(s.hi)}></span>
							<span class="box" style:left={pct(s.q1)} style:width={pct(Math.max(s.q3 - s.q1, 0.4))}></span>
							<span class="med" style:left={pct(s.median)}></span>
							<span class="mean" style:left={pct(s.mean)}></span>
							{#each s.outliers as o, i (i)}<span class="out" style:left={pct(o)}></span>{/each}
						</span>
						<span class="val num"><b>{fmtInt(Math.round(s.median))}</b><span class="of"> ημ. · {fmtInt(s.n)}/{fmtInt(r.sites)} με ημερομηνία</span></span>
					</button>
				</li>
			{/each}
		</ol>

		<div class="tools">
			{#if rows.length > SHOW}
				<button type="button" class="link" aria-expanded={expanded} onclick={() => (expanded = !expanded)}>
					{expanded ? 'Λιγότερες γραμμές' : `Όλες οι γραμμές (${fmtInt(rows.length - SHOW)} ακόμη)`}
				</button>
			{/if}
			<span class="spacer"></span>
			<button type="button" class="tool" onclick={exportCsv}>CSV</button>
		</div>
		<p class="note">
			Στιγμιότυπο της ημέρας σάρωσης, όχι σημερινή διαθεσιμότητα. Σημεία χωρίς ελεύθερο ραντεβού στο εξάμηνο δεν έχουν
			τιμή και δεν μετρούν εδώ.
		</p>
	{/if}
</section>

<style>
	.waits {
		display: grid;
		gap: 0.8rem;
	}
	h2 {
		font-size: clamp(1.1rem, 1.8vw, 1.3rem);
	}
	.sub,
	.note,
	.empty {
		margin: 0.3rem 0 0;
		font-size: 0.84rem;
		color: var(--ink-3);
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1.1rem;
		font-size: 0.8rem;
		color: var(--ink-2);
	}
	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}
	.legend i {
		display: inline-block;
		position: relative;
	}
	.lg-box {
		width: 18px;
		height: 10px;
		background: color-mix(in srgb, var(--accent) 28%, transparent);
		border: 1px solid var(--accent);
	}
	.lg-med {
		width: 2px;
		height: 12px;
		background: var(--ink);
	}
	.lg-mean {
		width: 7px;
		height: 7px;
		background: var(--urgent);
		transform: rotate(45deg);
	}
	.lg-whisk {
		width: 18px;
		height: 1px;
		background: var(--ink-3);
	}
	.lg-out {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		border: 1px solid var(--ink-2);
	}
	.axis,
	.row {
		display: grid;
		grid-template-columns: minmax(0, 12rem) minmax(0, 1fr) 11rem;
		gap: 0.8rem;
		align-items: center;
	}
	.axis {
		padding: 0 0.4rem;
		font-size: 0.72rem;
		color: var(--ink-3);
		font-variant-numeric: tabular-nums;
	}
	.scale {
		position: relative;
		height: 1rem;
	}
	.tick {
		position: absolute;
		transform: translateX(-50%);
	}
	.spacer-val {
		text-align: right;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
	}
	.row {
		width: 100%;
		background: none;
		border: 0;
		border-bottom: 1px solid var(--line);
		padding: 0.45rem 0.4rem;
		font: inherit;
		color: var(--ink);
		text-align: left;
		cursor: pointer;
		transition: background-color 0.15s ease;
	}
	.row:hover {
		background: var(--card);
	}
	.name {
		font-size: 0.95rem;
		font-weight: 500;
		line-height: 1.25;
		min-width: 0;
	}
	.plot {
		position: relative;
		height: 18px;
	}
	.plot > span {
		position: absolute;
	}
	.grid {
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--line);
	}
	.whisk {
		top: 50%;
		height: 1px;
		background: var(--ink-3);
	}
	.cap {
		top: 4px;
		bottom: 4px;
		width: 1px;
		background: var(--ink-3);
	}
	.box {
		top: 2px;
		bottom: 2px;
		background: color-mix(in srgb, var(--accent) 28%, var(--paper));
		border: 1px solid var(--accent);
		border-radius: 2px;
	}
	.med {
		top: 0;
		bottom: 0;
		width: 2px;
		margin-left: -1px;
		background: var(--ink);
	}
	.mean {
		top: 50%;
		width: 7px;
		height: 7px;
		margin: -3.5px 0 0 -3.5px;
		background: var(--urgent);
		transform: rotate(45deg);
	}
	.out {
		top: 50%;
		width: 6px;
		height: 6px;
		margin: -3px 0 0 -3px;
		border-radius: 50%;
		border: 1px solid var(--ink-2);
		background: var(--paper);
	}
	.val {
		text-align: right;
		font-size: 0.95rem;
		white-space: nowrap;
	}
	.val b {
		font-weight: 600;
	}
	.of {
		font-size: 0.76rem;
		color: var(--ink-3);
	}
	.num {
		font-variant-numeric: tabular-nums;
	}
	.tools {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.spacer {
		flex: 1;
	}
	.link {
		background: none;
		border: 0;
		padding: 0;
		font: inherit;
		font-size: 0.86rem;
		font-weight: 500;
		color: var(--accent-d);
		text-decoration: underline;
		text-decoration-color: var(--line-2);
		text-underline-offset: 3px;
		cursor: pointer;
	}
	.tool {
		background: var(--card);
		border: 1px solid var(--line-2);
		border-radius: var(--r-ctl);
		padding: 0.4rem 0.8rem;
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--ink-2);
		cursor: pointer;
	}
	@media (max-width: 719px) {
		.axis {
			grid-template-columns: minmax(0, 1fr);
		}
		.spacer-name,
		.spacer-val {
			display: none;
		}
		.row {
			grid-template-columns: minmax(0, 1fr) auto;
			grid-template-areas:
				'name val'
				'plot plot';
			gap: 0.3rem 0.8rem;
		}
		.name {
			grid-area: name;
		}
		.val {
			grid-area: val;
		}
		.plot {
			grid-area: plot;
		}
	}
</style>
