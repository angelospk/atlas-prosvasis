<script lang="ts">
	// The principal graphic, one tone per prefecture, two metrics derived from the selection:
	// no specialty → how many specialties have a site in the prefecture (fixed classes 0–5 ·
	// 6–10 · 11–20 · 21–30 · 31+); a specialty → its sites per 100 000 residents (fixed classes
	// 0 · >0–1 · >1–2 · >2–4 · >4). Fixed classes so this week's map can be laid next to last
	// week's. Pure SVG, projected here (equirectangular, cos 38.5°). Zero is paper with a brick
	// outline, a real absence, not a light tone; unknown is hatched. Fills and strokes are inline attributes (not classes) so
	// the SVG can be serialised as is for the PNG export. A tap or click selects the
	// prefecture; nothing opens.
	import type { AtlasData, PrefectureBoundaries, Selection, Sector } from '$lib/atlas/types';
	import { SECTORS, SECTOR_LABEL } from '$lib/atlas/types';
	import {
		boxOf,
		buildIndex,
		COUNT_CLASS_LABEL,
		countClass,
		daysFromScan,
		deriveRows,
		EMPTY,
		fmtDateLong,
		fmtDay,
		fmtInt,
		fmtKm,
		fmtOffset,
		fmtPer100k,
		parseKey,
		plural,
		prefLabel,
		projectRings,
		rateClass,
		ringsPath,
		sectorsLabel,
		specialtiesCovered,
		titleCase,
		toCsv,
		type Box,
		type Ring,
		type Row
	} from './format';
	import { downloadBlob, downloadText } from './download';
	import { prefectureWaits, WAIT_FILL as WAIT_COLORS, WAIT_LABEL, waitClass } from './waits';
	import type { MapMetric } from '$lib/atlas/url';
	import { fmtStat, type WaitStats } from './format';

	let {
		data,
		boundaries,
		selection,
		onSelect,
		metric = 'coverage',
		onMetric = (_metric: MapMetric) => {},
		onSpecialty = null
	}: {
		data: AtlasData;
		boundaries: PrefectureBoundaries;
		selection: Selection;
		onSelect: (prefectureId: number) => void;
		metric?: MapMetric; onMetric?: (metric: MapMetric) => void;
		/** Shows a specialty picker in the tools row; null hides it (e.g. a locked embed). */
		onSpecialty?: ((specialtyId: number | null) => void) | null;
	} = $props();

	const uid = $props.id();

	// ---- palette (inline, so the serialised SVG keeps its colours) ----
	const PAPER = '#edf3f6';
	const CARD = '#ffffff';
	const INK = '#152c3b';
	const INK3 = '#526776';
	const LINE2 = '#b6cbd8';
	const BRICK = '#a34418';
	type Cls = 0 | 1 | 2 | 3 | 4;
	const CLASSES: Cls[] = [0, 1, 2, 3, 4];
	/** Rate: zero is paper (brick outline), then four greens. */
	const RATE_FILL: Record<Cls, string> = { 0: PAPER, 1: '#dcebf3', 2: '#a8cce0', 3: '#5894b8', 4: '#164e78' };
	/** Specialty count: five greens, the lowest class is still a tone (0–5 is not "none"). */
	const COUNT_FILL: Record<Cls, string> = { 0: '#e3edf3', 1: '#c1d9e7', 2: '#8bb7d0', 3: '#4c88af', 4: '#164e78' };
	const RATE_TEXT: Record<Cls, string> = { 0: '0, δεν καταγράφεται', 1: 'έως 1', 2: '1 έως 2', 3: '2 έως 4', 4: 'πάνω από 4' };
	const SERIF = '"Source Serif 4", Georgia, serif';
	const SANS = '"IBM Plex Sans", system-ui, sans-serif';

	// ---- geometry: projected once per boundaries, fitted to W user units ----
	const W = 640;
	const PAD = 6;
	interface Shape {
		id: number;
		name: string;
		d: string;
	}
	const geo = $derived.by(() => {
		const projected = boundaries.features.map((f) => ({ id: f.properties.id, name: f.properties.name, polys: projectRings(f.geometry) }));
		let box: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
		for (const p of projected) for (const poly of p.polys) for (const ring of poly) box = boxOf(ring.pts, box);
		const k = (W - 2 * PAD) / (box.x1 - box.x0);
		const H = Math.round((box.y1 - box.y0) * k + 2 * PAD);
		const fit = (pt: [number, number]): [number, number] => [(pt[0] - box.x0) * k + PAD, (pt[1] - box.y0) * k + PAD];
		const shapes: Shape[] = projected.map((p) => {
			const polys: Ring[][] = p.polys.map((poly) => poly.map((r) => ({ pts: r.pts.map(fit), area: r.area })));
			return { id: p.id, name: p.name, d: ringsPath(polys, 1) };
		});
		return { shapes, H };
	});
	const H = $derived(geo.H);

	// ---- values ----
	const idx = $derived(buildIndex(data));
	const spec = $derived(selection.specialtyId == null ? null : (idx.specById.get(selection.specialtyId) ?? null));
	const rateMode = $derived(spec != null);
	const specTotal = $derived(data.specialties.length);
	const waitMode = $derived(metric !== 'coverage');
	const waits = $derived(spec ? prefectureWaits(data, selection) : new Map<number, WaitStats>());
	const WAIT_FILL = { ...WAIT_COLORS } as Record<Cls, string>;
	const WAIT_TEXT = { ...WAIT_LABEL } as Record<Cls, string>;
	const FILL = $derived(waitMode ? WAIT_FILL : rateMode ? RATE_FILL : COUNT_FILL);
	const CLASS_TEXT = $derived(waitMode ? WAIT_TEXT : rateMode ? RATE_TEXT : COUNT_CLASS_LABEL);

	// Rate mode: one row per prefecture for the selected specialty and sectors.
	const rows = $derived(
		spec ? deriveRows(data, idx, { mode: 'specialty', prefectureId: null, specialtyId: spec.id, sectors: selection.sectors }) : []
	);
	const rowByPref = $derived.by(() => {
		const m = new Map<number, Row>();
		for (const r of rows) {
			const k = parseKey(r.key);
			if (k?.prefectureId != null) m.set(k.prefectureId, r);
		}
		return m;
	});
	// Count mode: specialties with ≥1 site in the sectors, per prefecture.
	const covered = $derived(specialtiesCovered(data, selection.sectors));

	interface Info {
		id: number;
		name: string;
		row: Row | null;
		covered: number;
		cls: Cls | null; wait: WaitStats | null;
	}
	const infoById = $derived.by(() => {
		const m = new Map<number, Info>();
		for (const p of data.prefectures) {
			const row = rowByPref.get(p.id) ?? null;
			const n = covered.get(p.id) ?? 0;
			const wait = waits.get(p.id) ?? null;
			const days = wait ? (metric === 'first' ? wait.min : wait.mean) : null;
			const waitCls: Cls | null = days == null ? null : waitClass(days);
			m.set(p.id, { id: p.id, name: p.name, row, covered: n, wait, cls: waitMode ? waitCls : rateMode ? rateClass(row ? row.per100k : null) : countClass(n) });
		}
		return m;
	});
	const classCounts = $derived.by(() => {
		const counts: Record<Cls, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
		let unknown = 0;
		for (const info of infoById.values()) {
			if (info.cls == null) unknown++;
			else counts[info.cls]++;
		}
		return { counts, unknown };
	});
	const title = $derived(waitMode ? `${metric === 'first' ? 'Πρώτο διαθέσιμο ραντεβού' : 'Μέσος χρόνος έως το πρώτο διαθέσιμο'}${spec ? ': ' + titleCase(spec.name) : ''}` : rateMode && spec ? `Σημεία με ραντεβού ανά 100.000 κατοίκους: ${titleCase(spec.name)}` : 'Ειδικότητες με ραντεβού σε κάθε νομό');
	const subtitle = $derived(waitMode ? (spec ? 'Ημέρες από τη σάρωση · ' + sectorsLabel(selection.sectors) : 'Επίλεξε ειδικότητα για να συγκρίνεις αναμονές') : rateMode ? sectorsLabel(selection.sectors) : `από ${specTotal} ειδικότητες · ${sectorsLabel(selection.sectors)}`);
	const scanDate = $derived(fmtDateLong(data.scan.at));

	// Draw order: tones first, then the brick zeros (their outline must win), then the selection.
	const ordered = $derived(
		[...geo.shapes].sort((a, b) => {
			const rank = (s: Shape) => (s.id === selection.prefectureId ? 2 : isZero(s.id) ? 1 : 0);
			return rank(a) - rank(b);
		})
	);
	function isZero(id: number): boolean {
		return !waitMode && rateMode && infoById.get(id)?.cls === 0;
	}
	function fillOf(id: number): string {
		const info = infoById.get(id);
		if (!info) return CARD;
		if (info.cls == null) return `url(#${uid}-hatch)`;
		return FILL[info.cls];
	}
	function strokeOf(id: number): string {
		if (id === selection.prefectureId) return INK;
		if (id === active) return INK;
		return isZero(id) ? BRICK : CARD;
	}
	function strokeWidth(id: number): number {
		if (id === selection.prefectureId) return 1.8;
		if (id === active) return 1.2;
		return isZero(id) ? 1 : 0.6;
	}

	// ---- interaction: hover / focus tooltip, click = select ----
	let active = $state<number | null>(null); // hovered or focused
	let pointer = $state<{ x: number; y: number } | null>(null); // relative to the frame
	let frame = $state<HTMLElement | null>(null);
	let svgEl = $state<SVGSVGElement | null>(null);

	function move(e: PointerEvent) {
		if (!frame) return;
		const r = frame.getBoundingClientRect();
		pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
	}
	function enter(id: number, e: PointerEvent) {
		if (e.pointerType === 'touch') return;
		active = id;
		move(e);
	}
	function leave() {
		active = null;
		pointer = null;
	}
	function focusIn(id: number) {
		active = id;
		pointer = null;
	}
	function keyPick(id: number, e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onSelect(id);
		}
	}

	function describe(info: Info): string {
		const pref = idx.prefById.get(info.id);
		const parts = [info.name];
		if (pref) parts.push(`${fmtInt(pref.population)} κάτοικοι`);
		if (waitMode) parts.push(info.wait ? `${fmtStat(metric === 'first' ? info.wait.min : info.wait.mean)} ημέρες · ${info.wait.n} σημεία με ημερομηνία` : 'χωρίς ημερομηνία');
		else if (!rateMode) parts.push(`${info.covered} από ${specTotal} ειδικότητες`);
		else if (!info.row) parts.push('χωρίς μέτρηση');
		else parts.push(info.row.count === 0 ? 'δεν καταγράφεται στον κατάλογο' : `${plural(info.row.count, 'σημείο', 'σημεία')}, ${fmtPer100k(info.row.per100k)} ανά 100 χιλ.`);
		return parts.join(' · ');
	}
	// Hovered or focused first; otherwise the selected prefecture, so a tap on a phone (no hover)
	// still shows its figures.
	const shownId = $derived(active ?? selection.prefectureId);
	const activeInfo = $derived(shownId == null ? null : (infoById.get(shownId) ?? null));
	const sortedPrefs = $derived([...data.prefectures].sort((a, b) => a.name.localeCompare(b.name, 'el')));
	const sortedSpecs = $derived([...data.specialties].sort((a, b) => titleCase(a.name).localeCompare(titleCase(b.name), 'el')));

	// Tooltip placement: below-right of the pointer, flipped when it would leave the frame.
	const tipStyle = $derived.by(() => {
		if (!pointer || !frame) return '';
		const w = frame.clientWidth;
		const left = pointer.x + 14 + 260 > w ? Math.max(0, pointer.x - 274) : pointer.x + 14;
		const top = pointer.y + 12;
		return `left:${left}px;top:${top}px`;
	});

	// ---- exports ----
	function sectorCols(): Sector[] {
		return SECTORS.filter((s) => selection.sectors.includes(s));
	}
	function fileStem(): string {
		const s = spec ? titleCase(spec.name).replace(/\s+/g, '-') : 'ειδικότητες';
		return `atlas-${s}-${data.scan.at.slice(0, 10)}`;
	}
	function exportCsv() {
		const cols = sectorCols();
		const meta = [[`${title} · ${subtitle}`], [`Σάρωση ${data.scan.at.slice(0, 10)} · ${data.scan.source}`], []];
		if (waitMode) {
			downloadText(`${fileStem()}-${metric}.csv`, toCsv([...meta, ['Νομός', 'Με ημερομηνία', 'Πρώτο (ημέρες)', 'Μέσος (ημέρες)'], ...sortedPrefs.map((p) => { const w = waits.get(p.id); return [p.name, w?.n ?? 0, w?.min ?? null, w?.mean ?? null]; })]));
			return;
		}
		if (!rateMode) {
			const head = ['Νομός', 'Έδρα', `Πληθυσμός ${data.populationYear}`, `Ειδικότητες με σημείο (από ${specTotal})`];
			const body = sortedPrefs.map((p) => [p.name, p.seat.label, p.population, covered.get(p.id) ?? 0]);
			downloadText(`${fileStem()}.csv`, toCsv([...meta, head, ...body]));
			return;
		}
		const head = ['Νομός', 'Έδρα', `Πληθυσμός ${data.populationYear}`, ...cols.map((s) => SECTOR_LABEL[s]), 'Σύνολο σημείων', 'Ανά 100.000', 'Πρώτο ραντεβού (δημόσια)', 'Πλησιέστερος από την έδρα (χλμ, σε ευθεία)'];
		const body = sortedPrefs.map((p) => {
			const r = rowByPref.get(p.id);
			return [
				p.name,
				p.seat.label,
				p.population,
				...cols.map((s) => (r ? (r.counts[s] ?? 0) : null)),
				r ? r.count : null,
				r && r.per100k != null ? Math.round(r.per100k * 100) / 100 : null,
				r?.earliestDate ? r.earliestDate.slice(0, 10) : null,
				r && r.nearestKm != null ? r.nearestKm : null
			];
		});
		downloadText(`${fileStem()}.csv`, toCsv([...meta, head, ...body]));
	}

	let exporting = $state(false);
	async function exportPng() {
		if (!svgEl || exporting) return;
		exporting = true;
		try {
			await document.fonts?.ready;
			// The map: the live SVG serialised as is (fills are inline) and rasterised via <img>.
			const xml = new XMLSerializer().serializeToString(svgEl);
			const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
			const img = new Image();
			await new Promise<void>((res, rej) => {
				img.onload = () => res();
				img.onerror = () => rej(new Error('svg'));
				img.src = url;
			});
			const S = 2;
			const cw = 1200;
			const m = 48;
			const mapW = cw - 2 * m;
			const mapH = Math.round((mapW * H) / W);
			const lines = classCounts.unknown > 0 ? CLASSES.length + 1 : CLASSES.length;
			const legendH = Math.ceil(lines / 2) * 24 + 16;
			const ch = m + 40 + 26 + 12 + mapH + 16 + legendH + 44 + m;
			const canvas = document.createElement('canvas');
			canvas.width = cw * S;
			canvas.height = ch * S;
			const ctx = canvas.getContext('2d');
			if (!ctx) return;
			ctx.scale(S, S);
			ctx.fillStyle = PAPER;
			ctx.fillRect(0, 0, cw, ch);
			ctx.textBaseline = 'alphabetic';
			// Title, subtitle.
			ctx.fillStyle = INK;
			ctx.font = `600 26px ${SERIF}`;
			ctx.fillText(title, m, m + 26);
			ctx.fillStyle = INK3;
			ctx.font = `400 15px ${SANS}`;
			ctx.fillText(`${subtitle} · σάρωση ${scanDate} · κατάλογος e-ραντεβού · κάτοικοι ΕΛΣΤΑΤ ${data.populationYear}`, m, m + 26 + 26);
			// Map.
			const mapY = m + 40 + 26 + 12;
			ctx.drawImage(img, m, mapY, mapW, mapH);
			ctx.strokeStyle = LINE2;
			ctx.lineWidth = 1;
			ctx.strokeRect(m + 0.5, mapY + 0.5, mapW - 1, mapH - 1);
			URL.revokeObjectURL(url);
			// Legend: two columns.
			const ly = mapY + mapH + 16;
			const entries: { fill: string | null; text: string }[] = CLASSES.map((c) => ({ fill: FILL[c], text: `${CLASS_TEXT[c]} · ${classCounts.counts[c]} νομοί` }));
			if (classCounts.unknown > 0) entries.push({ fill: null, text: `χωρίς μέτρηση · ${classCounts.unknown}` });
			ctx.font = `400 14px ${SANS}`;
			entries.forEach((e, i) => {
				const col = i % 2;
				const rowI = Math.floor(i / 2);
				const x = m + col * (mapW / 2);
				const y = ly + rowI * 24;
				ctx.fillStyle = e.fill ?? CARD;
				ctx.fillRect(x, y, 20, 14);
				ctx.strokeStyle = e.fill === PAPER ? BRICK : LINE2;
				ctx.lineWidth = 1;
				ctx.strokeRect(x + 0.5, y + 0.5, 19, 13);
				if (e.fill == null) {
					ctx.strokeStyle = LINE2;
					for (let d = -14; d < 20; d += 4) {
						ctx.beginPath();
						ctx.moveTo(x + d, y + 14);
						ctx.lineTo(x + d + 14, y);
						ctx.stroke();
					}
				}
				ctx.fillStyle = INK;
				ctx.fillText(e.text, x + 28, y + 11);
			});
			// Source.
			ctx.fillStyle = INK3;
			ctx.font = `400 12px ${SANS}`;
			ctx.fillText('Πηγή: finddoctors.gov.gr (e-ραντεβού) · μηδέν = δεν καταγράφεται στον κατάλογο, όχι απουσία φροντίδας · όρια © OpenStreetMap contributors (ODbL), ακτογραμμή © geoBoundaries (CC BY 4.0)', m, ch - m + 4);
			const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
			if (blob) downloadBlob(`${fileStem()}.png`, blob);
		} finally {
			exporting = false;
		}
	}
