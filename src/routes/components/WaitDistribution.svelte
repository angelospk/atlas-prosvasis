<script lang="ts">
	import type { AtlasData, Selection } from '$lib/atlas/types';
	import { SECTORS, SECTOR_LABEL } from '$lib/atlas/types';
	import { buildIndex, fmtDay, fmtStat, parseKey, plural, providerName, selectionLabel, titleCase, toCsv, waitRows } from './format';
	import { dayAxis, WAIT_FILL, WAIT_LABEL, waitClass, waitPoints, waitSamples, type WaitPoint } from './waits';
	import { downloadText } from './download';
	// A ranked range plot: one line per row on a shared day axis. The bar runs from the first to
	// the last date, each dot is one day (coloured with the map's wait classes), the dark tick is
	// the mean. A dot shows its towns and units on hover, focus or tap. A row's name opens it
	// on the prefecture map.
	let { data, selection, onShowOnMap = (_key: string | null) => {}, onPickSpecialty = (_id: number | null) => {}, specialtyPicker = true }: {
		data: AtlasData; selection: Selection; onShowOnMap?: (key: string | null) => void; onPickSpecialty?: (id: number | null) => void; specialtyPicker?: boolean;
	} = $props();
	const uid = $props.id();
	const idx = $derived(buildIndex(data));
	const rows = $derived(waitRows(data, idx, selection));
	let showingAll = $state(false);
	let hovered = $state<{ key: string; days: number } | null>(null);
	let pinned = $state<{ key: string; days: number } | null>(null);
	// A pin only counts while its dot is still on screen; a new selection elsewhere drops it.
	const livePin = $derived(pinned && rows.some((r) => r.key === pinned!.key && r.values.includes(pinned!.days)) ? pinned : null);
	const active = $derived(hovered ?? livePin);
	// Measured in the browser; one 24 px target (WCAG 2.2 minimum) as a share of the axis, and
	// lanes 24 px apart, so neighbouring targets never come closer than that.
	let plotWidth = $state(0);
	const gap = $derived(plotWidth > 0 ? Math.min(0.5, 24 / plotWidth) : 0.04);
	const axis = $derived(dayAxis(Math.max(0, ...rows.map((r) => r.stats.max))));
	const LANE = 24;
	const plotted = $derived(rows.map((r) => {
		const key = parseKey(r.key)!;
		const points = waitPoints(waitSamples(data, { ...selection, ...key }), axis.max, gap);
		const lanes = Math.max(1, ...points.map((p) => p.lane + 1));
		// The end labels merge when the two ends are closer than a label.
		const merged = plotWidth > 0 ? (r.stats.max - r.stats.min) / axis.max * plotWidth < 36 : r.stats.max - r.stats.min < axis.max * 0.06;
		return { ...r, points, lanes, merged };
	}));
	const shown = $derived(showingAll ? plotted : plotted.slice(0, 12));
	const mapKey = $derived(livePin?.key ?? (selection.specialtyId != null ? `${selection.prefectureId ?? 0}:${selection.specialtyId}` : null));
	const pct = (days: number) => `${days / axis.max * 100}%`;
	const cities = (point: WaitPoint) => [...new Set(point.samples.map((s) => titleCase(s.provider.city) || 'Χωρίς πόλη'))].join(', ');
	function describe(point: WaitPoint) {
		return `${plural(point.days, 'ημέρα', 'ημέρες')} · ${cities(point)} · ${plural(point.samples.length, 'σημείο', 'σημεία')}`;
	}
	const mixTitle = (counts: Record<string, number>) => SECTORS.map((s) => `${SECTOR_LABEL[s]}: ${counts[s] ?? 0}`).join(' · ');
	const same = (a: { key: string; days: number } | null, key: string, days: number) => a?.key === key && a.days === days;
	// Tooltips near either end of the axis open inward so they never leave the plot.
	const side = (days: number) => days / axis.max < 0.2 ? 'start' : days / axis.max > 0.8 ? 'end' : 'mid';
	function exportCsv() {
		downloadText(`atlas-αναμονή-${data.scan.at.slice(0, 10)}.csv`, toCsv([
			['Σάρωση', data.scan.at.slice(0, 10), data.scan.source],
			['Νομός / ειδικότητα', 'Σημεία', 'Με ημερομηνία', 'Πρώτο', 'Μέσος όρος', 'Διάμεσος', 'Μέγιστο'],
			...rows.map((r) => [r.name, r.sites, r.stats.n, r.stats.min, r.stats.mean, r.stats.median, r.stats.max])
		]));
	}
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') { pinned = null; hovered = null; } }} />

