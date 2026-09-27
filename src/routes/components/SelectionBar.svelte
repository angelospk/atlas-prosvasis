<script lang="ts">
	import { onMount } from 'svelte';
	import type { AtlasData, Sector, Selection } from '$lib/atlas/types';
	import { SECTORS } from '$lib/atlas/types';
	import { fold, isDefaultSelection, orderSectors, SECTOR_SHORT, sectorsLabel, titleCase } from './format';
	import { SECTION_IDS, type Section } from './navigation';
	import Combobox, { type ComboOption } from './Combobox.svelte';

	let {
		data,
		selection,
		onChange,
		onReset,
		showNavigation = true,
		activeSection = 'map',
		onNavigate = (_section: Section) => {},
		updating = false,
		onHeightChange = (_height: number) => {}
	}: {
		data: AtlasData;
		selection: Selection;
		onChange: (s: Selection) => void;
		onReset: () => void;
		showNavigation?: boolean;
		activeSection?: Section;
		onNavigate?: (section: Section) => void;
		updating?: boolean;
		onHeightChange?: (height: number) => void;
	} = $props();

	const uid = $props.id();
	let barEl = $state<HTMLElement | null>(null);

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

	const dirty = $derived(!isDefaultSelection(selection));
	const sectorsSummary = $derived(sectorsLabel(selection.sectors) === 'όλοι οι φορείς' ? 'όλοι' : sectorsLabel(selection.sectors));
	const navItems: { section: Section; label: string }[] = [
		{ section: 'map', label: 'Χάρτης' },
		{ section: 'list', label: 'Λίστα' },
		{ section: 'waits', label: 'Αναμονή' },
		{ section: 'details', label: 'Αναλυτικά' }
	];

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

	onMount(() => {
		if (!showNavigation) return;
		const publish = () => {
			if (!barEl) return;
			const height = Math.ceil(barEl.getBoundingClientRect().height);
			barEl.style.setProperty('--atlas-bar-height', `${height}px`);
			document.documentElement.style.setProperty('--atlas-bar-height', `${height}px`);
			onHeightChange(height);
		};
		publish();
		if (typeof ResizeObserver === 'undefined' || !barEl) return;
		const observer = new ResizeObserver(publish);
		observer.observe(barEl);
		return () => observer.disconnect();
	});
</script>

