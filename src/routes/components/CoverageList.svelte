<script lang="ts">
	import type { AtlasData, Metric, Provider, Selection } from '$lib/atlas/types';
	import { SECTORS, SECTOR_LABEL } from '$lib/atlas/types';
	import {
		buildIndex,
		daysFromScan,
		deriveRows,
		EMPTY,
		fmtDay,
		fmtInt,
		fmtKm,
		fmtOffset,
		fmtPer100k,
		fmtWaitCompact,
		METRIC_LABEL,
		nearestFor,
		nearbySites,
		parseKey,
		plural,
		prefLabel,
		providerDate,
		providerName,
		providersIn,
		sortRows,
		SECTOR_SHORT,
		titleCase
	} from './format';

	let {
		data,
		selection,
		sort,
		onSort,
		selectedKey,
		onSelect,
		compact = false,
		expanded = false,
		onExpandedChange = (_expanded: boolean) => {},
		onShowAll = null
	}: {
		data: AtlasData;
		selection: Selection;
		sort: Metric;
		onSort: (m: Metric) => void;
		selectedKey: string | null;
		onSelect: (key: string | null) => void;
		compact?: boolean;
		expanded?: boolean;
		onExpandedChange?: (expanded: boolean) => void;
		/** With a prefecture and a specialty chosen: drop the specialty, back to all of the prefecture. */
		onShowAll?: (() => void) | null;
	} = $props();

	const idx = $derived(buildIndex(data));
	const uid = $props.id();
	// A prefecture and a specialty together narrow the list to that one row.
	const cell = $derived(selection.mode === 'place' && selection.prefectureId != null && selection.specialtyId != null ? `${selection.prefectureId}:${selection.specialtyId}` : null);
	const cellPref = $derived(selection.prefectureId == null ? null : (idx.prefById.get(selection.prefectureId) ?? null));
	const rows = $derived(sortRows(deriveRows(data, idx, selection).filter((r) => cell == null || r.key === cell), sort));
	const shown = $derived(compact && !expanded ? rows.slice(0, 8) : rows);
	const national = $derived(selection.mode === 'place' && selection.prefectureId == null);
	const nameHead = $derived(selection.mode === 'specialty' ? 'Νομός' : 'Ειδικότητα');
	const flagKm = $derived(data.distanceFlagKm);
	const prefTotal = $derived(data.prefectures.length);
	const listId = $derived(`${uid}-coverage-rows`);
	const COLUMNS: Metric[] = ['count', 'per100k', 'earliestDate', 'nearestKm'];

	function mixTitle(counts: Record<string, number>): string {
		return SECTORS.map((s) => `${SECTOR_LABEL[s]}: ${counts[s] ?? 0}`).join(' · ');
	}
	const dateOffset = (date: string | null) => daysFromScan(date, data.scan.at);
	function detailId(key: string) {
		return `${uid}-detail-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
	}
	function mobileMetric(row: (typeof rows)[number]): string {
		if (sort === 'per100k') return `Ανά 100.000 κατοίκους: ${row.per100k == null ? 'Χωρίς στοιχεία' : fmtPer100k(row.per100k)}`;
		if (sort === 'nearestKm') return `Μεγαλύτερη απόσταση: ${row.nearestKm == null ? 'Χωρίς στοιχεία' : fmtKm(row.nearestKm)}`;
		return '';
	}
	function changeExpanded(next: boolean) {
		if (next || !compact || selectedKey == null || typeof document === 'undefined') {
			onExpandedChange(next);
			return;
		}
		const allKeys = [...document.querySelectorAll<HTMLElement>(`#${CSS.escape(listId)} .row[data-key]`)].map((row) => row.dataset.key);
		const hiddenSelection = allKeys.indexOf(selectedKey) >= 8;
		onExpandedChange(next);
		if (hiddenSelection) {
			onSelect(null);
			requestAnimationFrame(() => document.querySelector<HTMLElement>('.coverage-list .expand')?.focus());
		}
	}

	const PER_SECTOR = 8;
	const detail = $derived.by(() => {
		const k = selectedKey ? parseKey(selectedKey) : null;
		if (!k) return null;
		const spec = idx.specById.get(k.specialtyId) ?? null;
		const pref = k.prefectureId == null ? null : (idx.prefById.get(k.prefectureId) ?? null);
		const providers = providersIn(idx, k.prefectureId, k.specialtyId, selection.sectors);
		const byDate = (a: Provider, b: Provider) => {
			const da = providerDate(a, k.specialtyId) || '9';
			const db = providerDate(b, k.specialtyId) || '9';
			return da < db ? -1 : da > db ? 1 : a.name.localeCompare(b.name, 'el');
		};
		const groups = SECTORS.filter((s) => selection.sectors.includes(s))
			.map((sector) => {
				const items = providers.filter((p) => p.sector === sector).sort(byDate);
				return { sector, total: items.length, items: items.slice(0, PER_SECTOR) };
			})
			.filter((group) => group.total > 0);
		const cell = pref ? (idx.cellByKey.get(selectedKey!) ?? null) : null;
		const nearest = cell && providers.length === 0 ? nearestFor(idx, cell, selection.sectors) : null;
		const nearestPref = nearest?.provider?.prefectureId != null ? (idx.prefById.get(nearest.provider.prefectureId) ?? null) : null;
		// Where else to go: a few more sites after the nearest, each with its first date.
		const nearby = cell && providers.length === 0 && nearest?.provider ? nearbySites(idx, cell.prefectureId, cell.specialtyId, selection.sectors, nearest.provider.id) : [];
		return { spec, pref, providers, groups, nearest, nearestPref, nearby };
	});
