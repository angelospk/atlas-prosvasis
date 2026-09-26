<script lang="ts">
	// The primary surface: one row per specialty (place mode) or per prefecture (specialty
	// mode), the same six columns in both. Sorting is a header click. A row click expands it
	// in place (one at a time): the sites behind it by sector, or the nearest one when the
	// prefecture has none. `selectedKey` is the expanded row; clicking it again collapses
	// (onSelect(null)). On phones the row folds into two lines and the header disappears.
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
		METRIC_LABEL,
		nearestFor,
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
		onSelect
	}: {
		data: AtlasData;
		selection: Selection;
		sort: Metric;
		onSort: (m: Metric) => void;
		/** The expanded row's key, or null. */
		selectedKey: string | null;
		/** Called with the row's key to expand it, with null to collapse the open one. */
		onSelect: (key: string | null) => void;
	} = $props();

	const idx = $derived(buildIndex(data));
	const rows = $derived(sortRows(deriveRows(data, idx, selection), sort));
	const national = $derived(selection.mode === 'place' && selection.prefectureId == null);
	const nameHead = $derived(selection.mode === 'specialty' ? 'Νομός' : 'Ειδικότητα');
	const flagKm = $derived(data.distanceFlagKm);
	const prefTotal = $derived(data.prefectures.length);

	function mixTitle(counts: Record<string, number>): string {
		return SECTORS.map((s) => `${SECTOR_LABEL[s]}: ${counts[s] ?? 0}`).join(' · ');
	}
	// Header order = cell order below (METRICS lists the distance before the date).
	const COLUMNS: Metric[] = ['count', 'per100k', 'earliestDate', 'nearestKm'];
	const ariaSort = (m: Metric) => (sort === m ? 'descending' : 'none') as 'descending' | 'none';

	// ---- the expanded row: sites by sector, or the nearest one ----
	const PER_SECTOR = 8;
	const isPublic = (p: Provider) => p.sector === 'esy' || p.sector === 'pfy';
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
			.map((s) => {
				const items = providers.filter((p) => p.sector === s).sort(byDate);
				return { sector: s, total: items.length, items: items.slice(0, PER_SECTOR) };
			})
			.filter((g) => g.total > 0);
		const cell = pref ? (idx.cellByKey.get(selectedKey!) ?? null) : null;
		const nearest = cell && providers.length === 0 ? nearestFor(idx, cell, selection.sectors) : null;
		const nearestPref = nearest?.provider?.prefectureId != null ? (idx.prefById.get(nearest.provider.prefectureId) ?? null) : null;
		return { key: selectedKey!, specialtyId: k.specialtyId, spec, pref, providers, groups, nearest, nearestPref };
	});
</script>