<div class="bar" class:standalone={!showNavigation} bind:this={barEl} role="region" aria-label="Επιλογή νομού, ειδικότητας και φορέων">
	<div class="picker-row">
		<div class="desktop-pickers">
			<Combobox id={`${uid}-place`} label="Νομός" options={placeOptions} value={selection.prefectureId} onPick={(id) => emit({ prefectureId: id })} placeholder="Νομός ή έδρα" compact />
			<Combobox id={`${uid}-spec`} label="Ειδικότητα" options={specOptions} value={selection.specialtyId} onPick={(id) => emit({ specialtyId: id })} placeholder="Ειδικότητα" compact />
		</div>
		<div class="native-pickers">
			<label class="native-field" for={`${uid}-native-place`}>
				<span>Νομός</span>
				<select id={`${uid}-native-place`} value={selection.prefectureId ?? ''} onchange={(event) => emit({ prefectureId: selectNumber(event) })}>
					<option value="">Όλη η Ελλάδα</option>
					{#each placeOptions.slice(1) as option (option.id)}
						<option value={option.id}>{option.label}</option>
					{/each}
				</select>
			</label>
			<label class="native-field" for={`${uid}-native-spec`}>
				<span>Ειδικότητα</span>
				<select id={`${uid}-native-spec`} value={selection.specialtyId ?? ''} onchange={(event) => emit({ specialtyId: selectNumber(event) })}>
					<option value="">Όλες</option>
					{#each specOptions.slice(1) as option (option.id)}
						<option value={option.id}>{option.label}</option>
					{/each}
				</select>
			</label>
		</div>
		<details class="sectors">
			<summary>
				<span class="slabel">Φορείς:</span> <span class="sval">{sectorsSummary}</span>
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
		{#if dirty}
			<button type="button" class="reset" onclick={onReset}>Καθαρισμός</button>
		{/if}
	</div>

	{#if showNavigation}<div class="bar-bottom">
		<nav class="section-nav" aria-label="Ενότητες">
			{#each navItems as item, i (item.section)}
				{#if i > 0}<span class="separator" aria-hidden="true">·</span>{/if}
				<a href={`#${SECTION_IDS[item.section]}`} class:active={activeSection === item.section} aria-current={activeSection === item.section ? 'location' : undefined} onclick={() => onNavigate(item.section)}>{item.label}</a>
			{/each}
		</nav>
		<span class="status" role="status" aria-live="polite" class:busy={updating}>
			{#if updating}<span class="spinner" aria-hidden="true"></span>Ενημέρωση…{/if}
		</span>
	</div>
{/if}</div>

<style>
 .bar.standalone { position:relative; z-index:30; padding:0 0 1rem; background:transparent; }
	.bar {
		position: sticky;
		top: 0;
		z-index: 40;
		background: var(--paper);
		border-bottom: 1px solid var(--line-2);
		padding: 0.55rem 0 0.5rem;
		display: grid;
		gap: 0.45rem;
		min-width: 0;
	}
	.picker-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto auto;
		gap: 0.6rem;
		align-items: end;
		min-width: 0;
	}
	.desktop-pickers { display: contents; }
	.native-pickers { display: none; }
	.native-field { display: grid; gap: 0.15rem; min-width: 0; font-size: 0.8rem; font-weight: 600; color: var(--ink-2); }
	.native-field select { width: 100%; min-width: 0; max-width: 100%; box-sizing: border-box; height: 44px; padding: 0 0.55rem; border: 1px solid var(--line-2); border-radius: var(--r-ctl); background: var(--card); color: var(--ink); font: inherit; font-size: 16px; }
	.sectors { position: relative; align-self: end; }
	summary { list-style: none; display: inline-flex; align-items: center; gap: 0.3rem; min-height: 44px; padding: 0 0.7rem; border: 1px solid var(--line-2); border-radius: var(--r-ctl); background: var(--card); font-size: 0.86rem; color: var(--ink-2); cursor: pointer; white-space: nowrap; }
	summary::-webkit-details-marker { display: none; }
	.sval { color: var(--ink); font-weight: 500; }
	.chev { transition: transform 0.15s ease; }
	.sectors[open] .chev { transform: rotate(180deg); }
	.chips { position: absolute; top: calc(100% + 4px); right: 0; z-index: 30; display: grid; gap: 0.3rem; padding: 0.5rem; background: var(--card); border: 1px solid var(--line-2); border-radius: 10px; box-shadow: var(--shadow); min-width: 12rem; max-width: min(100vw - 2rem, 20rem); }
	.chip { display: inline-flex; align-items: center; gap: 0.45rem; min-height: 44px; padding: 0 0.75rem; border: 1px solid var(--line-2); border-radius: 6px; background: var(--card); font-size: 0.86rem; font-weight: 500; color: var(--ink-2); cursor: pointer; }
	.chip.on { color: var(--ink); border-color: var(--ink); }
	.reset { min-height: 44px; background: none; border: 0; padding: 0 0.2rem; font: inherit; font-size: 0.84rem; font-weight: 500; color: var(--accent-d); text-decoration: underline; text-decoration-color: var(--line-2); text-underline-offset: 3px; cursor: pointer; white-space: nowrap; }
	.bar-bottom { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; min-width: 0; }
	.section-nav { display: flex; align-items: center; justify-content: flex-start; gap: clamp(0.35rem, 2vw, 0.9rem); min-width: 0; flex: 1; }
	.section-nav a { min-height: 44px; display: inline-flex; align-items: center; color: var(--ink-2); font-size: clamp(0.75rem, 2.6vw, 0.92rem); text-decoration: none; white-space: nowrap; border-bottom: 2px solid transparent; }
	.section-nav a.active { color: var(--ink); border-bottom-color: var(--accent); }
	.separator { color: var(--line-2); flex: none; }
	.status { display: inline-flex; align-items: center; justify-content: flex-end; gap: 0.35rem; min-width: 5.5rem; min-height: 44px; font-size: 0.76rem; color: var(--ink-3); white-space: nowrap; }
	.spinner { width: 0.75rem; height: 0.75rem; border: 1.5px solid var(--line-2); border-top-color: var(--accent); border-radius: 50%; animation: atlas-spin 0.8s linear infinite; }
	@keyframes atlas-spin { to { transform: rotate(360deg); } }
	@media (max-width: 899px), (pointer: coarse) {
		.desktop-pickers { display: none; }
		.native-pickers { display: grid; grid-column: 1 / -1; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0.4rem; min-width: 0; }
		.picker-row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0.4rem; }
		.sectors { grid-column: 1; }
		.reset { grid-column: 2; justify-self: end; }
		.bar { padding: 0.4rem 0 0.35rem; gap: 0.3rem; }
		.slabel { display: none; }
		summary { padding-inline: 0.5rem; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
		.status { min-width: 0; }
	}
	@media (max-width: 340px) {
		.status { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
	}
</style>