</script>

<section id="atlas-list" class="coverage-list" aria-labelledby={`${uid}-list-title`}>
	<header class="list-head">
		<div>
			<h2 id={`${uid}-list-title`}>Κάλυψη</h2>
			<p class="note">Φορείς: {SECTORS.map((s) => SECTOR_SHORT[s]).join(' · ')}. Αποστάσεις από την έδρα, σε ευθεία.</p>
			{#if compact}<p class="note">Οι ημέρες μετρούν από τη σάρωση.</p>{/if}
		</div>
		{#if cell == null}<label class="mobile-sort" for={`${uid}-sort`}>Ταξινόμηση
			<select id={`${uid}-sort`} value={sort} onchange={(event) => onSort((event.currentTarget as HTMLSelectElement).value as Metric)}>
				<option value="count">Περισσότερα σημεία</option>
				<option value="per100k">Ανά 100.000 κατοίκους</option>
				<option value="earliestDate">Νωρίτερο ραντεβού</option>
				<option value="nearestKm">Μεγαλύτερη απόσταση</option>
			</select>
		</label>{/if}
	</header>

	<!-- A list of row buttons, not an ARIA table: table roles on a <button> hide that it is a button. -->
	<div class="table">
		{#if !compact}
		<div class="head">
			<span class="c-name">{nameHead}</span>
			<span class="c-mix" title="Φορείς: ΕΣΥ · ΠΦΥ · ΕΟΠΥΥ · Ιδιώτες">Φορείς</span>
			{#each COLUMNS as metric (metric)}
				{@const label = metric === 'nearestKm' ? (national ? `Έδρες > ${flagKm} χλμ` : 'Πλησιέστερος') : metric === 'count' && national ? 'Σημεία · νομοί' : METRIC_LABEL[metric]}
				<button type="button" class="c-{metric} sort" class:on={sort === metric} aria-pressed={sort === metric} onclick={() => onSort(metric)} title={metric === 'nearestKm' ? 'Από την έδρα, σε ευθεία' : undefined}><span class="sr-only">Ταξινόμηση:</span> {label}{#if sort === metric}<span class="arrow" aria-hidden="true">↓</span>{/if}</button>
			{/each}
		</div>
		{/if}

		{#if rows.length === 0}<p class="empty">Διάλεξε ειδικότητα για να δεις τους νομούς.</p>{/if}
		<ol id={listId} class="rows">
			{#each shown as r (r.key)}
				{@const off = dateOffset(r.earliestDate)}
				{@const open = selectedKey === r.key}
				<li class:open>
					<button type="button" class="row" data-key={r.key} class:sel={open} class:none={r.count === 0} aria-expanded={open} aria-controls={open ? detailId(r.key) : undefined} onclick={() => onSelect(open ? null : r.key)}>
						<span class="c-name"><span class="name">{r.name}</span>{#if r.sub}<span class="sub">{r.sub}</span>{/if}</span>
						<span class="c-mix mix" title={mixTitle(r.counts)} aria-label={mixTitle(r.counts)}>{#each SECTORS as sector (sector)}<span class="smark {sector}" class:off={!selection.sectors.includes(sector) || r.counts[sector] === 0}></span>{/each}</span>
						<span class="c-count num">
							<span class="desktop-count"><span class="sr-only">Σημεία:</span> {#if r.count === 0}<span class="zero">0</span>{:else}{fmtInt(r.count)}{/if}{#if national && r.prefsWith != null}<span class="sub">σε {r.prefsWith}/{prefTotal}</span>{/if}</span>
							<span class="mobile-count">{fmtInt(r.count)} {r.count === 1 ? 'σημείο' : 'σημεία'}{#if national && r.prefsWith != null}&nbsp;<span class="sub" aria-hidden="true">· Νομοί: {fmtInt(r.prefsWith)}</span><span class="sr-only">Κάλυψη σε {fmtInt(r.prefsWith)} νομούς</span>{/if}</span>
						</span>
						<span class="c-per100k num"><span class="sr-only">Ανά 100 χιλ. κατοίκους:</span> {#if r.count === 0}<span class="zero">{EMPTY}</span>{:else}{fmtPer100k(r.per100k)}{/if}</span>
						<span class="c-earliestDate num"><span class="sr-only">Πρώτο ραντεβού:</span>
							{#if compact}<span class="compact-date">{fmtWaitCompact(r.earliestDate, data.scan.at)}</span>{:else}<span class="full-date">{#if r.earliestDate}<span>{fmtDay(r.earliestDate)}</span><span class="sub">{fmtOffset(off)}</span>{:else}<span class="zero">{EMPTY}</span>{/if}</span>{/if}
						</span>
						{#if !compact}<span class="c-nearestKm num" class:national-distance={national}><span class="sr-only">{national ? `Έδρες πάνω από ${flagKm} χλμ:` : 'Πλησιέστερο από την έδρα:'}</span>
							{#if national}{#if (r.prefsFlagged ?? 0) > 0}<span class="flag">{r.prefsFlagged} {r.prefsFlagged === 1 ? 'έδρα' : 'έδρες'}</span><span class="sub">έως {fmtKm(r.nearestKm)}</span>{:else if r.nearestUnknown}<span class="unknown hatch">άγνωστο</span>{:else}<span class="ok">καμία</span>{/if}
							{:else if r.count > 0}<span class="ok">εντός</span>{#if r.nearestKm != null && r.nearestKm > 0}<span class="sub">{fmtKm(r.nearestKm)} από την έδρα</span>{/if}
							{:else if r.nearestUnknown}<span class="unknown hatch">άγνωστο</span>{:else}<span class:flag={r.flagged}>{fmtKm(r.nearestKm)}</span>{/if}
						</span>{/if}
						{#if compact && (sort === 'per100k' || sort === 'nearestKm')}<span class="mobile-metric">{mobileMetric(r)}</span>{/if}
					</button>

					{#if open && detail}
						<div id={detailId(r.key)} class="detail">
							{#if detail.providers.length === 0}
								<p class="dsum">Δεν καταγράφεται σημείο{selection.sectors.length < SECTORS.length ? ' στους επιλεγμένους φορείς' : ''}.</p>
								{#if detail.nearest}
									{#if detail.nearest.unknown || !detail.nearest.provider}<p class="dnear"><span class="hatch swatch" aria-hidden="true"></span>Χωρίς μέτρηση: κανένα σημείο με θέση στους επιλεγμένους φορείς.</p>
									{:else}<p class="dnear"><span class="dlabel">Πλησιέστερο:</span><b>{providerName(detail.nearest.provider)}</b><span class="muted">{titleCase(detail.nearest.provider.city)}{detail.nearestPref ? `, ${prefLabel(detail.nearestPref)}` : ''}</span><span class="km" class:flag={detail.nearest.km != null && detail.nearest.km > flagKm}>{fmtKm(detail.nearest.km)}</span><span class="muted">Από την έδρα του νομού, σε ευθεία.</span></p>{/if}
								{/if}
								{#if detail.nearby.length}
									<section class="group alt"><h4>Άλλα κοντινά σημεία</h4>
										<ul>{#each detail.nearby as { provider, km } (provider.id)}{@const date = providerDate(provider, detail.spec?.id ?? 0)}<li><span class="pname">{providerName(provider)}</span><span class="ptown">{titleCase(provider.city)}{provider.prefectureId != null ? `, ${prefLabel(idx.prefById.get(provider.prefectureId))}` : ''} · <span class="km" class:flag={km > flagKm}>{fmtKm(km)}</span></span><span class="pdate">{#if compact}<span class="compact-date">{fmtWaitCompact(date, data.scan.at)}</span>{:else}<span class="full-date">{date ? fmtDay(date) : EMPTY}</span>{/if}</span></li>{/each}</ul>
									</section>
								{/if}
							{:else}
								<p class="dsum">{plural(detail.providers.length, 'σημείο', 'σημεία')}{detail.pref ? ` στον ${detail.pref.genitive}` : ' σε όλη την Ελλάδα'} · ημερομηνίες από τη σάρωση της {fmtDay(data.scan.at)}.</p>
								<div class="groups">
									{#each detail.groups as group (group.sector)}
										<section class="group"><h4><span class="smark {group.sector}" aria-hidden="true"></span>{SECTOR_LABEL[group.sector]} <span class="n">{group.total}</span></h4>
											<ul>{#each group.items as provider (provider.id)}<li><span class="pname">{providerName(provider)}</span><span class="ptown">{titleCase(provider.city)}{!detail.pref && provider.prefectureId != null ? `, ${prefLabel(idx.prefById.get(provider.prefectureId))}` : ''}{provider.lat == null ? ' · χωρίς θέση' : provider.approx ? ' · θέση περίπου' : ''}</span><span class="pdate">{#if compact}<span class="compact-date">{fmtWaitCompact(providerDate(provider, detail.spec?.id ?? 0), data.scan.at)}</span>{:else}<span class="full-date">{providerDate(provider, detail.spec?.id ?? 0) ? fmtDay(providerDate(provider, detail.spec?.id ?? 0)) : EMPTY}</span>{/if}</span></li>{/each}</ul>
											{#if group.total > group.items.length}<p class="more-sites">και {group.total - group.items.length} ακόμη</p>{/if}</section>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ol>
	</div>

	{#if cell != null && onShowAll && cellPref}
		<button type="button" class="expand" onclick={onShowAll}>Όλες οι ειδικότητες στον {prefLabel(cellPref)}</button>
	{/if}
	{#if compact && rows.length > 8}
		<button type="button" class="expand" aria-expanded={expanded} aria-controls={listId} onclick={() => changeExpanded(!expanded)}>{expanded ? 'Λιγότερες' : 'Περισσότερες'}</button>
	{/if}
</section>

<style>
	.coverage-list { display: grid; gap: 0.7rem; min-width: 0; scroll-margin-top: calc(var(--atlas-bar-height, 0px) + 12px); }
	.list-head { display: flex; align-items: end; justify-content: space-between; gap: 1rem; min-width: 0; }
	h2 { font-size: clamp(1.35rem, 3vw, 1.8rem); }
	.note { margin: 0.2rem 0 0; color: var(--ink-3); font-size: 0.78rem; }
	.mobile-sort { display: none; align-items: center; gap: 0.45rem; color: var(--ink-2); font-size: 0.8rem; font-weight: 600; }
	.mobile-sort select { min-height: 44px; max-width: 100%; border: 1px solid var(--line-2); border-radius: var(--r-ctl); background: var(--card); color: var(--ink); padding: 0 0.45rem; font: inherit; font-size: 16px; }
	.table { min-width: 0; }
	.head, .row { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(5.5rem, 0.7fr) minmax(5.5rem, 0.65fr) minmax(6rem, 0.75fr) minmax(8rem, 0.95fr) minmax(8rem, 1fr); gap: 0.7rem; align-items: center; min-width: 0; }
	.head { padding: 0 0.5rem 0.4rem; border-bottom: 1px solid var(--line-2); color: var(--ink-3); font-size: 0.74rem; font-weight: 600; }
	.head .sort { background: none; border: 0; padding: 0; color: inherit; font: inherit; text-align: right; cursor: pointer; white-space: normal; }
	.head .sort:hover, .head .sort.on { color: var(--ink); }
	.arrow { margin-left: 0.15rem; }
	.rows { list-style: none; margin: 0; padding: 0; min-width: 0; }
	.rows li { border-bottom: 1px solid var(--line); min-width: 0; }
	.rows li.open { background: var(--card); }
	.row { position: relative; width: 100%; padding: 0.65rem 0.5rem; border: 0; background: none; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
	.row:hover { background: var(--card); }
	.row.sel::before { content: ''; position: absolute; left: -0.5rem; top: 0.35rem; bottom: 0.35rem; width: 2px; background: var(--accent); }
	.row.none .name { color: var(--ink-2); }
	.c-name, .c-mix, .c-count, .c-per100k, .c-earliestDate, .c-nearestKm { min-width: 0; }
	.name { display: block; overflow-wrap: anywhere; font-size: 0.98rem; font-weight: 600; line-height: 1.25; }
	.sub { display: block; color: var(--ink-3); font-size: 0.74rem; line-height: 1.3; font-weight: 400; }
	.mix { display: inline-flex; gap: 3px; align-self: center; }
	.num { text-align: right; font-size: 0.92rem; font-variant-numeric: tabular-nums; }
	.desktop-count { display: block; }
	.mobile-count, .compact-date, .mobile-metric { display: none; }
	.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
	.zero { color: var(--ink-3); }
	.ok { color: var(--ink-3); font-size: 0.86rem; }
	.flag { color: var(--urgent); font-weight: 600; }
	.unknown { display: inline-block; padding: 0 5px; color: var(--ink-2); font-size: 0.78rem; border-radius: 3px; }
	.empty { margin: 1rem 0.5rem; color: var(--ink-3); }
	.expand { justify-self: start; min-height: 44px; padding: 0 0.85rem; border: 1px solid var(--line-2); border-radius: var(--r-ctl); background: var(--card); color: var(--ink-2); font: inherit; font-size: 0.84rem; font-weight: 600; cursor: pointer; }
	.detail { margin: 0; padding: 0.2rem 0.5rem 0.9rem 1.1rem; border-left: 2px solid var(--accent); font-size: 0.86rem; min-width: 0; }
	.dsum { margin: 0 0 0.5rem; color: var(--ink-2); }
	.dnear { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.3rem 0.5rem; margin: 0; }
	.dlabel { color: var(--ink-3); }
	.dnear b { font-weight: 600; }
	.km { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
	.km.flag { color: var(--urgent); }
	.muted { color: var(--ink-3); font-weight: 400; }
	.swatch { display: inline-block; width: 14px; height: 10px; border: 1px solid var(--line-2); border-radius: 2px; }
	.groups { display: grid; gap: 0.7rem; }
	.alt { margin-top: 0.6rem; }
	.group h4 { display: flex; align-items: center; gap: 0.4rem; margin: 0 0 0.3rem; color: var(--ink-2); font-family: var(--sans); font-size: 0.76rem; font-weight: 600; }
	.group h4 .n { color: var(--ink-3); font-weight: 500; }
	.group ul { display: grid; gap: 0.3rem; list-style: none; margin: 0; padding: 0; }
	.group li { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto; gap: 0.2rem 0.8rem; align-items: baseline; }
	.pname { min-width: 0; overflow-wrap: anywhere; font-weight: 500; line-height: 1.3; }
	.ptown { min-width: 0; color: var(--ink-2); font-size: 0.8rem; overflow-wrap: anywhere; }
	.pdate { color: var(--accent-d); font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; text-align: right; }
	.more-sites { margin: 0.3rem 0 0; color: var(--ink-3); font-size: 0.78rem; }
	@media (max-width: 899px) {
		.list-head { align-items: start; }
		.mobile-sort { display: grid; justify-items: start; }
		.head { display: none; }
		.row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-areas: 'name name' 'mix mix' 'count date' 'metric metric'; gap: 0.25rem 0.7rem; padding: 0.7rem 0.5rem; }
		.c-name { grid-area: name; }
		.c-mix { grid-area: mix; }
		.c-count { grid-area: count; text-align: left; }
		.c-per100k { display: none; }
		.c-earliestDate { grid-area: date; }
		.c-nearestKm { display: none; }
		.c-nearestKm .sub, .c-count .sub, .c-earliestDate .sub { display: inline; margin-left: 0.3rem; }
		.desktop-count, .full-date { display: none; }
		.mobile-count, .compact-date { display: block; }
		.mobile-count { text-align: left; font-weight: 600; }
		.mobile-count .sub { margin-left: 0; }
		.mobile-metric { display: block; grid-area: metric; color: var(--ink-2); font-size: 0.78rem; }
		.detail { padding-left: 0.8rem; margin-left: 0.5rem; }
		.group li { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
		.pdate { grid-column: 1 / -1; text-align: left; }
		.pdate .compact-date { display: inline; }
	}
	@media (max-width: 430px) {
		.list-head { display: block; }
		.mobile-sort { margin-top: 0.5rem; }
		.explanation { grid-template-columns: minmax(0, 1fr); }
	}
</style>
