<script lang="ts">
	// The week's findings, numbered. The text comes from the data (template-generated in
	// coverage.py); this component only lays it out and turns each finding into a button
	// that applies its selection on the prefecture map, plus «Δες αναλυτικά» for its sites.
	import type { AtlasReport, Selection } from '$lib/atlas/types';
	import { fmtDateLong, fmtDayShort, plural } from './format';

	let {
		report,
		onSelect
	}: {
		report: AtlasReport;
		onSelect: (s: Partial<Selection>, evidenceKey: string | null, target: 'map' | 'points') => void;
	} = $props();

	const SHOW = 4;
	const scanDate = $derived(fmtDateLong(report.scan.at));
	// The interval this scan is compared with: only a comparable delta ENDING at this scan.
	// An older comparison under this scan's heading would misdate the change.
	const compared = $derived(
		report.history.find((d) => d.comparable && d.to.slice(0, 10) === report.scan.at.slice(0, 10)) ?? null
	);
	const completeScans = $derived(report.scans.filter((s) => s.complete).length);
	const findings = $derived(report.findings.slice(0, SHOW));
</script>

<section class="briefing" aria-labelledby="atlas-briefing-title">
	<header>
		<h2 id="atlas-briefing-title">Τι δείχνει η σάρωση της <span class="date">{scanDate}</span></h2>
		<p class="context">
			{#if compared}
				Σε σύγκριση με τη σάρωση της {fmtDayShort(compared.from)}
				{#if compared.added > 0 || compared.removed > 0}
					· {plural(compared.added, 'νέα καταχώριση', 'νέες καταχωρίσεις')}, {compared.removed} δεν
					{compared.removed === 1 ? 'επιστρέφεται' : 'επιστρέφονται'} πια
				{:else}
					· καμία αλλαγή στον κατάλογο
				{/if}
				{#if completeScans > 1}· {plural(completeScans, 'πλήρης σάρωση', 'πλήρεις σαρώσεις')} ως τώρα{/if}
			{:else if completeScans > 1}
				Δεν συγκρίνεται με την προηγούμενη σάρωση (άλλαξε ο τρόπος καταγραφής). Η σύγκριση
				ξαναρχίζει την επόμενη εβδομάδα.
			{:else}
				Πρώτη πλήρης σάρωση. Η σύγκριση ξεκινά την επόμενη εβδομάδα.
			{/if}
		</p>
	</header>

	{#if findings.length === 0}
		<p class="empty">Δεν προέκυψαν ευρήματα από αυτή τη σάρωση.</p>
	{:else}
		<ol class="findings">
			{#each findings as f, i (f.id)}
				<li>
					<span class="n num" aria-hidden="true">{i + 1}</span>
					{#if f.selection}
						<div class="finding">
							<span class="text" id={`finding-${f.id}`}>{f.text}</span>
							<span class="actions">
								<button type="button" class="go" aria-describedby={`finding-${f.id}`} onclick={() => onSelect(f.selection ?? {}, f.evidenceKey, 'map')}>Δες το στον χάρτη</button>
								{#if f.evidenceKey}<button type="button" class="go" aria-describedby={`finding-${f.id}`} onclick={() => onSelect(f.selection ?? {}, f.evidenceKey, 'points')}>Δες αναλυτικά</button>{/if}
							</span>
						</div>
					{:else}
						<p class="finding static"><span class="text">{f.text}</span></p>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
</section>

<style>
	.briefing {
		display: grid;
		gap: 0.9rem;
		padding: 0.5rem 0 0.8rem;
		border-bottom: 1px solid var(--line);
	}
	header {
		max-width: 62ch;
	}
	h2 {
		font-size: clamp(1.3rem, 2.4vw, 1.7rem);
	}
	.date {
		white-space: nowrap;
	}
	.context {
		margin: 0.4rem 0 0;
		font-size: 0.86rem;
		color: var(--ink-3);
	}
	.findings {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0;
		max-width: 70ch;
	}
	.findings li {
		display: grid;
		grid-template-columns: 2rem minmax(0, 1fr);
		gap: 0.6rem;
		align-items: baseline;
		border-top: 1px solid var(--line);
		padding: 0.75rem 0;
	}
	.n {
		font-size: 1.2rem;
		line-height: 1;
		color: var(--ink-3);
		font-weight: 500;
		text-align: right;
	}
	.finding {
		display: grid;
		gap: 0.3rem;
		margin: 0;
		color: var(--ink);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0 1.2rem;
	}
	.text {
		font-size: clamp(1rem, 1.5vw, 1.12rem);
		line-height: 1.45;
		text-wrap: pretty;
	}
	.go {
		min-height: 32px;
		padding: 0;
		background: none;
		border: 0;
		cursor: pointer;
		font-size: 0.82rem;
		font-weight: 500;
		color: var(--accent-d);
		text-decoration: underline;
		text-decoration-color: var(--line-2);
		text-underline-offset: 3px;
		transition: text-decoration-color 0.15s ease;
	}
	.go:hover {
		text-decoration-color: var(--accent);
	}
	.empty {
		margin: 0;
		color: var(--ink-3);
	}
	@media (max-width: 600px) {
		.findings li {
			grid-template-columns: 1.5rem minmax(0, 1fr);
			gap: 0.45rem;
		}
		.n {
			font-size: 1.05rem;
		}
	}
</style>
