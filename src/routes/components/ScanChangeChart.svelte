<script lang="ts">
	// What moved in the directory between consecutive complete scans: added site × specialty
	// records and ones «no longer returned» (never "closed"). Paired bars on one shared scale,
	// latest week first; a week opens to list its records.
	import type { AtlasReport, ChangeItem } from '$lib/atlas/types';
	import { buildIndex, fmtDayShort, fmtInt, plural, prefLabel, titleCase } from './format';

	let { report }: { report: AtlasReport } = $props();

	const idx = $derived(buildIndex(report));
	const deltas = $derived([...report.history].sort((a, b) => (a.to < b.to ? 1 : a.to > b.to ? -1 : 0)));
	const completeScans = $derived(report.scans.filter((s) => s.complete).length);
	const max = $derived(Math.max(1, ...deltas.map((d) => Math.max(d.added, d.removed))));
	const totals = $derived(deltas.filter((d) => d.comparable).reduce((t, d) => ({ added: t.added + d.added, removed: t.removed + d.removed }), { added: 0, removed: 0 }));

	function specName(id: number): string {
		const s = idx.specById.get(id);
		return s ? titleCase(s.name) : `ειδικότητα #${id}`;
	}
	function prefName(id: number | null): string {
		if (id == null) return 'χωρίς νομό';
		return prefLabel(idx.prefById.get(id));
	}
	function sortItems(items: ChangeItem[]): ChangeItem[] {
		return [...items].sort((a, b) => prefName(a.prefectureId).localeCompare(prefName(b.prefectureId), 'el') || a.name.localeCompare(b.name, 'el'));
	}
	const label = (d: { from: string; to: string }) => `${fmtDayShort(d.from)} → ${fmtDayShort(d.to)}`;
</script>

