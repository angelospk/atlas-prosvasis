<script lang="ts">
	// The ten prefectures with the lowest rate for the selected specialty and sectors. Zeros
	// tie, so among them the most populous comes first (more residents behind the gap); the
	// footnote says so. Compact rows that fold rather than scroll sideways on a phone.
	import type { AtlasData, Selection } from '$lib/atlas/types';
	import { buildIndex, deriveRows, fmtInt, fmtKm, fmtPer100k, parseKey, sectorsLabel, titleCase } from './format';

	let {
		data,
		selection,
		onSelect
	}: {
		data: AtlasData;
		selection: Selection;
		onSelect: (prefectureId: number) => void;
	} = $props();

	const TOP = 10;
	const idx = $derived(buildIndex(data));
	const spec = $derived(selection.specialtyId == null ? null : (idx.specById.get(selection.specialtyId) ?? null));
	const ranked = $derived.by(() => {
		if (!spec) return [];
		const rows = deriveRows(data, idx, { mode: 'specialty', prefectureId: null, specialtyId: spec.id, sectors: selection.sectors });
		return rows
			.map((r) => {
				const pref = idx.prefById.get(parseKey(r.key)?.prefectureId ?? -1) ?? null;
				return { row: r, pref, rate: r.per100k ?? Infinity };
			})
			.filter((x) => x.pref != null && x.row.per100k != null)
			.sort((a, b) => a.rate - b.rate || (b.pref?.population ?? 0) - (a.pref?.population ?? 0) || a.row.name.localeCompare(b.row.name, 'el'))
			.slice(0, TOP);
	});
	const zeros = $derived(ranked.filter((x) => x.row.count === 0).length);
	const zeroPop = $derived(ranked.filter((x) => x.row.count === 0).reduce((n, x) => n + (x.pref?.population ?? 0), 0));
</script>

