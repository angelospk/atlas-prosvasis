<script lang="ts">
	// The one place the page is steered from. Sticky, compact: prefecture and specialty
	// pickers, the sectors folded behind «Φορείς», and a plain line that says what every
	// graphic below is showing. Controlled: each change is a new Selection through onChange.
	// It also sets `mode` for the list: a specialty with no prefecture lists prefectures,
	// anything else lists specialties.
	import type { AtlasData, Sector, Selection } from '$lib/atlas/types';
	import { SECTORS } from '$lib/atlas/types';
	import { buildIndex, fold, isDefaultSelection, orderSectors, SECTOR_SHORT, sectorsLabel, selectionLabel, titleCase } from './format';
	import Combobox, { type ComboOption } from './Combobox.svelte';

	let {
		data,
		selection,
		onChange,
		onReset
	}: {
		data: AtlasData;
		selection: Selection;
		onChange: (s: Selection) => void;
		onReset: () => void;
	} = $props();

	const uid = $props.id();
	const idx = $derived(buildIndex(data));

	const GREECE: ComboOption = { id: null, label: 'Όλη η Ελλάδα', sub: null, search: fold('Όλη η Ελλάδα ελλαδα') };
	const ALL_SPECS: ComboOption = { id: null, label: 'Όλες', sub: null, search: fold('Όλες οι ειδικότητες ολες') };
	const placeOptions = $derived<ComboOption[]>([
		GREECE,
		...[...data.prefectures]
			.sort((a, b) => a.name.localeCompare(b.name, 'el'))
			.map((p) => ({ id: p.id, label: p.name, sub: p.seat.label, search: fold(`${p.name} ${p.genitive} ${p.seat.label}`) }))
	]);
	const specOptions = $derived<ComboOption[]>([
		ALL_SPECS,
		...[...data.specialties]
			.sort((a, b) => a.name.localeCompare(b.name, 'el'))
			.map((s) => ({ id: s.id, label: titleCase(s.name), sub: null, search: fold(s.name) }))
	]);

	const line = $derived(selectionLabel(idx, selection));
	const dirty = $derived(!isDefaultSelection(selection));
	const sectorsSummary = $derived(sectorsLabel(selection.sectors) === 'όλοι οι φορείς' ? 'όλοι' : sectorsLabel(selection.sectors));

	function emit(next: Partial<Selection>) {
		const s = { ...selection, ...next };
		s.mode = s.specialtyId != null && s.prefectureId == null ? 'specialty' : 'place';
		onChange(s);
	}
	function toggleSector(s: Sector) {
		const on = selection.sectors.includes(s);
		if (on && selection.sectors.length === 1) return; // at least one sector stays on
		const sectors = on ? selection.sectors.filter((x) => x !== s) : orderSectors([...selection.sectors, s]);
		emit({ sectors });
	}
</script>

<div class="bar" role="region" aria-label="Επιλογή νομού, ειδικότητας και φορέων">
	<div class="pickers">
		<Combobox id="{uid}-place" label="Νομός" options={placeOptions} value={selection.prefectureId} onPick={(id) => emit({ prefectureId: id })} placeholder="Νομός ή έδρα" compact />
		<Combobox id="{uid}-spec" label="Ειδικότητα" options={specOptions} value={selection.specialtyId} onPick={(id) => emit({ specialtyId: id })} placeholder="Ειδικότητα" compact />
		<details class="sectors">
			<summary>
				<span class="slabel">Φορείς:</span> <span class="sval">{sectorsSummary}</span>
				<svg class="chev" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
			</summary>
			<div class="chips" role="group" aria-label="Φορείς">
				{#each SECTORS as s (s)}
					{@const on = selection.sectors.includes(s)}
					<button
						type="button"
						class="chip"
						class:on
						aria-pressed={on}
						disabled={on && selection.sectors.length === 1}
						title={on && selection.sectors.length === 1 ? 'Τουλάχιστον ένας φορέας μένει ενεργός' : undefined}
						onclick={() => toggleSector(s)}
					>
						<span class="smark {s}" class:off={!on} aria-hidden="true"></span>{SECTOR_SHORT[s]}
					</button>
				{/each}
			</div>
		</details>
	</div>
	<p class="line" aria-live="polite">
		<span class="see">Βλέπεις:</span> {line}
		{#if dirty}
			<button type="button" class="reset" onclick={onReset}>Καθαρισμός</button>
		{/if}
	</p>
</div>

<style>
	.bar {
		position: sticky;
		top: 0;
		z-index: 40;
		background: var(--paper);
		border-bottom: 1px solid var(--line-2);
		padding: 0.55rem 0 0.5rem;
		display: grid;
		gap: 0.4rem;
	}
	.pickers {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
		gap: 0.6rem;
		align-items: end;
	}
	.sectors {
		position: relative;
		align-self: end;
	}
	summary {
		list-style: none;
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		height: 38px;
		padding: 0 0.7rem;
		border: 1px solid var(--line-2);
		border-radius: var(--r-ctl);
		background: var(--card);
		font-size: 0.86rem;
		color: var(--ink-2);
		cursor: pointer;
		white-space: nowrap;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	.sval {
		color: var(--ink);
		font-weight: 500;
	}
	.chev {
		transition: transform 0.15s ease;
	}
	.sectors[open] .chev {
		transform: rotate(180deg);
	}
	.chips {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		z-index: 30;
		display: grid;
		gap: 0.3rem;
		padding: 0.5rem;
		background: var(--card);
		border: 1px solid var(--line-2);
		border-radius: 10px;
		box-shadow: var(--shadow);
		min-width: 12rem;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		height: 34px;
		padding: 0 0.75rem;
		border: 1px solid var(--line-2);
		border-radius: 6px;
		background: var(--card);
		font-size: 0.86rem;
		font-weight: 500;
		color: var(--ink-2);
		cursor: pointer;
		transition: border-color 0.15s ease, color 0.15s ease;
	}
	.chip:hover {
		border-color: var(--ink-3);
	}
	.chip.on {
		color: var(--ink);
		border-color: var(--ink);
	}
	.chip:disabled {
		cursor: default;
	}
	.line {
		margin: 0;
		font-size: 0.9rem;
		color: var(--ink);
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.5rem;
	}
	.see {
		color: var(--ink-3);
	}
	.reset {
		background: none;
		border: 0;
		padding: 0;
		font: inherit;
		font-size: 0.84rem;
		font-weight: 500;
		color: var(--accent-d);
		text-decoration: underline;
		text-decoration-color: var(--line-2);
		text-underline-offset: 3px;
		cursor: pointer;
	}
	.reset:hover {
		text-decoration-color: var(--accent);
	}
	@media (max-width: 719px) {
		/* One row: two pickers and the folded sectors; the line under it. ≈ 100px in all. */
		.bar {
			padding: 0.45rem 0 0.4rem;
			gap: 0.3rem;
		}
		.pickers {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
			gap: 0.4rem;
		}
		summary {
			padding: 0 0.5rem;
			font-size: 0.8rem;
		}
		.slabel {
			display: none;
		}
		.line {
			font-size: 0.82rem;
		}
	}
</style>