<div class="list" role="table" aria-label="Κάλυψη">
	<div class="head" role="row">
		<span class="c-name" role="columnheader">{nameHead}</span>
		<span class="c-mix" role="columnheader" title="Φορείς: ΕΣΥ · ΠΦΥ · ΕΟΠΥΥ · Ιδιώτες">Φορείς</span>
		{#each COLUMNS as m (m)}
			{@const label =
				m === 'nearestKm'
					? national
						? `Έδρες > ${flagKm} χλμ`
						: 'Πλησιέστερος'
					: m === 'count' && national
						? 'Σημεία · νομοί'
						: METRIC_LABEL[m]}
			<button
				type="button"
				class="c-{m} sort"
				class:on={sort === m}
				role="columnheader"
				aria-sort={ariaSort(m)}
				onclick={() => onSort(m)}
				title={m === 'nearestKm' ? 'Από την έδρα, σε ευθεία' : undefined}
			>
				{label}
				{#if sort === m}<span class="arrow" aria-hidden="true">↓</span>{/if}
			</button>
		{/each}
	</div>

	{#if rows.length === 0}
		<p class="empty">Διάλεξε ειδικότητα για να δεις τους νομούς.</p>
	{/if}

	<ol class="rows" role="rowgroup">
		{#each rows as r (r.key)}
			{@const off = daysFromScan(r.earliestDate, data.scan.at)}
			{@const open = selectedKey === r.key}
			<li role="presentation" class:open>
				<button
					type="button"
					class="row"
					data-key={r.key}
					class:sel={open}
					class:none={r.count === 0}
					role="row"
					aria-expanded={open}
					onclick={() => onSelect(open ? null : r.key)}
				>
					<span class="c-name" role="cell">
						<span class="name">{r.name}</span>
						{#if r.sub}<span class="sub">{r.sub}</span>{/if}
					</span>

					<span class="c-mix mix" role="cell" title={mixTitle(r.counts)} aria-label={mixTitle(r.counts)}>
						{#each SECTORS as s (s)}
							<span class="smark {s}" class:off={!selection.sectors.includes(s) || r.counts[s] === 0}></span>
						{/each}
					</span>

					<span class="c-count num" role="cell">
						{#if r.count === 0}
							<span class="zero" title="Δεν καταγράφηκε πάροχος">0</span>
						{:else}
							{fmtInt(r.count)}
						{/if}
						{#if national && r.prefsWith != null}
							<span class="sub">σε {r.prefsWith}/{prefTotal}</span>
						{/if}
					</span>

					<span class="c-per100k num" role="cell">
						{#if r.count === 0}<span class="zero">{EMPTY}</span>{:else}{fmtPer100k(r.per100k)}{/if}
					</span>

					<span class="c-earliestDate num" role="cell">
						{#if r.earliestDate}
							<span>{fmtDay(r.earliestDate)}</span>
							<span class="sub">{fmtOffset(off)}</span>
						{:else}
							<span class="zero" title="Μόνο τα δημόσια σημεία δίνουν ημερομηνία">{EMPTY}</span>
						{/if}
					</span>

					<span class="c-nearestKm num" role="cell">
						{#if national}
							{#if (r.prefsFlagged ?? 0) > 0}
								<span class="flag">{r.prefsFlagged} {r.prefsFlagged === 1 ? 'έδρα' : 'έδρες'}</span>
								<span class="sub">έως {fmtKm(r.nearestKm)}</span>
							{:else if r.nearestUnknown}
								<span class="unknown hatch" title="Χωρίς μέτρηση">άγνωστο</span>
							{:else}
								<span class="ok">καμία</span>
							{/if}
						{:else if r.count > 0}
							<span class="ok" title="Υπάρχει πάροχος στον νομό">εντός</span>
							{#if r.nearestKm != null && r.nearestKm > 0}<span class="sub">{fmtKm(r.nearestKm)} από την έδρα</span>{/if}
						{:else if r.nearestUnknown}
							<span class="unknown hatch" title="Κανένας πάροχος με θέση στους επιλεγμένους φορείς">άγνωστο</span>
						{:else}
							<span class:flag={r.flagged} title={r.flagged ? `Πάνω από ${flagKm} χλμ από την έδρα, σε ευθεία` : 'Από την έδρα, σε ευθεία'}>
								{fmtKm(r.nearestKm)}
							</span>
						{/if}
					</span>
				</button>

				{#if open && detail}
					<div class="detail" role="row">
						<div role="cell">
							{#if detail.providers.length === 0}
								<p class="dsum">
									Δεν καταγράφεται σημείο{selection.sectors.length < SECTORS.length ? ' στους επιλεγμένους φορείς' : ''}.
								</p>
								{#if detail.nearest}
									{#if detail.nearest.unknown || !detail.nearest.provider}
										<p class="dnear"><span class="hatch swatch" aria-hidden="true"></span> Χωρίς μέτρηση: κανένα σημείο με θέση στους επιλεγμένους φορείς.</p>
									{:else}
										<p class="dnear">
											<span class="smark {detail.nearest.provider.sector}" aria-hidden="true"></span>
											<span class="dlabel">Πλησιέστερο:</span>
											<b>{providerName(detail.nearest.provider)}</b>
											<span class="muted">{titleCase(detail.nearest.provider.city)}{detail.nearestPref ? `, ${prefLabel(detail.nearestPref)}` : ''}</span>
											<span class="km" class:flag={detail.nearest.km != null && detail.nearest.km > flagKm}>{fmtKm(detail.nearest.km)} από {detail.pref?.seat.label ?? 'την έδρα'}, σε ευθεία</span>
										</p>
									{/if}
								{/if}
							{:else}
								<p class="dsum">
									{plural(detail.providers.length, 'σημείο', 'σημεία')}{detail.pref ? '' : ' σε όλη την Ελλάδα'} · ημερομηνίες από τη σάρωση της {fmtDay(data.scan.at)}
								</p>
								<div class="groups">
									{#each detail.groups as g (g.sector)}
										<section class="group">
											<h4><span class="smark {g.sector}" aria-hidden="true"></span> {SECTOR_LABEL[g.sector]} <span class="n num">{g.total}</span></h4>
											<ul>
												{#each g.items as p (p.id)}
													{@const pDate = providerDate(p, detail.specialtyId)}
													<li>
														<span class="pname">{providerName(p)}</span>
														<span class="ptown">
															{titleCase(p.city)}{!detail.pref && p.prefectureId != null ? `, ${prefLabel(idx.prefById.get(p.prefectureId))}` : ''}
															{#if p.lat == null}<span class="muted">· χωρίς θέση</span>{:else if p.approx}<span class="muted">· θέση περίπου</span>{/if}
														</span>
														{#if isPublic(p)}
															<span class="pdate num">
																{#if pDate}{fmtDay(pDate)} <span class="muted">{fmtOffset(daysFromScan(pDate, data.scan.at))}</span>{:else}<span class="muted">χωρίς ημερομηνία</span>{/if}
															</span>
														{/if}
													</li>
												{/each}
											</ul>
											{#if g.total > g.items.length}
												<p class="more">και {g.total - g.items.length} ακόμη</p>
											{/if}
										</section>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</li>
		{/each}
	</ol>

	<p class="foot">
		Φορείς: {SECTORS.map((s) => SECTOR_SHORT[s]).join(' · ')}. Αποστάσεις από την έδρα, σε ευθεία. Κλικ σε γραμμή για τα σημεία.
	</p>
</div>

<style>
	.list {
		display: grid;
		gap: 0;
		--cols: minmax(0, 1.8fr) 4.2rem 5.2rem 5.2rem 6.6rem 6.8rem;
	}
	.head,
	.row {
		display: grid;
		grid-template-columns: var(--cols);
		gap: 0.6rem;
		align-items: baseline;
	}
	.head {
		border-bottom: 1px solid var(--line-2);
		padding: 0 0.5rem 0.4rem;
		font-size: 0.74rem;
		color: var(--ink-3);
		font-weight: 600;
		letter-spacing: 0.01em;
	}
	.head .sort {
		background: none;
		border: 0;
		padding: 0;
		font: inherit;
		color: inherit;
		text-align: right;
		cursor: pointer;
		justify-self: end;
		white-space: nowrap;
	}
	.head .sort:hover {
		color: var(--ink);
	}
	.head .sort.on {
		color: var(--ink);
	}
	.arrow {
		margin-left: 0.15rem;
	}
	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.rows li {
		border-bottom: 1px solid var(--line);
	}
	.rows li.open {
		background: var(--card);
	}
	.row {
		width: 100%;
		text-align: left;
		background: none;
		border: 0;
		padding: 0.6rem 0.5rem;
		font: inherit;
		color: var(--ink);
		cursor: pointer;
		border-radius: 0;
		position: relative;
		transition: background-color 0.15s ease;
	}
	.row:hover {
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
	.row.none .name {
		color: var(--ink-2);
	}
	.name {
		font-size: 0.98rem;
		font-weight: 600;
		display: block;
		line-height: 1.25;
	}
	.sub {
		display: block;
		font-size: 0.74rem;
		color: var(--ink-3);
		line-height: 1.3;
		font-weight: 400;
	}
	.c-name {
		min-width: 0;
	}
	.mix {
		display: inline-flex;
		gap: 3px;
		align-self: center;
	}
	.num {
		font-variant-numeric: tabular-nums;
		text-align: right;
		font-size: 0.95rem;
	}
	.zero {
		color: var(--ink-3);
	}
	.ok {
		color: var(--ink-3);
		font-size: 0.86rem;
	}
	.flag {
		color: var(--urgent);
		font-weight: 600;
	}
	.unknown {
		display: inline-block;
		padding: 0 5px;
		font-size: 0.78rem;
		color: var(--ink-2);
		border-radius: 3px;
	}
	.empty {
		margin: 1rem 0.5rem;
		color: var(--ink-3);
	}
	.foot {
		margin: 0.6rem 0.5rem 0;
		font-size: 0.74rem;
		color: var(--ink-3);
	}

	/* ---- the expanded row ---- */
	.detail {
		padding: 0.2rem 0.5rem 0.9rem 1.1rem;
		border-left: 2px solid var(--accent);
		margin-left: 0;
		font-size: 0.86rem;
	}
	.dsum {
		margin: 0 0 0.5rem;
		color: var(--ink-2);
	}
	.dnear {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.3rem 0.5rem;
	}
	.dlabel {
		color: var(--ink-3);
	}
	.dnear b {
		font-weight: 600;
	}
	.km {
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}
	.km.flag {
		color: var(--urgent);
	}
	.muted {
		color: var(--ink-3);
		font-weight: 400;
	}
	.swatch {
		display: inline-block;
		width: 14px;
		height: 10px;
		border: 1px solid var(--line-2);
		border-radius: 2px;
		vertical-align: -1px;
	}
	.groups {
		display: grid;
		gap: 0.7rem;
	}
	.group h4 {
		font-family: var(--sans);
		font-size: 0.76rem;
		font-weight: 600;
		color: var(--ink-2);
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-bottom: 0.3rem;
	}
	.group h4 .n {
		color: var(--ink-3);
		font-weight: 500;
	}
	.group ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.3rem;
	}
	.group li {
		display: grid;
		grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto;
		gap: 0.2rem 0.8rem;
		align-items: baseline;
	}
	.pname {
		font-weight: 500;
		line-height: 1.3;
	}
	.ptown {
		color: var(--ink-2);
		font-size: 0.8rem;
	}
	.pdate {
		font-variant-numeric: tabular-nums;
		color: var(--accent-d);
		font-weight: 600;
		white-space: nowrap;
		text-align: right;
	}
	.more {
		margin: 0.3rem 0 0;
		font-size: 0.78rem;
		color: var(--ink-3);
	}

	@media (max-width: 720px) {
		.head {
			display: none;
		}
		.row {
			grid-template-columns: minmax(0, 1fr) auto auto;
			grid-template-areas:
				'name  mix   count'
				'near  near  date';
			row-gap: 0.25rem;
			padding: 0.7rem 0.5rem;
		}
		.c-name {
			grid-area: name;
		}
		.c-mix {
			grid-area: mix;
		}
		.c-count {
			grid-area: count;
		}
		.c-per100k {
			display: none;
		}
		.c-earliestDate {
			grid-area: date;
		}
		.c-nearestKm {
			grid-area: near;
			text-align: left;
		}
		.c-nearestKm .sub,
		.c-count .sub {
			display: inline;
			margin-left: 0.3rem;
		}
		.c-earliestDate .sub {
			display: inline;
			margin-left: 0.3rem;
		}
		.row.sel::before {
			left: 0;
		}
		.detail {
			padding-left: 0.8rem;
			margin-left: 0.5rem;
		}
		.group li {
			grid-template-columns: minmax(0, 1fr) auto;
		}
		.ptown {
			grid-column: 1 / -1;
		}
	}
</style>