<section class="ranking" aria-labelledby="atlas-rank-title">
	<header>
		<h2 id="atlas-rank-title">Οι {TOP} νομοί με τη χαμηλότερη αναλογία</h2>
		<p class="sub">
			{#if spec}
				{titleCase(spec.name)} · {sectorsLabel(selection.sectors)} · σημεία ανά 100.000 κατοίκους
			{:else}
				Σημεία ανά 100.000 κατοίκους
			{/if}
		</p>
	</header>

	{#if !spec}
		<p class="empty">Διάλεξε ειδικότητα για την κατάταξη.</p>
	{:else if ranked.length === 0}
		<p class="empty">Χωρίς μέτρηση για αυτή την ειδικότητα.</p>
	{:else}
		<ol class="rows">
			{#each ranked as x, i (x.row.key)}
				<li>
					<button
						type="button"
						class="row"
						class:sel={selection.prefectureId === x.pref?.id}
						class:none={x.row.count === 0}
						aria-pressed={selection.prefectureId === x.pref?.id}
						onclick={() => x.pref && onSelect(x.pref.id)}
					>
						<span class="rank num" aria-hidden="true">{i + 1}</span>
						<span class="name">
							<span class="pref">{x.row.name}</span>
							<span class="seat">έδρα {x.pref?.seat.label}</span>
						</span>
						<span class="count num">
							{#if x.row.count === 0}<span class="zero" title="Δεν καταγράφεται στον κατάλογο">0</span>{:else}{fmtInt(x.row.count)}{/if}
							<span class="lab">σημεία</span>
						</span>
						<span class="pop num">
							{fmtInt(x.pref?.population ?? 0)}
							<span class="lab">κάτοικοι</span>
						</span>
						<span class="rate num" class:zero={x.row.count === 0}>
							{x.row.count === 0 ? '0' : fmtPer100k(x.row.per100k)}
							<span class="lab">ανά 100 χιλ.</span>
						</span>
						{#if x.row.count === 0}
							<span class="near" class:flag={x.row.flagged} title="Από την έδρα, σε ευθεία">
								{#if x.row.nearestUnknown}<span class="hatch unk">άγνωστο</span>{:else}πλησιέστερος {fmtKm(x.row.nearestKm)}{/if}
							</span>
						{/if}
					</button>
				</li>
			{/each}
		</ol>
		<p class="foot">
			{#if zeros > 0}
				{zeros} από τους {ranked.length} στο μηδέν, με {fmtInt(zeroPop)} κατοίκους συνολικά· ισοβαθμία στο μηδέν: πρώτα ο μεγαλύτερος πληθυσμός.
			{:else}
				Ισοβαθμίες: πρώτα ο μεγαλύτερος πληθυσμός.
			{/if}
			Αποστάσεις από την έδρα, σε ευθεία.
		</p>
	{/if}
</section>

<style>
	.ranking {
		display: grid;
		gap: 0.7rem;
	}
	h2 {
		font-size: clamp(1.1rem, 1.8vw, 1.3rem);
	}
	.sub {
		margin: 0.3rem 0 0;
		font-size: 0.84rem;
		color: var(--ink-3);
	}
	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.row {
		display: grid;
		grid-template-columns: 1.6rem minmax(0, 1fr) 5.2rem 6.6rem 5.4rem;
		gap: 0.6rem;
		align-items: baseline;
		width: 100%;
		background: none;
		border: 0;
		border-bottom: 1px solid var(--line);
		padding: 0.5rem 0.4rem;
		font: inherit;
		color: var(--ink);
		text-align: left;
		cursor: pointer;
		position: relative;
		transition: background-color 0.15s ease;
	}
	.row:hover,
	.row.sel {
		background: var(--card);
	}
	.row.sel::before {
		content: '';
		position: absolute;
		left: -0.5rem;
		top: 0.35rem;
		bottom: 0.35rem;
		width: 2px;
		background: var(--accent);
	}
	.rank {
		color: var(--ink-3);
		text-align: right;
	}
	.name {
		min-width: 0;
	}
	.pref {
		display: block;
		font-size: 0.96rem;
		font-weight: 600;
		line-height: 1.25;
	}
	.row.none .pref {
		color: var(--ink-2);
	}
	.seat {
		display: block;
		font-size: 0.74rem;
		color: var(--ink-3);
	}
	.num {
		font-variant-numeric: tabular-nums;
		font-size: 0.95rem;
		text-align: right;
		white-space: nowrap;
	}
	.lab {
		display: block;
		font-family: var(--sans);
		font-size: 0.7rem;
		color: var(--ink-3);
		font-weight: 400;
	}
	.zero {
		color: var(--ink-3);
	}
	.rate {
		font-weight: 600;
	}
	.rate.zero {
		font-weight: 500;
	}
	.near {
		grid-column: 2 / -1;
		font-size: 0.78rem;
		color: var(--ink-3);
	}
	.near.flag {
		color: var(--urgent);
	}
	.unk {
		display: inline-block;
		padding: 0 5px;
		border-radius: 3px;
		color: var(--ink-2);
	}
	.empty {
		margin: 0.2rem 0;
		color: var(--ink-3);
	}
	.foot {
		margin: 0;
		font-size: 0.74rem;
		color: var(--ink-3);
		max-width: 70ch;
		font-variant-numeric: tabular-nums;
	}
	@media (max-width: 719px) {
		.row {
			grid-template-columns: 1.4rem auto minmax(0, 1fr) auto;
			grid-template-areas:
				'rank name  name rate'
				'.    count pop  pop'
				'.    near  near near';
			row-gap: 0.15rem;
		}
		.rank {
			grid-area: rank;
		}
		.name {
			grid-area: name;
		}
		.rate {
			grid-area: rate;
		}
		.count,
		.pop {
			text-align: left;
			font-size: 0.86rem;
			display: inline;
		}
		/* Two cells side by side: one grid area each (sharing one stacked them). */
		.count {
			grid-area: count;
			margin-right: 0.8rem;
		}
		.pop {
			grid-area: pop;
			justify-self: start;
		}
		.count .lab,
		.pop .lab {
			display: inline;
			margin-left: 0.2rem;
		}
		.near {
			grid-area: near;
		}
	}
</style>
