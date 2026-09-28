<script lang="ts">
	// The headline for the current selection: one plain sentence, then a few figures set
	// on a shared baseline. Deliberately not KPI tiles: the numbers answer different questions
	// and sit next to each other so none of them reads as "the score". A figure that stands for
	// a set (specialties without a site, seats beyond the threshold…) opens it underneath; each
	// entry then selects its specialty or prefecture.
	import type { AtlasData, Selection } from '$lib/atlas/types';
	import { SECTORS, SECTOR_LABEL } from '$lib/atlas/types';
	import { buildIndex, daysFromScan, deriveRows, EMPTY, fmtDay, fmtInt, fmtKm, fmtOffset, fmtPer100k, parseKey, plural, prefLabel, providersIn, SECTOR_SHORT, titleCase, uniqueSites, type Row } from './format';

	let {
		data,
		selection,
		onPickSpecialty = null,
		onPickPrefecture = null,
		onShowSites = null,
		request = $bindable(null)
	}: {
		data: AtlasData;
		selection: Selection;
		onPickSpecialty?: ((id: number) => void) | null;
		onPickPrefecture?: ((id: number) => void) | null;
		/** Opens the sites themselves (the point map); without it the panel only counts them. */
		onShowSites?: (() => void) | null;
		/** A list to open from outside (a key finding); cleared once opened. */
		request?: 'sites' | null;
	} = $props();
	const uid = $props.id();

	const idx = $derived(buildIndex(data));
	const rows = $derived(deriveRows(data, idx, selection));
	const pref = $derived(selection.prefectureId == null ? null : (idx.prefById.get(selection.prefectureId) ?? null));
	const spec = $derived(selection.specialtyId == null ? null : (idx.specById.get(selection.specialtyId) ?? null));
	const flagKm = $derived(data.distanceFlagKm);

	// A specialty with no site anywhere in Greece (in these sectors) has no distance to measure:
	// it is «nowhere», not «unmeasured», and counts once, under «without a site».
	const specOf = (r: Row) => parseKey(r.key)?.specialtyId ?? null;
	const nowhere = (r: Row) => specOf(r) != null && providersIn(idx, null, specOf(r)!, selection.sectors).length === 0;

	// «Σημεία παροχής» counts each site once, whatever its specialties: the unit of the panel it
	// opens and of the key findings.
	const sites = $derived(uniqueSites(data, selection));
	const total = $derived(sites.length);
	// A prefecture and a specialty together: that one row.
	const cellRow = $derived(pref && spec ? (rows.find((r) => r.key === `${pref.id}:${spec.id}`) ?? null) : null);
	const bySector = $derived(SECTORS.filter((s) => selection.sectors.includes(s)).map((s) => ({ s, n: sites.filter((p) => p.sector === s).length })));
	const without = $derived(rows.filter((r) => r.count === 0));
	const withProvider = $derived(rows.length - without.length);
	const flaggedRows = $derived(rows.filter((r) => r.count === 0 && r.flagged).sort((a, b) => (b.nearestKm ?? 0) - (a.nearestKm ?? 0)));
	const flagged = $derived(flaggedRows.length);
	const unknownRows = $derived(rows.filter((r) => r.count === 0 && r.nearestUnknown && !nowhere(r)));
	const unknown = $derived(unknownRows.length);
	const farthest = $derived(rows.reduce<number | null>((m, r) => (r.count === 0 && r.nearestKm != null && (m == null || r.nearestKm > m) ? r.nearestKm : m), null));
	const population = $derived(pref ? pref.population : idx.population);
	const per100k = $derived(population > 0 ? (total / population) * 100_000 : null);

	// National (place mode, no prefecture): rows are specialties with prefsWith / prefsFlagged.
	const halfRows = $derived(rows.filter((r) => r.prefsWith != null && r.prefsWith < data.prefectures.length / 2).sort((a, b) => (a.prefsWith ?? 0) - (b.prefsWith ?? 0)));
	const farRows = $derived(rows.filter((r) => (r.prefsFlagged ?? 0) > 0).sort((a, b) => (b.prefsFlagged ?? 0) - (a.prefsFlagged ?? 0)));
	const anyFlagged = $derived(farRows.length);
	const nationalFlaggedSeats = $derived(rows.reduce((n, r) => n + (r.prefsFlagged ?? 0), 0));

	type Open = 'sites' | 'without' | 'flagged' | 'unknown' | 'half' | 'far';
	let open = $state<Open | null>(null);
	// A new selection closes the open list (its entries belong to the old one).
	let lastKey = '';
	$effect.pre(() => {
		const key = `${selection.mode}|${selection.prefectureId}|${selection.specialtyId}|${selection.sectors.join()}`;
		if (key !== lastKey) { lastKey = key; open = null; }
	});
	$effect(() => {
		if (request) { open = request; request = null; }
	});
	const toggle = (o: Open) => (open = open === o ? null : o);
	const panelId = $derived(`${uid}-more`);

	interface Entry { key: string; name: string; note: string; pick: (() => void) | null }
	const entry = (r: Row, note: string): Entry => {
		const k = parseKey(r.key);
		const pick = selection.mode === 'specialty'
			? (k?.prefectureId != null && onPickPrefecture ? () => onPickPrefecture!(k.prefectureId!) : null)
			: (k && onPickSpecialty ? () => onPickSpecialty!(k.specialtyId) : null);
		return { key: r.key, name: r.name, note, pick };
	};
	const nearNote = (r: Row) => (nowhere(r) ? 'πουθενά στην Ελλάδα' : r.nearestUnknown ? 'χωρίς μέτρηση' : `πλησιέστερο ${fmtKm(r.nearestKm)}`);
	const entries = $derived.by((): Entry[] => {
		if (open === 'without') return without.map((r) => entry(r, nearNote(r)));
		if (open === 'flagged') return flaggedRows.map((r) => entry(r, fmtKm(r.nearestKm)));
		if (open === 'unknown') return unknownRows.map((r) => entry(r, 'κανένα σημείο με θέση'));
		if (open === 'half') return halfRows.map((r) => entry(r, `${r.prefsWith}/${data.prefectures.length} νομοί`));
		if (open === 'far') return farRows.map((r) => entry(r, plural(r.prefsFlagged ?? 0, 'έδρα', 'έδρες')));
		return [];
	});
	const HINT = $derived<Record<Open, string>>({
		sites: '',
		without: 'Χωρίς σημείο στον κατάλογο',
		flagged: `Πλησιέστερο πάνω από ${flagKm} χλμ από την έδρα, σε ευθεία`,
		unknown: 'Υπάρχουν σημεία, αλλά κανένα με αξιόπιστη θέση για να μετρηθεί απόσταση',
		half: 'Σε λιγότερους από τους μισούς νομούς',
		far: `Έδρες νομών με το πλησιέστερο πάνω από ${flagKm} χλμ`
	});