</script>

<figure class="choro">
 <div class="metric-switch" role="group" aria-label="Μέτρηση χάρτη">
  {#each [{id:'coverage', label:'Κάλυψη'}, {id:'first', label:'Πρώτο ραντεβού'}, {id:'mean', label:'Μέση αναμονή'}] as item}
   <button type="button" aria-pressed={metric === item.id} onclick={() => onMetric(item.id as MapMetric)}>{item.label}</button>
  {/each}
 </div>
	<figcaption>
		<h2>{title}</h2>
		<p class="sub">{subtitle} · σάρωση {scanDate} · κάτοικοι {data.populationYear}</p>
	</figcaption>

	<div class="frame" bind:this={frame}>
		<svg
			bind:this={svgEl}
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 {W} {H}"
			role="group"
			aria-label="Χάρτης των 51 νομών. Κλικ σε νομό για να τον διαλέξεις."
			onpointerleave={leave}
		>
			<defs>
				<pattern id="{uid}-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
					<rect width="4" height="4" fill={CARD} />
					<rect width="1" height="4" fill={LINE2} />
				</pattern>
			</defs>

			<!-- Sea is card so a zero prefecture (paper + brick) still reads as land. -->
			<rect x="0" y="0" width={W} height={H} fill={CARD} />

			{#each ordered as s (s.id)}
				{@const info = infoById.get(s.id)}
				<path
					d={s.d}
					fill={fillOf(s.id)}
					fill-rule="evenodd"
					stroke={strokeOf(s.id)}
					stroke-width={strokeWidth(s.id)}
					stroke-linejoin="round"
					vector-effect="non-scaling-stroke"
					tabindex="0"
					role="button"
					aria-label={info ? describe(info) : s.name}
					aria-pressed={selection.prefectureId === s.id}
					onpointerenter={(e) => enter(s.id, e)}
					onpointermove={move}
					onpointerleave={leave}
					onfocus={() => focusIn(s.id)}
					onblur={leave}
					onclick={() => onSelect(s.id)}
					onkeydown={(e) => keyPick(s.id, e)}
				/>
			{/each}

		</svg>

		{#if activeInfo}
			<div class="tip" class:float={pointer != null} style={tipStyle} role="status">
				<b>{prefLabel(idx.prefById.get(activeInfo.id))}</b>
				<span class="muted">{rateMode && spec ? `${titleCase(spec.name)} · ` : ''}{sectorsLabel(selection.sectors)}</span>
				{@render figures(activeInfo)}
			</div>
		{/if}
	</div>

	<div class="legend" aria-label="Υπόμνημα">
		{#each CLASSES as c (c)}
			<span class="lg">
				<span class="sw" style:background={FILL[c]} style:border-color={!waitMode && rateMode && c === 0 ? BRICK : 'var(--line-2)'}></span>
				<span>{CLASS_TEXT[c]}</span>
			</span>
		{/each}
		{#if classCounts.unknown > 0}
			<span class="lg"><span class="sw hatch"></span><span>χωρίς μέτρηση</span></span>
		{/if}
	</div>

	<div class="tools">
		{#if onSpecialty}
			<label class="pick">
				<span>Ειδικότητα</span>
				<select value={selection.specialtyId ?? ''} onchange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; onSpecialty(v ? +v : null); }}>
					<option value="">Όλες οι ειδικότητες</option>
					{#each sortedSpecs as sp (sp.id)}
						<option value={sp.id}>{titleCase(sp.name)}</option>
					{/each}
				</select>
			</label>
		{/if}
		<span class="spacer"></span>
		<button type="button" class="tool" onclick={exportPng} disabled={exporting} title="Εικόνα PNG με τίτλο, υπόμνημα και πηγή">PNG</button>
		<button type="button" class="tool" onclick={exportCsv} title="Οι 51 γραμμές του χάρτη">CSV</button>
	</div>

	<p class="foot">
		{#if waitMode}
			Ημέρες από τη σάρωση. Χωρίς ημερομηνία δεν σημαίνει μηδέν αναμονή.
		{:else if rateMode}
			Μηδέν: δεν καταγράφεται στον κατάλογο.
		{:else}
			Διάλεξε ειδικότητα για την αναλογία ανά 100.000.
		{/if}
		Όρια © <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap</a> (ODbL) · <a href="https://www.geoboundaries.org/" rel="noopener">geoBoundaries</a> (CC BY 4.0).
	</p>
</figure>

{#snippet figures(info: Info)}
	{@const pref = idx.prefById.get(info.id)}
	{@const r = info.row}
	<dl class="figs">
		{#if pref}<div><dt>Κάτοικοι</dt><dd class="num">{fmtInt(pref.population)}</dd></div>{/if}
		{#if waitMode}
   <div class="wide"><dt>{metric === 'first' ? 'Πρώτο ραντεβού' : 'Μέσος χρόνος έως το πρώτο διαθέσιμο'}</dt><dd>{info.wait ? `${fmtStat(metric === 'first' ? info.wait.min : info.wait.mean)} ημέρες` : 'Χωρίς ημερομηνία'}</dd></div>
   <div class="wide"><dt>Σημεία με ημερομηνία / καταγεγραμμένα</dt><dd>{info.wait?.n ?? 0} / {r?.count ?? 0}</dd></div>
  {:else if !rateMode}
   <div><dt>Ειδικότητες με ραντεβού</dt><dd class="num">{info.covered} <span class="muted">από {specTotal}</span></dd></div>
		{:else if !r}
			<div class="wide"><dd class="muted"><span class="hatch swatch" aria-hidden="true"></span> Χωρίς μέτρηση για αυτόν τον νομό.</dd></div>
		{:else}
			<div><dt>Σημεία</dt><dd class="num" class:zero={r.count === 0}>{r.count === 0 ? '0' : fmtInt(r.count)}</dd></div>
			<div><dt>Ανά 100 χιλ.</dt><dd class="num" class:zero={r.count === 0}>{r.count === 0 ? '0' : fmtPer100k(r.per100k)}</dd></div>
			<div>
				<dt>Πρώτο ραντεβού (δημόσια)</dt>
				<dd class="num">{#if r.earliestDate}{fmtDay(r.earliestDate)} <span class="muted">{fmtOffset(daysFromScan(r.earliestDate, data.scan.at))}</span>{:else}{EMPTY}{/if}</dd>
			</div>
			{#if r.count === 0}
				<div>
					<dt>Πλησιέστερος από την έδρα</dt>
					<dd class="num" class:flag={r.flagged}>{r.nearestUnknown ? 'άγνωστο' : fmtKm(r.nearestKm)}</dd>
				</div>
			{/if}
		{/if}
	</dl>
{/snippet}

<style>
 .metric-switch { display:flex; flex-wrap:wrap; gap:4px; background:var(--paper-2); padding:4px; border-radius:8px; width:fit-content; }
 .metric-switch button { border:0; background:none; padding:.6rem .8rem; min-height:44px; border-radius:5px; font-size:.82rem; }
 .metric-switch button[aria-pressed='true'] { background:var(--accent); color:white; }

	.choro {
		margin: 0;
		display: grid;
		gap: 0.7rem;
	}
	figcaption h2 {
		font-size: clamp(1.15rem, 2vw, 1.4rem);
	}
	.sub {
		margin: 0.3rem 0 0;
		font-size: 0.84rem;
		color: var(--ink-3);
	}
	.frame {
		position: relative;
		border: 1px solid var(--line);
		border-radius: 10px;
		overflow: hidden;
		background: var(--card);
	}
	svg {
		display: block;
		width: 100%;
		height: auto;
	}
	svg path {
		cursor: pointer;
		outline: none;
		transition: stroke-width 0.12s ease;
	}
	svg path:focus-visible {
		outline: none;
	}
	.tip {
		position: absolute;
		left: 0.6rem;
		bottom: 0.6rem;
		z-index: 2;
		width: 260px;
		max-width: calc(100% - 1.2rem);
		background: var(--card);
		border: 1px solid var(--line-2);
		border-radius: 8px;
		padding: 0.6rem 0.75rem;
		font-size: 0.82rem;
		box-shadow: var(--shadow);
		pointer-events: none;
		display: grid;
		gap: 0.15rem;
	}
	.tip.float {
		bottom: auto;
	}
	.tip b {
		font-size: 0.98rem;
		font-weight: 600;
	}
	.muted {
		color: var(--ink-3);
		font-weight: 400;
		margin: 0;
	}
	.figs {
		margin: 0.35rem 0 0;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.4rem 0.9rem;
	}
	.figs .wide {
		grid-column: 1 / -1;
	}
	.figs dt {
		font-size: 0.72rem;
		color: var(--ink-3);
	}
	.figs dd {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		line-height: 1.2;
		color: var(--ink);
	}
	.figs dd .muted {
		font-size: 0.74rem;
	}
	.figs dd.zero {
		color: var(--ink-3);
	}
	.figs dd.flag {
		color: var(--urgent);
	}
	.num {
		font-variant-numeric: tabular-nums;
	}
	.swatch {
		display: inline-block;
		width: 14px;
		height: 10px;
		border: 1px solid var(--line-2);
		border-radius: 2px;
		vertical-align: -1px;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 1.2rem;
		font-size: 0.78rem;
		color: var(--ink-2);
	}
	.lg {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}
	.sw {
		display: inline-block;
		width: 18px;
		height: 13px;
		border: 1px solid var(--line-2);
		border-radius: 2px;
		box-sizing: border-box;
	}
	.sw.hatch {
		background: var(--hatch), var(--card);
	}
	.tools {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.pick {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.82rem;
		color: var(--ink-2);
	}
	.pick select {
		font: inherit;
		font-size: 0.88rem;
		color: var(--ink);
		background: var(--card);
		border: 1px solid var(--line-2);
		border-radius: var(--r-ctl);
		padding: 0.4rem 0.6rem;
		max-width: 14rem;
	}
	.spacer {
		flex: 1;
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
	.tool:hover:not(:disabled) {
		border-color: var(--ink-3);
		color: var(--ink);
	}
	.tool:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.foot {
		margin: 0;
		font-size: 0.72rem;
		color: var(--ink-3);
		max-width: 80ch;
	}
	.foot a {
		color: var(--ink-2);
	}
	@media (max-width: 719px) {
		/* No hover on phones: the tapped prefecture's figures sit under the map. */
		.tip,
		.tip.float {
			position: static;
			width: auto;
			max-width: none;
			margin-top: 0.5rem;
			box-shadow: none;
		}
		/* The picker takes a row; PNG and CSV share the next one. */
		.tools {
			display: grid;
			grid-template-columns: 1fr 1fr;
		}
		.pick {
			grid-column: 1 / -1;
		}
		.pick select {
			max-width: none;
			flex: 1;
		}
		.spacer {
			display: none;
		}
		.tool {
			text-align: center;
		}
	}
</style>
