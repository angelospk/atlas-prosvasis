<script lang="ts">
	// A prefecture × specialty next to another prefecture, same specialty and sectors: the figures
	// the summary gives, side by side, so the reader does not have to switch and remember. The
	// better value of each row is set bold (more per 100k, sooner date, nearer site).
	import type { AtlasData, Selection } from '$lib/atlas/types';
	import { buildIndex, cellRowFor, daysFromScan, EMPTY, fmtDay, fmtInt, fmtKm, fmtOffset, fmtPer100k, prefLabel, titleCase, type Row } from './format';

	let { data, selection, otherId = $bindable(null) }: { data: AtlasData; selection: Selection; otherId?: number | null } = $props();
	const uid = $props.id();
	const idx = $derived(buildIndex(data));
	const pref = $derived(selection.prefectureId == null ? null : (idx.prefById.get(selection.prefectureId) ?? null));
	const spec = $derived(selection.specialtyId == null ? null : (idx.specById.get(selection.specialtyId) ?? null));
	const others = $derived([...data.prefectures].filter((p) => p.id !== pref?.id).sort((a, b) => a.name.localeCompare(b.name, 'el')));
	// A stale pick (the reader moved to that very prefecture) shows nothing rather than a self-comparison.
	const other = $derived(otherId != null && otherId !== pref?.id ? (idx.prefById.get(otherId) ?? null) : null);
	const rows = $derived(pref && spec && other ? [cellRowFor(data, idx, pref.id, spec.id, selection.sectors), cellRowFor(data, idx, other.id, spec.id, selection.sectors)] as const : null);

	type Line = { label: string; value: (r: Row | null) => string; score: (r: Row | null) => number | null; sub?: (r: Row | null) => string };
	const LINES: Line[] = [
		{ label: 'Σημεία παροχής', value: (r) => (r ? fmtInt(r.count) : EMPTY), score: (r) => r?.count ?? null },
		{ label: 'Ανά 100 χιλ. κατοίκους', value: (r) => (r && r.count > 0 ? fmtPer100k(r.per100k) : EMPTY), score: (r) => (r && r.count > 0 ? r.per100k : null) },
		{
			label: 'Πρώτο ραντεβού',
			value: (r) => (r?.earliestDate ? fmtDay(r.earliestDate) : EMPTY),
			sub: (r) => (r?.earliestDate ? fmtOffset(daysFromScan(r.earliestDate, data.scan.at)) : ''),
			score: (r) => { const d = r?.earliestDate ? daysFromScan(r.earliestDate, data.scan.at) : null; return d == null ? null : -d; }
		},
		{ label: 'Πλησιέστερο από την έδρα', value: (r) => (r?.nearestKm == null ? 'άγνωστο' : fmtKm(r.nearestKm)), score: (r) => (r?.nearestKm == null ? null : -r.nearestKm) }
	];
	const better = (line: Line, i: 0 | 1) => {
		if (!rows) return false;
		const [a, b] = [line.score(rows[i]), line.score(rows[1 - i])];
		return a != null && (b == null || a > b);
	};
</script>

{#if pref && spec}
	<section class="compare" aria-labelledby={`${uid}-title`}>
		<h3 id={`${uid}-title`}>{titleCase(spec.name)}: σύγκριση νομών</h3>
		<label class="pick">Σύγκρινε με άλλον νομό
			<select value={other?.id ?? ''} onchange={(e) => { const v = e.currentTarget.value; otherId = v ? Number(v) : null; }}>
				<option value="">Διάλεξε νομό</option>
				{#each others as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
			</select>
		</label>
		{#if rows && other}
			<table>
				<thead><tr><td></td><th scope="col">{pref.name}</th><th scope="col">{other.name}</th></tr></thead>
				<tbody>
					{#each LINES as line (line.label)}
						<tr>
							<th scope="row">{line.label}</th>
							{#each [0, 1] as const as i (i)}
								<td class:better={better(line, i)}>{line.value(rows[i])}{#if line.sub?.(rows[i])}<small>{line.sub(rows[i])}</small>{/if}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
			<p class="note">{prefLabel(pref)} και {prefLabel(other)} · ίδιοι φορείς · αποστάσεις σε ευθεία από την έδρα.</p>
		{/if}
	</section>
{/if}

<style>
	.compare { display: grid; gap: 0.6rem; margin-top: 1rem; padding: 0.8rem 0.9rem; background: var(--card); border: 1px solid var(--line); border-radius: 10px; font-size: 0.82rem; }
	h3 { margin: 0; font: 600 0.88rem var(--sans); color: var(--ink); }
	.pick { display: grid; gap: 0.3rem; color: var(--ink-3); font-size: 0.76rem; }
	select { width: 100%; min-width: 0; height: 44px; border: 1px solid var(--line-2); border-radius: var(--r-ctl); padding: 0 0.6rem; color: var(--ink); background: var(--card); font: inherit; font-size: 16px; }
	table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
	th, td { padding: 0.4rem 0.3rem; border-top: 1px solid var(--paper-2); text-align: right; vertical-align: baseline; }
	thead > tr > * { border-top: 0; }
	thead th { font-weight: 600; color: var(--ink); overflow-wrap: anywhere; }
	tbody th { text-align: left; font-weight: 400; color: var(--ink-3); }
	td { color: var(--ink-2); }
	td.better { color: var(--ink); font-weight: 700; }
	small { display: block; color: var(--ink-3); font-size: 0.7rem; font-weight: 400; }
	.note { margin: 0; color: var(--ink-3); font-size: 0.72rem; }
</style>
