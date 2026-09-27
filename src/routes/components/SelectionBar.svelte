<script lang="ts">
	import type { AtlasData, Sector, Selection } from '$lib/atlas/types';
	import { SECTORS } from '$lib/atlas/types';
	import { fold, orderSectors, SECTOR_SHORT, sectorsLabel, titleCase } from './format';
	import Combobox, { type ComboOption } from './Combobox.svelte';

	// The pickers of the sticky navigation bar: prefecture, specialty and sectors.
	// Searchable comboboxes on desktop, native selects on touch and narrow screens.
	let { data, selection, onChange }: { data: AtlasData; selection: Selection; onChange: (s: Selection) => void } = $props();

	const uid = $props.id();

	const GREECE: ComboOption = { id: null, label: 'Όλη η Ελλάδα', sub: null, search: fold('Όλη η Ελλάδα ελλαδα') };
	const ALL_SPECS: ComboOption = { id: null, label: 'Όλες οι ειδικότητες', sub: null, search: fold('Όλες οι ειδικότητες ολες') };
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

	const allSectors = $derived(selection.sectors.length === SECTORS.length);

	function emit(next: Partial<Selection>) {
		const s = { ...selection, ...next };
		s.mode = s.specialtyId != null && s.prefectureId == null ? 'specialty' : 'place';
		onChange(s);
	}
	function toggleSector(s: Sector) {
		const on = selection.sectors.includes(s);
		if (on && selection.sectors.length === 1) return;
		const sectors = on ? selection.sectors.filter((x) => x !== s) : orderSectors([...selection.sectors, s]);
		emit({ sectors });
	}
	function selectNumber(event: Event): number | null {
		const value = (event.currentTarget as HTMLSelectElement).value;
		return value === '' ? null : Number(value);
	}
</script>

<div class="pickers" role="group" aria-label="Επιλογή νομού, ειδικότητας και φορέων">
	<div class="desktop-pickers">
		<Combobox id={`${uid}-place`} label="Νομός" options={placeOptions} value={selection.prefectureId} onPick={(id) => emit({ prefectureId: id })} placeholder="Νομός ή έδρα" inline />
		<Combobox id={`${uid}-spec`} label="Ειδικότητα" options={specOptions} value={selection.specialtyId} onPick={(id) => emit({ specialtyId: id })} placeholder="Ειδικότητα" inline />
	</div>
	<div class="native-pickers">
		<label for={`${uid}-native-place`}><span class="sr-only">Νομός</span>
			<select id={`${uid}-native-place`} value={selection.prefectureId ?? ''} onchange={(event) => emit({ prefectureId: selectNumber(event) })}>
				<option value="">Όλη η Ελλάδα</option>
				{#each placeOptions.slice(1) as option (option.id)}<option value={option.id}>{option.label}</option>{/each}
			</select>
		</label>
		<label for={`${uid}-native-spec`}><span class="sr-only">Ειδικότητα</span>
			<select id={`${uid}-native-spec`} value={selection.specialtyId ?? ''} onchange={(event) => emit({ specialtyId: selectNumber(event) })}>
				<option value="">Όλες οι ειδικότητες</option>
				{#each specOptions.slice(1) as option (option.id)}<option value={option.id}>{option.label}</option>{/each}
			</select>
		</label>
	</div>
	<details class="sectors">
		<summary title={`Φορείς: ${sectorsLabel(selection.sectors)}`}>
			<span class="slabel">Φορείς</span>{#if !allSectors}<span class="count">{selection.sectors.length}/{SECTORS.length}</span>{/if}
			<svg class="chev" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
		</summary>
		<div class="chips" role="group" aria-label="Φορείς">
			{#each SECTORS as s (s)}
				{@const on = selection.sectors.includes(s)}
				<button type="button" class="chip" class:on aria-pressed={on} disabled={on && selection.sectors.length === 1} title={on && selection.sectors.length === 1 ? 'Τουλάχιστον ένας φορέας μένει ενεργός' : undefined} onclick={() => toggleSector(s)}>
					<span class="smark {s}" class:off={!on} aria-hidden="true"></span>{SECTOR_SHORT[s]}
				</button>
			{/each}
		</div>
	</details>
</div>

<style>
	.pickers { display: flex; align-items: center; gap: 0.4rem; min-width: 0; }
	.desktop-pickers { display: grid; grid-template-columns: minmax(0, 11rem) minmax(0, 13rem); gap: 0.4rem; min-width: 0; }
	.native-pickers { display: none; }
	.native-pickers label { min-width: 0; }
	select { width: 100%; min-width: 0; height: 40px; min-height: 40px; padding: 0 0.45rem; border: 1px solid var(--line-2); border-radius: var(--r-ctl); background: var(--card); color: var(--ink); font: inherit; font-size: 16px; text-overflow: ellipsis; }
	.sectors { position: relative; flex: none; }
	summary { list-style: none; display: inline-flex; align-items: center; gap: 0.3rem; height: 38px; min-height: 38px; padding: 0 0.6rem; border: 1px solid #ffffff59; border-radius: var(--r-ctl); color: #fff; font-size: 0.84rem; cursor: pointer; white-space: nowrap; }
	summary::-webkit-details-marker { display: none; }
	.count { background: #f2c56e; color: var(--ink); border-radius: 999px; padding: 0 0.35rem; font-size: 0.72rem; font-weight: 600; }
	.chev { transition: transform 0.15s ease; }
	.sectors[open] .chev { transform: rotate(180deg); }
	.chips { position: absolute; top: calc(100% + 6px); right: 0; z-index: 60; display: grid; gap: 0.3rem; padding: 0.5rem; background: var(--card); border: 1px solid var(--line-2); border-radius: 10px; box-shadow: var(--shadow); min-width: 12rem; }
	.chip { display: inline-flex; align-items: center; gap: 0.45rem; min-height: 44px; padding: 0 0.75rem; border: 1px solid var(--line-2); border-radius: 6px; background: var(--card); font-size: 0.86rem; font-weight: 500; color: var(--ink-2); cursor: pointer; }
	.chip.on { color: var(--ink); border-color: var(--ink); }
	summary:hover { background: #ffffff1f; }
	.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
	@media (max-width: 899px), (pointer: coarse) {
		.pickers { flex: 1; }
		.desktop-pickers { display: none; }
		.native-pickers { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0.35rem; flex: 1; min-width: 0; }
		summary { height: 40px; min-height: 40px; padding: 0 0.45rem; }
	}
	@media (max-width: 420px) {
		.slabel { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
		summary::before { content: ''; width: 16px; height: 16px; background: currentColor; mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M1 3h14M4 8h8M6.5 13h3' stroke='black' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E") center / contain no-repeat; }
	}
</style>
