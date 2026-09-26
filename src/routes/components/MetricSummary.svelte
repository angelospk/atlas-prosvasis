<script lang="ts">
	// The headline for the current selection: one plain sentence, then a few figures set
	// on a shared baseline. Deliberately not KPI tiles: the numbers answer different questions
	// and sit next to each other so none of them reads as "the score".
	import type { AtlasData, Selection } from '$lib/atlas/types';
	import { buildIndex, deriveRows, fmtInt, fmtKm, fmtPer100k, plural, prefLabel, titleCase } from './format';

	let { data, selection }: { data: AtlasData; selection: Selection } = $props();

	const idx = $derived(buildIndex(data));
	const rows = $derived(deriveRows(data, idx, selection));
	const pref = $derived(selection.prefectureId == null ? null : (idx.prefById.get(selection.prefectureId) ?? null));
	const spec = $derived(selection.specialtyId == null ? null : (idx.specById.get(selection.specialtyId) ?? null));
	const flagKm = $derived(data.distanceFlagKm);

	const total = $derived(rows.reduce((n, r) => n + r.count, 0));
	const withProvider = $derived(rows.filter((r) => r.count > 0).length);
	const flagged = $derived(rows.filter((r) => r.count === 0 && r.flagged).length);
	const unknown = $derived(rows.filter((r) => r.count === 0 && r.nearestUnknown).length);
	const farthest = $derived(rows.reduce<number | null>((m, r) => (r.count === 0 && r.nearestKm != null && (m == null || r.nearestKm > m) ? r.nearestKm : m), null));
	const population = $derived(pref ? pref.population : idx.population);
	const per100k = $derived(population > 0 ? (total / population) * 100_000 : null);

	// National (place mode, no prefecture): rows are specialties with prefsWith / prefsFlagged.
	const halfMissing = $derived(rows.filter((r) => r.prefsWith != null && r.prefsWith < data.prefectures.length / 2).length);
	const anyFlagged = $derived(rows.filter((r) => (r.prefsFlagged ?? 0) > 0).length);
	const nationalFlaggedSeats = $derived(rows.reduce((n, r) => n + (r.prefsFlagged ?? 0), 0));
</script>