</script>

{#snippet fig(o: Open, label: string, value: string, cls = '')}
	<div>
		<dt>{label}</dt>
		<dd class="num {cls}"><button type="button" class="more" aria-label={`${label}: ${value}`} aria-expanded={open === o} aria-controls={panelId} onclick={() => toggle(o)}>{value}<svg class="chev" viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg></button></dd>
	</div>
{/snippet}

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
				{@render fig('sites', 'Σημεία παροχής', fmtInt(total))}
				<div><dt>Ανά 100 χιλ. κατοίκους</dt><dd class="num">{fmtPer100k(per100k)}</dd></div>
				{#if without.length}{@render fig('without', 'Νομοί χωρίς πάροχο', fmtInt(without.length))}{:else}<div><dt>Νομοί χωρίς πάροχο</dt><dd class="num">0</dd></div>{/if}
				{#if flagged}{@render fig('flagged', 'Μακρύτερη έδρα', fmtKm(farthest), 'flag')}{:else}<div><dt>Μακρύτερη έδρα</dt><dd class="num">{fmtKm(farthest)}</dd></div>{/if}
				{#if unknown > 0}{@render fig('unknown', 'Χωρίς μέτρηση', fmtInt(unknown), 'unknown')}{/if}
			</dl>
		{:else}
			<p class="lede muted">Διάλεξε ειδικότητα για να δεις πού υπάρχει και πού λείπει.</p>
		{/if}
	{:else if pref && spec}
		<p class="lede">
			Στον <b>{prefLabel(pref)}</b>, <b>{titleCase(spec.name)}</b>:
			{#if total > 0}
				<b class="num">{plural(total, 'σημείο', 'σημεία')}</b> παροχής στον κατάλογο.
			{:else if cellRow?.nearestKm != null}
				κανένα σημείο στον κατάλογο · το πλησιέστερο είναι <span class="num" class:flag={cellRow.flagged}>{fmtKm(cellRow.nearestKm)}</span> από την έδρα ({pref.seat.label}), σε ευθεία.
			{:else}
				κανένα σημείο στον κατάλογο.
			{/if}
		</p>
		<dl class="figures">
			{#if total > 0}{@render fig('sites', 'Σημεία παροχής', fmtInt(total))}{:else}<div><dt>Σημεία παροχής</dt><dd class="num">0</dd></div>{/if}
			<div><dt>Ανά 100 χιλ. κατοίκους</dt><dd class="num">{fmtPer100k(per100k)}</dd></div>
			<div><dt>Πλησιέστερο από την έδρα</dt><dd class="num" class:flag={cellRow?.flagged}>{cellRow?.nearestKm == null ? EMPTY : fmtKm(cellRow.nearestKm)}</dd></div>
			<div><dt>Πρώτο ραντεβού</dt><dd class="num">{#if cellRow?.earliestDate}{fmtDay(cellRow.earliestDate)} <small>{fmtOffset(daysFromScan(cellRow.earliestDate, data.scan.at))}</small>{:else}{EMPTY}{/if}</dd></div>
		</dl>
	{:else if pref}
		<p class="lede">
			Στον <b>{prefLabel(pref)}</b>: <b class="num">{withProvider} από {rows.length}</b> ειδικότητες με πάροχο
			στον κατάλογο
			{#if flagged > 0}
				· για <button type="button" class="inline" aria-label={`${flagged} ειδικότητες πάνω από ${flagKm} χλμ`} aria-expanded={open === 'flagged'} aria-controls={panelId} onclick={() => toggle('flagged')}><b class="num">{flagged}</b></button> ο πλησιέστερος είναι πάνω από <span class="num">{flagKm} χλμ</span>
				από την έδρα ({pref.seat.label}), σε ευθεία.
			{:else if unknown === 0}
				· καμία με πλησιέστερο πάνω από <span class="num">{flagKm} χλμ</span> από την έδρα ({pref.seat.label}).
			{/if}
		</p>
		<dl class="figures">
			{@render fig('sites', 'Σημεία παροχής', fmtInt(total))}
			<div><dt>Ανά 100 χιλ. κατοίκους</dt><dd class="num">{fmtPer100k(per100k)}</dd></div>
			<div><dt>Κάτοικοι ({data.populationYear})</dt><dd class="num">{fmtInt(pref.population)}</dd></div>
			{#if without.length}{@render fig('without', 'Ειδικότητες χωρίς πάροχο', fmtInt(without.length))}{:else}<div><dt>Ειδικότητες χωρίς πάροχο</dt><dd class="num">0</dd></div>{/if}
			{#if flagged}{@render fig('flagged', `Πάνω από ${flagKm} χλμ`, fmtInt(flagged), 'flag')}{/if}
			{#if unknown > 0}{@render fig('unknown', 'Χωρίς μέτρηση', fmtInt(unknown), 'unknown')}{/if}
		</dl>
	{:else}
		<p class="lede">
			Σε <b>όλη την Ελλάδα</b> ο κατάλογος έχει <b class="num">{fmtInt(total)}</b> σημεία με ραντεβού
			σε {plural(rows.length, 'ειδικότητα', 'ειδικότητες')}.
			{#if anyFlagged > 0}
				Σε <button type="button" class="inline" aria-label={`${anyFlagged} ειδικότητες με έδρα πάνω από ${flagKm} χλμ`} aria-expanded={open === 'far'} aria-controls={panelId} onclick={() => toggle('far')}><b class="num">{anyFlagged}</b></button> από αυτές, κάποιος νομός έχει την πιο κοντινή πάνω από
				<span class="num">{flagKm} χλμ</span> μακριά.
			{/if}
		</p>
		<dl class="figures">
			{@render fig('sites', 'Σημεία παροχής', fmtInt(total))}
			<div><dt>Ανά 100 χιλ. κατοίκους</dt><dd class="num">{fmtPer100k(per100k)}</dd></div>
			{@render fig('half', 'Ειδικότητες σε λιγότερους από μισούς νομούς', fmtInt(halfRows.length))}
			{@render fig('far', `Περιπτώσεις πάνω από ${flagKm} χλμ`, fmtInt(nationalFlaggedSeats), nationalFlaggedSeats > 0 ? 'flag' : '')}
		</dl>
	{/if}

	<div class="panel" id={panelId} hidden={!open}>
			{#if open === 'sites'}
				<p class="hint">{plural(sites.length, 'μοναδικό σημείο', 'μοναδικά σημεία')} (ένα σημείο μετριέται μία φορά, όσες ειδικότητες κι αν έχει)</p>
				<ul class="sectors">
					{#each bySector as x (x.s)}<li title={SECTOR_LABEL[x.s]}><span class="smark {x.s}" aria-hidden="true"></span>{SECTOR_SHORT[x.s]}<b class="num">{fmtInt(x.n)}</b></li>{/each}
				</ul>
				{#if onShowSites}<button type="button" class="go" onclick={onShowSites}>Δες τα σημεία στον χάρτη ↓</button>{/if}
			{:else if open}
				<p class="hint">{HINT[open]}</p>
				<ul class="entries">
					{#each entries as e (e.key)}
						<li>{#if e.pick}<button type="button" onclick={e.pick}><span>{e.name}</span><small>{e.note}</small></button>{:else}<span class="static"><span>{e.name}</span><small>{e.note}</small></span>{/if}</li>
					{/each}
				</ul>
			{/if}
	</div>
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
	.more { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.15rem 0; min-height: 28px; background: none; border: 0; font: inherit; color: inherit; cursor: pointer; text-decoration: underline; text-decoration-color: var(--line-2); text-underline-offset: 4px; }
	.more:hover { text-decoration-color: var(--accent); }
	.more .chev { color: var(--ink-3); transition: transform 0.15s ease; }
	.more[aria-expanded='true'] .chev { transform: rotate(180deg); }
	.inline { padding: 0.1rem 0.15rem; min-height: 24px; background: none; border: 0; font: inherit; color: inherit; cursor: pointer; text-decoration: underline; text-decoration-color: var(--accent); text-underline-offset: 3px; }
	.more:focus-visible, .inline:focus-visible, .panel button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 3px; }
	.panel[hidden] { display: none; }
	.panel { display: grid; gap: 0.6rem; padding: 0.8rem 0.9rem; background: var(--card); border: 1px solid var(--line); border-radius: 10px; }
	.hint { margin: 0; font-size: 0.76rem; color: var(--ink-3); }
	.sectors { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.4rem 1.1rem; font-size: 0.84rem; color: var(--ink-2); }
	.sectors li { display: inline-flex; align-items: center; gap: 0.35rem; }
	.sectors b { color: var(--ink); font-weight: 600; }
	.go { justify-self: start; min-height: 40px; padding: 0 0.8rem; border: 1px solid var(--accent); border-radius: var(--r-ctl); background: var(--accent); color: #fff; font: inherit; font-size: 0.8rem; font-weight: 600; cursor: pointer; }
	.entries { list-style: none; margin: 0; padding: 0; display: grid; max-height: 16rem; overflow-y: auto; }
	.entries li + li { border-top: 1px solid var(--paper-2); }
	.entries button, .entries .static { display: flex; justify-content: space-between; align-items: baseline; gap: 0.8rem; width: 100%; min-height: 36px; padding: 0.35rem 0.2rem; background: none; border: 0; font: inherit; font-size: 0.86rem; color: var(--ink); text-align: left; }
	.entries button { cursor: pointer; }
	.entries button:hover { background: var(--paper); }
	.entries small { flex: none; font-size: 0.74rem; color: var(--ink-3); font-variant-numeric: tabular-nums; }
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