<section id="atlas-waits" class="waits" aria-labelledby={`${uid}-title`}>
	<header class="head">
		<div><h2 id={`${uid}-title`}>Αναμονή για ραντεβού</h2><p class="sub">{selectionLabel(idx, selection)} · ημέρες από τη σάρωση της {fmtDay(data.scan.at)}</p></div>
		<button class="tool" onclick={exportCsv}>CSV</button>
	</header>
	{#if rows.length === 0}
		<p class="empty">Κανένα σημείο με ημερομηνία ραντεβού για αυτή την επιλογή.</p>
	{:else}
		<div class="legend" aria-label="Υπόμνημα">
			{#each WAIT_FILL as fill, c (c)}<span><i style:background={fill}></i>{WAIT_LABEL[c]}</span>{/each}
			<span><i class="tick"></i>μέσος όρος</span>
		</div>
		<div class="chart">
			<div class="axis" aria-hidden="true">
				<span></span>
				<div class="scale">{#each axis.ticks as t (t)}<span style:left={pct(t)}>{t}</span>{/each}</div>
				<span class="mean-head">μέσος</span>
			</div>
			<ol class="list">
				{#each shown as row (row.key)}
					<li class="row" data-key={row.key}>
						<div class="name"><h3><button type="button" class="to-map" title="Δες στον χάρτη" aria-label={`${row.name}: δες στον χάρτη`} onclick={() => onShowOnMap(row.key)}>{row.name}</button></h3><span class="meta"><span class="mix" role="img" title={mixTitle(row.counts)} aria-label={mixTitle(row.counts)}>{#each SECTORS as sector (sector)}<span class="smark {sector}" class:off={!selection.sectors.includes(sector) || row.counts[sector] === 0}></span>{/each}</span>{row.stats.n}/{row.sites} με ημερομηνία</span></div>
						<div class="plot" style:height={`${row.lanes * LANE + 16}px`} bind:clientWidth={plotWidth}>
							<div class="grid" aria-hidden="true">{#each axis.ticks as t (t)}<i style:left={pct(t)}></i>{/each}</div>
							<span class="range" aria-hidden="true" style:left={pct(row.stats.min)} style:width={`${(row.stats.max - row.stats.min) / axis.max * 100}%`}></span>
							{#if row.merged}
								<span class="end mid" style:left={pct((row.stats.min + row.stats.max) / 2)} aria-hidden="true">{row.stats.min === row.stats.max ? row.stats.min : `${row.stats.min}–${row.stats.max}`}</span>
							{:else}
								<span class="end lo" style:left={pct(row.stats.min)} aria-hidden="true">{row.stats.min}</span>
								<span class="end hi" style:left={pct(row.stats.max)} aria-hidden="true">{row.stats.max}</span>
							{/if}
							<span class="mean" aria-hidden="true" style:left={pct(row.stats.mean)} style:height={`${row.lanes * LANE}px`}></span>
							{#each row.points as point (point.days)}
								{@const open = same(active, row.key, point.days)}
								<button class="sample-dot" class:many={point.samples.length > 1} class:open
									style:left={pct(point.days)} style:top={`${16 + point.lane * LANE}px`} style:--fill={WAIT_FILL[waitClass(point.days)]}
									aria-label={`${row.name} · ${describe(point)}`} aria-pressed={same(livePin, row.key, point.days)}
									aria-describedby={open ? `${uid}-tip` : undefined}
									onpointerenter={(e) => { if (e.pointerType === 'mouse') hovered = { key: row.key, days: point.days }; }}
									onpointerleave={() => (hovered = null)}
									onfocus={() => (hovered = { key: row.key, days: point.days })} onblur={() => (hovered = null)}
									onclick={() => (pinned = same(livePin, row.key, point.days) ? null : { key: row.key, days: point.days })}><span class="dot"></span></button>
								{#if open}
									<div class="tip {side(point.days)}" id={`${uid}-tip`} role="tooltip" style:left={pct(point.days)} style:top={`${16 + point.lane * LANE}px`}>
										<strong>{plural(point.days, 'ημέρα', 'ημέρες')}</strong>
										<ul>{#each point.samples.slice(0, 5) as { provider } (provider.id)}<li><b>{titleCase(provider.city) || 'Χωρίς πόλη'}</b> {providerName(provider)}</li>{/each}</ul>
										{#if point.samples.length > 5}<small>και {point.samples.length - 5} ακόμη</small>{/if}
									</div>
								{/if}
							{/each}
						</div>
						<div class="avg"><strong>{fmtStat(row.stats.mean)}</strong><small>ημ.</small></div>
					</li>
				{/each}
			</ol>
		</div>
		{#if rows.length > 12}<button class="more tool" aria-expanded={showingAll} onclick={() => showingAll = !showingAll}>{showingAll ? 'Λιγότερες γραμμές' : `Όλες οι γραμμές (${rows.length})`}</button>{/if}
		<details class="as-table">
			<summary>Οι τιμές σε πίνακα</summary>
			<div class="table-wrap">
				<table>
					<caption>Ημέρες έως το πρώτο ραντεβού ανά σημείο · {selectionLabel(idx, selection)} · σάρωση {fmtDay(data.scan.at)}</caption>
					<thead><tr><th scope="col">Νομός / ειδικότητα</th><th scope="col">Ημέρες</th><th scope="col">Πόλεις</th><th scope="col">Σημεία</th></tr></thead>
					{#each plotted as row (row.key)}
						<tbody>
							{#each row.points as point, i (point.days)}
								<tr class="point">
									{#if i === 0}<th scope="rowgroup" rowspan={row.points.length}>{row.name}<small>μέσος {fmtStat(row.stats.mean)} ημ.</small></th>{/if}
									<td class="num">{point.days}</td><td>{cities(point)}</td><td class="num">{point.samples.length}</td>
								</tr>
							{/each}
						</tbody>
					{/each}
				</table>
			</div>
		</details>
	{/if}
	<div class="actions">
		{#if specialtyPicker}
			<label for={`${uid}-specialty`}>Ειδικότητα
				<select id={`${uid}-specialty`} value={selection.specialtyId ?? ''} onchange={(e) => { pinned = null; onPickSpecialty(e.currentTarget.value ? Number(e.currentTarget.value) : null); }}>
					<option value="">Όλες οι ειδικότητες</option>{#each data.specialties as specialty (specialty.id)}<option value={specialty.id}>{specialty.name}</option>{/each}
				</select>
			</label>
		{/if}
		<button class="map-action tool" onclick={() => onShowOnMap(mapKey)}>Δες στον χάρτη ↗</button>
	</div>
	<p class="note">Πρώτο διαθέσιμο ραντεβού κάθε σημείου τη μέρα της σάρωσης, όχι πραγματικός χρόνος εξυπηρέτησης.</p>
</section>

<style>
	.waits { display:grid; gap:1rem; min-width:0; scroll-margin-top:calc(var(--atlas-bar-height, 0px) + 16px); }
	.head { display:flex; justify-content:space-between; align-items:end; gap:1rem; }
	h2 { font-size:clamp(1.4rem,2.6vw,1.9rem); } .sub,.note { margin:.3rem 0 0; font-size:.82rem; color:var(--ink-3); } .note { margin:0; }
	.legend { display:flex; gap:.4rem 1rem; flex-wrap:wrap; font-size:.75rem; color:var(--ink-2); }
	.legend span { display:flex; gap:.4rem; align-items:center; } .legend i { width:10px; height:10px; border-radius:50%; box-shadow:0 0 0 1px #152c3b40; }
	.legend i.tick { width:2px; height:12px; border-radius:0; background:var(--ink); box-shadow:none; }
	.chart { --cols:minmax(9rem,14rem) minmax(0,1fr) 4.5rem; background:var(--card); border:1px solid var(--line); border-radius:var(--r-box); padding:0 1.2rem; }
	.axis { position:sticky; top:var(--atlas-bar-height, 0px); z-index:3; display:grid; grid-template-columns:var(--cols); gap:1.2rem; align-items:end; height:34px; padding-bottom:6px; background:var(--card); border-bottom:1px solid var(--line); font-size:.7rem; color:var(--ink-3); }
	.scale { position:relative; height:100%; margin-inline:10px; } .scale span { position:absolute; bottom:0; transform:translateX(-50%); font-variant-numeric:tabular-nums; }
	.mean-head { text-align:right; }
	.list { list-style:none; padding:0; margin:0; }
	.row { display:grid; grid-template-columns:var(--cols); gap:1.2rem; align-items:center; padding:.35rem 0; border-bottom:1px solid var(--paper-2); }
	.row:last-child { border-bottom:0; }
	.name { display:flex; flex-direction:column; min-width:0; } .name h3 { font:600 .9rem var(--sans); overflow-wrap:anywhere; } .meta { display:flex; align-items:center; gap:.4rem; font-size:.7rem; color:var(--ink-3); } .mix { display:inline-flex; gap:2px; }
	.to-map { padding:0; min-height:0; background:none; border:0; font:inherit; color:inherit; text-align:left; cursor:pointer; text-decoration:underline; text-decoration-color:var(--line-2); text-underline-offset:3px; } .to-map:hover { text-decoration-color:var(--accent); }
	.plot { position:relative; min-width:0; margin-inline:10px; }
	.grid i { position:absolute; top:0; bottom:0; width:1px; background:var(--paper-2); }
	.range { position:absolute; top:calc(16px + 10px); height:4px; min-width:4px; transform:translateX(-2px); border-radius:2px; background:#b9cbd6; }
	.end { position:absolute; top:0; font-size:.72rem; font-weight:600; color:var(--ink-2); line-height:14px; font-variant-numeric:tabular-nums; white-space:nowrap; }
	.end.lo { transform:translateX(-100%); padding-right:2px; } .end.hi { padding-left:2px; } .end.mid { transform:translateX(-50%); }
	.mean { position:absolute; top:16px; width:2px; transform:translateX(-1px); background:var(--ink); border-radius:1px; pointer-events:none; z-index:1; }
	.sample-dot { position:absolute; width:24px; height:24px; min-height:0; transform:translateX(-50%); display:grid; place-items:center; padding:0; border:0; background:transparent; cursor:pointer; z-index:2; }
	.dot { width:11px; height:11px; border-radius:50%; background:var(--fill); box-shadow:0 0 0 1.5px #fff, 0 0 0 2.5px #152c3b59; transition:transform .12s; }
	.many .dot { width:14px; height:14px; }
	.sample-dot:hover .dot,.sample-dot.open .dot,.sample-dot[aria-pressed='true'] .dot { transform:scale(1.3); box-shadow:0 0 0 1.5px #fff, 0 0 0 3px var(--accent-d); }
	.sample-dot:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; border-radius:6px; }
	.tip { position:absolute; z-index:5; margin-top:26px; width:max-content; max-width:min(18rem, 70vw); padding:.55rem .7rem; background:var(--ink); color:#fff; border-radius:8px; font-size:.78rem; box-shadow:var(--shadow); pointer-events:none; }
	.tip.mid { transform:translateX(-50%); } .tip.start { transform:translateX(-14px); } .tip.end { transform:translateX(calc(-100% + 14px)); }
	.tip strong { font-size:.9rem; } .tip ul { list-style:none; margin:.3rem 0 0; padding:0; display:grid; gap:.2rem; } .tip b { font-weight:600; } .tip small { color:#c9d9e3; }
	.avg { text-align:right; white-space:nowrap; } .avg strong { font-size:1.15rem; font-weight:600; font-variant-numeric:tabular-nums; } .avg small { margin-left:.2rem; font-size:.72rem; color:var(--ink-3); }
	.actions { display:flex; gap:1rem; align-items:end; flex-wrap:wrap; } .actions label { display:grid; gap:.35rem; font-size:.78rem; min-width:0; flex:1; max-width:400px; }
	select { width:100%; min-width:0; height:44px; border:1px solid var(--line-2); border-radius:var(--r-ctl); padding:0 .6rem; color:var(--ink); background:var(--card); font:inherit; font-size:16px; }
	.tool { min-height:44px; padding:.5rem .9rem; background:var(--card); border:1px solid var(--line-2); border-radius:var(--r-ctl); font-size:.78rem; font-weight:500; } .tool:disabled { opacity:.5; cursor:default; } .more { justify-self:start; } .map-action { background:var(--accent); color:white; border-color:var(--accent); }
	.empty { padding:1.5rem; background:var(--paper-2); }
	.as-table summary { cursor:pointer; min-height:44px; display:flex; align-items:center; font-size:.82rem; font-weight:500; color:var(--accent-d); }
	.table-wrap { max-height:420px; overflow:auto; border:1px solid var(--line); background:var(--card); }
	table { width:100%; border-collapse:collapse; font-size:.82rem; } caption { text-align:left; padding:.6rem .8rem; font-size:.76rem; color:var(--ink-3); }
	th,td { padding:.4rem .8rem; text-align:left; vertical-align:top; } thead th { position:sticky; top:0; background:var(--paper-2); font-weight:600; }
	tbody>tr:first-child>* { border-top:1px solid var(--line); } tbody th { font-weight:600; } tbody th small { display:block; font-weight:400; color:var(--ink-3); }
	td.num { font-variant-numeric:tabular-nums; }
	@media(max-width:699px) {
		.chart { --cols:minmax(0,1fr) auto; padding:0 .8rem; }
		.axis { grid-template-columns:minmax(0,1fr); } .axis > span { display:none; }
		.row { grid-template-columns:minmax(0,1fr) auto; gap:.1rem .6rem; padding:.5rem 0; }
		.name { flex-direction:row; align-items:baseline; gap:.5rem; } .plot { grid-column:1/-1; grid-row:2; }
		.avg { grid-column:2; grid-row:1; }
	}
	@media(max-width:420px) { table { table-layout:fixed; } th,td { padding:.4rem .4rem; overflow-wrap:break-word; } thead th:nth-child(1) { width:34%; } thead th:nth-child(2),thead th:nth-child(4) { width:17%; } .actions label { flex-basis:100%; max-width:none; } }
</style>