<section class="changes" aria-labelledby="atlas-changes-title">
	<header>
		<h2 id="atlas-changes-title">Τι άλλαξε στον κατάλογο</h2>
		<p class="sub">
			Καταχωρίσεις (σημείο × ειδικότητα) ανά εβδομάδα, μεταξύ διαδοχικών πλήρων σαρώσεων.
			{#if deltas.length > 0}
				Συνολικά <span class="strong">{fmtInt(totals.added)}</span> νέες, <span class="strong">{fmtInt(totals.removed)}</span> δεν επιστρέφονται πια.
			{/if}
		</p>
	</header>

	{#if deltas.length === 0 || completeScans < 2}
		<p class="empty">Η σύγκριση ξεκινά από την επόμενη εβδομάδα.</p>
	{:else}
		<div class="key" aria-hidden="true">
			<span><span class="sw add"></span> νέες</span>
			<span><span class="sw rem"></span> δεν επιστρέφονται πια</span>
		</div>
		<div class="weeks" style:--max={max}>
			{#each deltas as d (d.from + d.to)}
				<details class="week" class:nc={!d.comparable}>
					<summary>
						<span class="when strong">{label(d)}</span>
						{#if d.comparable}
							<span class="pair">
								<span class="bar add"><span class="fill" style:--v={d.added}></span><span class="n num">{fmtInt(d.added)}</span></span>
								<span class="bar rem"><span class="fill" style:--v={d.removed}></span><span class="n num">{fmtInt(d.removed)}</span></span>
							</span>
						{:else}
							<span class="pair"><span class="hatch ncnote">μη συγκρίσιμο</span></span>
						{/if}
						<span class="more" aria-hidden="true">Καταχωρίσεις</span>
					</summary>
					<div class="body">
						{#if !d.comparable}
							<p class="note">Μία από τις δύο σαρώσεις δεν ήταν πλήρης. Η εβδομάδα δεν συγκρίνεται.</p>
						{:else}
							{#each [{ kind: 'add', title: 'Νέες', count: d.added, items: d.addedItems }, { kind: 'rem', title: 'Δεν επιστρέφονται πια', count: d.removed, items: d.removedItems }] as g (g.kind)}
								<div class="group">
									<h3><span class="sw {g.kind}" aria-hidden="true"></span> {g.title} <span class="n num">{fmtInt(g.count)}</span></h3>
									{#if g.count === 0}
										<p class="note">Καμία.</p>
									{:else}
										<ul>
											{#each sortItems(g.items) as it (it.providerId + ':' + it.specialtyId)}
												<li>
													<span class="smark {it.sector}" aria-hidden="true"></span>
													<span class="iname">{titleCase(it.name)}</span>
													<span class="imeta">{prefName(it.prefectureId)} · {specName(it.specialtyId)}</span>
												</li>
											{/each}
										</ul>
										{#if g.items.length < g.count}
											<p class="note">και {plural(g.count - g.items.length, 'ακόμη', 'ακόμη')} (η λίστα κόβεται στις {g.items.length}).</p>
										{/if}
									{/if}
								</div>
							{/each}
						{/if}
					</div>
				</details>
			{/each}
		</div>
		<p class="foot">«Δεν επιστρέφεται πια» σημαίνει ότι ο κατάλογος έπαψε να την επιστρέφει, όχι ότι έκλεισε.</p>
	{/if}
</section>

<style>
	.changes {
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
		max-width: 70ch;
		font-variant-numeric: tabular-nums;
	}
	.strong {
		color: var(--ink);
		font-weight: 600;
	}
	.empty {
		margin: 0.2rem 0;
		color: var(--ink-3);
	}
	.key {
		display: flex;
		gap: 1.2rem;
		font-size: 0.76rem;
		color: var(--ink-2);
	}
	.key span {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}
	.sw {
		display: inline-block;
		width: 14px;
		height: 10px;
		border-radius: 2px;
	}
	.sw.add {
		background: var(--accent);
	}
	.sw.rem {
		background: var(--ink-2);
	}
	.weeks {
		display: grid;
	}
	.week {
		border-top: 1px solid var(--line);
	}
	.week:last-child {
		border-bottom: 1px solid var(--line);
	}
	summary {
		list-style: none;
		display: grid;
		grid-template-columns: 8.5rem minmax(0, 1fr) auto;
		gap: 1rem;
		align-items: center;
		padding: 0.55rem 0.3rem;
		cursor: pointer;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	.when {
		font-size: 0.95rem;
		white-space: nowrap;
	}
	.pair {
		display: grid;
		gap: 3px;
	}
	.bar {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 2.6rem;
		align-items: center;
		gap: 0.4rem;
		height: 12px;
	}
	.bar .fill {
		display: block;
		height: 100%;
		width: max(2px, calc(var(--v) / var(--max) * 100%));
		border-radius: 2px;
	}
	.bar.add .fill {
		background: var(--accent);
	}
	.bar.rem .fill {
		background: var(--ink-2);
	}
	.bar .n {
		font-size: 0.86rem;
		line-height: 1;
		text-align: right;
	}
	.num {
		font-variant-numeric: tabular-nums;
	}
	.ncnote {
		display: inline-block;
		padding: 0 6px;
		border-radius: 3px;
		font-size: 0.78rem;
		color: var(--ink-2);
		justify-self: start;
	}
	.more {
		font-size: 0.78rem;
		color: var(--accent-d);
		font-weight: 500;
		text-decoration: underline;
		text-decoration-color: var(--line-2);
		text-underline-offset: 3px;
	}
	.week[open] .more {
		color: var(--ink-3);
	}
	.body {
		padding: 0.2rem 0.3rem 0.9rem;
		display: grid;
		gap: 0.8rem;
	}
	.group h3 {
		font-family: var(--sans);
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--ink-2);
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin-bottom: 0.4rem;
	}
	.group h3 .n {
		color: var(--ink-3);
		font-weight: 500;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.3rem;
	}
	li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		column-gap: 0.5rem;
		align-items: baseline;
		font-size: 0.88rem;
	}
	.iname {
		font-weight: 500;
	}
	.imeta {
		grid-column: 2;
		font-size: 0.76rem;
		color: var(--ink-3);
	}
	.note {
		margin: 0;
		font-size: 0.8rem;
		color: var(--ink-3);
	}
	.foot {
		margin: 0;
		font-size: 0.74rem;
		color: var(--ink-3);
	}
	@media (max-width: 600px) {
		summary {
			grid-template-columns: minmax(0, 1fr) auto;
			grid-template-areas:
				'when more'
				'pair pair';
			row-gap: 0.4rem;
		}
		.when {
			grid-area: when;
		}
		.pair {
			grid-area: pair;
		}
		.more {
			grid-area: more;
		}
	}
</style>
