<script lang="ts">
	// In how many of the 51 prefectures each specialty has at least one site (in the chosen
	// sectors). Horizontal bars, the gaps first: the shortest bar is the story. Eight rows,
	// the rest behind «Όλες οι ειδικότητες».
	import type { AtlasData, Sector } from '$lib/atlas/types';
	import { SECTORS, SECTOR_LABEL } from '$lib/atlas/types';
	import { buildIndex, deriveRows, fmtInt, parseKey, sectorsLabel, toCsv } from './format';
	import { downloadText } from './download';

	let {
		data,
		sectors,
		selectedSpecialtyId,
		onSelect
	}: {
		data: AtlasData;
		sectors: Sector[];
		selectedSpecialtyId: number | null;
		onSelect: (specialtyId: number) => void;
	} = $props();

	const SHOW = 8;
	const idx = $derived(buildIndex(data));
	const total = $derived(data.prefectures.length);
	const rows = $derived(
		deriveRows(data, idx, { mode: 'place', prefectureId: null, specialtyId: null, sectors })
			.map((r) => ({ ...r, specialtyId: parseKey(r.key)?.specialtyId ?? -1, prefsWith: r.prefsWith ?? 0 }))
			.sort((a, b) => a.prefsWith - b.prefsWith || a.name.localeCompare(b.name, 'el'))
	);
	let expanded = $state(false);
	const shown = $derived(expanded ? rows : rows.slice(0, SHOW));
	const hidden = $derived(rows.length - shown.length);
	const missingEverywhere = $derived(rows.filter((r) => r.prefsWith === 0).length);

	function exportCsv() {
		const cols = SECTORS.filter((s) => sectors.includes(s));
		const head = ['Ειδικότητα', `Νομοί με σημείο (από ${total})`, 'Έδρες πάνω από το όριο', 'Σύνολο σημείων', ...cols.map((s) => SECTOR_LABEL[s])];
		const body = rows.map((r) => [r.name, r.prefsWith, r.prefsFlagged ?? 0, r.count, ...cols.map((s) => r.counts[s] ?? 0)]);
		const meta = [[`Νομοί με τουλάχιστον ένα σημείο ανά ειδικότητα · ${sectorsLabel(sectors)}`], [`Σάρωση ${data.scan.at.slice(0, 10)} · ${data.scan.source}`], []];
		downloadText(`atlas-ειδικότητες-${data.scan.at.slice(0, 10)}.csv`, toCsv([...meta, head, ...body]));
	}
</script>

<section class="bars" aria-labelledby="atlas-bars-title">
	<header>
		<h2 id="atlas-bars-title">Σε πόσους νομούς υπάρχει κάθε ειδικότητα</h2>
		<p class="sub">
			Νομοί με τουλάχιστον ένα σημείο, από {total} · {sectorsLabel(sectors)}
			{#if missingEverywhere > 0}· <span class="strong">{missingEverywhere}</span> {missingEverywhere === 1 ? 'ειδικότητα' : 'ειδικότητες'} χωρίς καμία καταχώριση{/if}
		</p>
	</header>

	<ol class="list" style:--total={total}>
		{#each shown as r (r.key)}
			<li>
				<button
					type="button"
					class="row"
					class:sel={selectedSpecialtyId === r.specialtyId}
					class:none={r.prefsWith === 0}
					aria-pressed={selectedSpecialtyId === r.specialtyId}
					onclick={() => onSelect(r.specialtyId)}
					title={`${r.name}: σημείο σε ${r.prefsWith} από ${total} νομούς`}
				>
					<span class="name">{r.name}</span>
					<span class="track" aria-hidden="true">
						<span class="fill" style:--v={r.prefsWith}></span>
					</span>
					<span class="val num"><b>{fmtInt(r.prefsWith)}</b><span class="of"> από {total}</span></span>
				</button>
			</li>
		{/each}
	</ol>

	<div class="tools">
		{#if rows.length > SHOW}
			<button type="button" class="link" aria-expanded={expanded} onclick={() => (expanded = !expanded)}>
				{expanded ? 'Λιγότερες' : `Όλες οι ειδικότητες (${fmtInt(hidden)} ακόμη)`}
			</button>
		{/if}
		<span class="spacer"></span>
		<button type="button" class="tool" onclick={exportCsv}>CSV</button>
	</div>
</section>

<style>
	.bars {
		display: grid;
		gap: 0.8rem;
	}
	h2 {
		font-size: clamp(1.1rem, 1.8vw, 1.3rem);
	}
	.sub {
		margin: 0.3rem 0 0;
		font-size: 0.84rem;
		color: var(--ink-3);
		font-variant-numeric: tabular-nums;
	}
	.strong {
		color: var(--ink);
		font-weight: 600;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
	}
	.row {
		display: grid;
		grid-template-columns: minmax(0, 12rem) minmax(0, 1fr) 6.4rem;
		gap: 0.8rem;
		align-items: center;
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
	.row:hover {
		background: var(--card);
	}
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
	.name {
		font-size: 0.95rem;
		font-weight: 500;
		line-height: 1.25;
		min-width: 0;
	}
	.row.none .name {
		color: var(--ink-2);
	}
	.track {
		display: block;
		height: 12px;
		background: var(--paper-2);
		border-radius: 2px;
		position: relative;
		overflow: hidden;
	}
	.fill {
		position: absolute;
		inset: 0 auto 0 0;
		width: calc(var(--v) / var(--total) * 100%);
		background: var(--accent);
		border-radius: 2px;
		transition: width 0.2s ease;
	}
	.row.sel .fill {
		background: var(--ink);
	}
	.row.none .track {
		box-shadow: inset 2px 0 0 var(--urgent);
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
		font-family: var(--sans);
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
	.link:hover {
		text-decoration-color: var(--accent);
	}
	.tool {
		background: var(--card);
		border: 1px solid var(--line-2);
		border-radius: var(--r-ctl);
		padding: 0.4rem 0.8rem;
		font-size: 0.82rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--ink-2);
		cursor: pointer;
	}
	.tool:hover {
		border-color: var(--ink-3);
		color: var(--ink);
	}
	@media (max-width: 719px) {
		.row {
			grid-template-columns: minmax(0, 1fr) auto;
			grid-template-areas:
				'name  val'
				'track track';
			gap: 0.3rem 0.8rem;
			padding: 0.6rem 0.2rem;
		}
		.name {
			grid-area: name;
		}
		.val {
			grid-area: val;
		}
		.track {
			grid-area: track;
		}
		.row.sel::before {
			left: -0.3rem;
		}
	}
</style>