<section class="summary" aria-live="polite">
	{#if selection.mode === 'specialty'}
		{#if spec}
			<p class="lede">
				<b>{titleCase(spec.name)}</b>: πάροχος στον κατάλογο σε
				<b class="num">{withProvider} από {rows.length}</b> νομούς
				{#if flagged > 0}
					· σε <b class="num">{flagged}</b> {flagged === 1 ? 'έδρα' : 'έδρες'} ο πλησιέστερος είναι πάνω από
					<span class="num">{flagKm} χλμ</span> μακριά (σε ευθεία).
				{:else if unknown === 0}
					· καμία έδρα πάνω από <span class="num">{flagKm} χλμ</span> από τον πλησιέστερο.
				{/if}
			</p>
			<dl class="figures">
				<div><dt>Σημεία παροχής</dt><dd class="num">{fmtInt(total)}</dd></div>
				<div><dt>Ανά 100 χιλ. κατοίκους</dt><dd class="num">{fmtPer100k(per100k)}</dd></div>
				<div><dt>Νομοί χωρίς πάροχο</dt><dd class="num">{fmtInt(rows.length - withProvider)}</dd></div>
				<div>
					<dt>Μακρύτερη έδρα</dt>
					<dd class="num" class:flag={farthest != null && farthest > flagKm}>{fmtKm(farthest)}</dd>
				</div>
				{#if unknown > 0}
					<div><dt>Χωρίς μέτρηση</dt><dd class="num unknown">{fmtInt(unknown)}</dd></div>
				{/if}
			</dl>
		{:else}
			<p class="lede muted">Διάλεξε ειδικότητα για να δεις πού υπάρχει και πού λείπει.</p>
		{/if}
	{:else if pref}
		<p class="lede">
			Στον <b>{prefLabel(pref)}</b>: <b class="num">{withProvider} από {rows.length}</b> ειδικότητες με πάροχο
			στον κατάλογο
			{#if flagged > 0}
				· για <b class="num">{flagged}</b> ο πλησιέστερος είναι πάνω από <span class="num">{flagKm} χλμ</span>
				από την έδρα ({pref.seat.label}), σε ευθεία.
			{:else if unknown === 0}
				· καμία με πλησιέστερο πάνω από <span class="num">{flagKm} χλμ</span> από την έδρα ({pref.seat.label}).
			{/if}
		</p>
		<dl class="figures">
			<div><dt>Σημεία παροχής</dt><dd class="num">{fmtInt(total)}</dd></div>
			<div><dt>Ανά 100 χιλ. κατοίκους</dt><dd class="num">{fmtPer100k(per100k)}</dd></div>
			<div><dt>Κάτοικοι ({data.populationYear})</dt><dd class="num">{fmtInt(pref.population)}</dd></div>
			<div><dt>Ειδικότητες χωρίς πάροχο</dt><dd class="num">{fmtInt(rows.length - withProvider)}</dd></div>
			{#if unknown > 0}
				<div><dt>Χωρίς μέτρηση</dt><dd class="num unknown">{fmtInt(unknown)}</dd></div>
			{/if}
		</dl>
	{:else}
		<p class="lede">
			Σε <b>όλη την Ελλάδα</b> ο κατάλογος έχει <b class="num">{fmtInt(total)}</b> σημεία με ραντεβού
			σε {plural(rows.length, 'ειδικότητα', 'ειδικότητες')}.
			{#if anyFlagged > 0}
				Σε <b class="num">{anyFlagged}</b> από αυτές, κάποιος νομός έχει την πιο κοντινή πάνω από
				<span class="num">{flagKm} χλμ</span> μακριά.
			{/if}
		</p>
		<dl class="figures">
			<div><dt>Σημεία παροχής</dt><dd class="num">{fmtInt(total)}</dd></div>
			<div><dt>Ανά 100 χιλ. κατοίκους</dt><dd class="num">{fmtPer100k(per100k)}</dd></div>
			<div><dt>Ειδικότητες σε λιγότερους από μισούς νομούς</dt><dd class="num">{fmtInt(halfMissing)}</dd></div>
			<div><dt>Περιπτώσεις πάνω από {flagKm} χλμ</dt><dd class="num" class:flag={nationalFlaggedSeats > 0}>{fmtInt(nationalFlaggedSeats)}</dd></div>
		</dl>
	{/if}
</section>

<style>
	.summary {
		display: grid;
		gap: 0.9rem;
		padding: 0.25rem 0 0.5rem;
	}
	.lede {
		margin: 0;
		font-size: clamp(1.05rem, 1.5vw, 1.2rem);
		line-height: 1.35;
		max-width: 62ch;
		text-wrap: pretty;
		color: var(--ink);
	}
	.lede b {
		font-weight: 600;
	}
	.lede.muted {
		color: var(--ink-3);
		font-weight: 400;
	}
	.num {
		font-variant-numeric: tabular-nums;
	}
	.figures {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0 2rem;
		row-gap: 0.6rem;
		border-top: 1px solid var(--line);
		padding-top: 0.7rem;
	}
	.figures div {
		display: grid;
		gap: 0.1rem;
		min-width: 7.5rem;
	}
	dt {
		font-size: 0.76rem;
		color: var(--ink-3);
	}
	dd {
		margin: 0;
		font-size: 1.3rem;
		line-height: 1.1;
		font-weight: 600;
		color: var(--ink);
	}
	dd.flag {
		color: var(--urgent);
	}
	dd.unknown {
		color: var(--ink-3);
	}
	@media (max-width: 600px) {
		/* Two even columns; each figure keeps its label on top of its number. */
		.figures {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 0.8rem 1.25rem;
			align-items: end;
		}
		.figures div {
			min-width: 0;
			align-content: end;
		}
		dd {
			font-size: 1.2rem;
		}
	}
</style>
