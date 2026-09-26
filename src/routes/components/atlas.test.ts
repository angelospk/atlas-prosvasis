// Acceptance for the atlas components: the pure helpers against the fixture, and a server
// render of every component (SSR must not touch Leaflet or `window`).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import type { AtlasData, AtlasReport, PrefectureBoundaries, Selection } from '$lib/atlas/types';
import { SECTORS } from '$lib/atlas/types';
import fixture from '$lib/atlas/fixture.json';
import {
	buildIndex,
	providerName,
	waitRows,
	waitStats,
	cellKey,
	countClass,
	daysBetween,
	daysFromScan,
	deriveRows,
	fmtDay,
	fmtDayShort,
	fmtKm,
	fmtOffset,
	fold,
	isDefaultSelection,
	nearestFor,
	parseKey,
	projectLonLat,
	projectRings,
	providersIn,
	rateClass,
	ringsPath,
	sectorsLabel,
	selectionLabel,
	sortRows,
	specialtiesCovered,
	titleCase,
	toCsv
} from './format';
import SelectionBar from './SelectionBar.svelte';
import SnapshotNotice from './SnapshotNotice.svelte';
import MetricSummary from './MetricSummary.svelte';
import CoverageList from './CoverageList.svelte';
import AccessMap from './AccessMap.svelte';
import CoverageMatrix from './CoverageMatrix.svelte';
import WeeklyBriefing from './WeeklyBriefing.svelte';
import PrefectureChoropleth from './PrefectureChoropleth.svelte';
import SpecialtyCoverageBars from './SpecialtyCoverageBars.svelte';
import CoverageRanking from './CoverageRanking.svelte';
import ScanChangeChart from './ScanChangeChart.svelte';
import MethodologyBlock from './MethodologyBlock.svelte';
import WaitDistribution from './WaitDistribution.svelte';

const data = fixture as unknown as AtlasData;
const report = fixture as unknown as AtlasReport;
// Vite parses .json, not .geojson: read it from disk here (the page server does the same).
const boundaries = JSON.parse(
	readFileSync(new URL('../../../static/prefectures.geojson', import.meta.url), 'utf8')
) as PrefectureBoundaries;
const idx = buildIndex(data);
const all: Selection = { mode: 'place', prefectureId: null, specialtyId: null, sectors: [...SECTORS] };

describe('format', () => {
	it('title-cases Greek names with a final sigma (the Ministry data carries no accents)', () => {
		expect(titleCase('ΚΑΡΔΙΟΛΟΓΟΣ')).toBe('Καρδιολογος'); // unknown names: no accents to restore
		expect(titleCase('Καρδιολόγος')).toBe('Καρδιολόγος');
		expect(titleCase('ΓΕΝΙΚΟ ΝΟΣΟΚΟΜΕΙΟ  ΑΤΤΙΚΗΣ "ΣΙΣΜΑΝΟΓΛΕΙΟ-ΑΜΑΛΙΑ"')).toBe('Γενικο Νοσοκομειο Αττικης "Σισμανογλειο-Αμαλια"');
		expect(titleCase('Έβρος')).toBe('Έβρος');
	});
	it('folds accents and case for search', () => {
		expect(fold('Έβρος')).toBe(fold('εβροσ'));
		expect(fold('Ηράκλειο').includes('ηρακλ')).toBe(true);
	});
	it('formats km and dates relative to the scan', () => {
		expect(fmtKm(152.8)).toBe('153 χλμ');
		expect(fmtKm(12.34)).toBe('12,3 χλμ');
		expect(fmtKm(null)).toBe('–'); // an en dash for an empty cell, never an em dash
		expect(fmtDay('2026-09-29')).toBe('Τρί 29 Σεπ');
		expect(daysFromScan('2026-09-29', '2026-09-26')).toBe(3);
		expect(fmtOffset(3)).toBe('+3 ημ.');
		expect(fmtOffset(0)).toBe('την ημέρα της σάρωσης');
	});
	it('round-trips cell keys with 0 as Greece-wide', () => {
		expect(cellKey(null, 16)).toBe('0:16');
		expect(parseKey('0:16')).toEqual({ prefectureId: null, specialtyId: 16 });
		expect(parseKey('20:6')).toEqual({ prefectureId: 20, specialtyId: 6 });
		expect(parseKey('x')).toBeNull();
	});
	it('says in one line what the page shows, and knows the default selection', () => {
		expect(selectionLabel(idx, all)).toBe('όλη την Ελλάδα · όλες οι ειδικότητες · όλοι οι φορείς');
		expect(selectionLabel(idx, { ...all, prefectureId: 20, specialtyId: 16, sectors: ['esy', 'pfy'] })).toBe('Ν. Ιωαννίνων · Καρδιολόγος · ΕΣΥ + ΠΦΥ');
		expect(isDefaultSelection(all)).toBe(true);
		expect(isDefaultSelection({ ...all, sectors: ['esy'] })).toBe(false);
		expect(isDefaultSelection({ ...all, specialtyId: 16 })).toBe(false);
	});
	it('counts the specialties with a site per prefecture, in fixed classes', () => {
		const covered = specialtiesCovered(data, [...SECTORS]);
		expect(covered.size).toBe(data.prefectures.length);
		for (const p of data.prefectures) {
			const expected = data.specialties.filter((s) => {
				const c = idx.cellByKey.get(cellKey(p.id, s.id));
				return c != null && c.counts.esy + c.counts.pfy + c.counts.eopyy + c.counts.private > 0;
			}).length;
			expect(covered.get(p.id)).toBe(expected);
		}
		// Public only: never more than all sectors.
		const pub = specialtiesCovered(data, ['esy', 'pfy']);
		for (const p of data.prefectures) expect(pub.get(p.id)!).toBeLessThanOrEqual(covered.get(p.id)!);
		expect(countClass(null)).toBeNull();
		expect(countClass(0)).toBe(0);
		expect(countClass(5)).toBe(0);
		expect(countClass(6)).toBe(1);
		expect(countClass(10)).toBe(1);
		expect(countClass(11)).toBe(2);
		expect(countClass(20)).toBe(2);
		expect(countClass(21)).toBe(3);
		expect(countClass(30)).toBe(3);
		expect(countClass(31)).toBe(4);
		expect(countClass(46)).toBe(4);
	});
});

describe('providerName', () => {
	it('names public units, and says what an anonymous doctor is', () => {
		const base = { id: 'x', city: '', address: '', prefectureId: 1, lat: null, lon: null, approx: true, specialtyIds: [], firstDate: null };
		expect(providerName({ ...base, sector: 'esy', name: 'ΓΝ ΑΡΤΑΣ' })).toBe(titleCase('ΓΝ ΑΡΤΑΣ'));
		expect(providerName({ ...base, sector: 'eopyy', name: '' })).toBe('Ιατρός συμβεβλημένος με τον ΕΟΠΥΥ');
		expect(providerName({ ...base, sector: 'private', name: '' })).toBe('Ιδιώτης ιατρός');
	});
});

describe('deriveRows', () => {
	it('national rows: one per specialty, prefsWith ≤ 51, counts sum over cells', () => {
		const rows = deriveRows(data, idx, all);
		expect(rows.length).toBe(data.specialties.length);
		for (const r of rows) {
			expect(r.prefsWith).not.toBeNull();
			expect(r.prefsWith!).toBeLessThanOrEqual(data.prefectures.length);
			const expected = data.cells
				.filter((c) => c.specialtyId === parseKey(r.key)!.specialtyId)
				.reduce((n, c) => n + c.counts.esy + c.counts.pfy + c.counts.eopyy + c.counts.private, 0);
			expect(r.count).toBe(expected);
		}
	});
	it('place rows match the cell when all sectors are on', () => {
		const rows = deriveRows(data, idx, { ...all, prefectureId: 1 });
		const cell = idx.cellByKey.get('1:16')!;
		const r = rows.find((x) => x.key === '1:16')!;
		expect(r.count).toBe(1);
		expect(r.nearestKm).toBe(cell.nearestKm);
		expect(r.flagged).toBe(false);
		const anesth = rows.find((x) => x.key === '1:6')!;
		expect(anesth.count).toBe(0);
		expect(anesth.nearestKm).toBe(152.8);
		expect(anesth.flagged).toBe(true);
	});
	it('sector filter recomputes nearest via haversine and hides other sectors', () => {
		// Αιτωλοακαρνανία × Καρδιολόγος has one EOPYY provider at 0.1 km; public-only is 80.7 km.
		const pub = deriveRows(data, idx, { ...all, prefectureId: 1, sectors: ['esy', 'pfy'] }).find((x) => x.key === '1:16')!;
		expect(pub.count).toBe(0);
		expect(pub.nearestKm).toBe(80.7);
		const eopyyOnly = deriveRows(data, idx, { ...all, prefectureId: 1, sectors: ['eopyy'] }).find((x) => x.key === '1:16')!;
		expect(eopyyOnly.count).toBe(1);
		expect(eopyyOnly.nearestKm).not.toBeNull();
		expect(eopyyOnly.nearestKm!).toBeLessThan(5);
		const near = nearestFor(idx, idx.cellByKey.get('1:16')!, ['private']);
		expect(near.unknown || near.km != null).toBe(true);
	});
	it('specialty rows: one per prefecture, sorted farthest first with nulls last', () => {
		const rows = sortRows(deriveRows(data, idx, { ...all, mode: 'specialty', specialtyId: 22 }), 'nearestKm');
		expect(rows.length).toBe(data.prefectures.length);
		const kms = rows.map((r) => r.nearestKm);
		const firstNull = kms.indexOf(null);
		const nums = (firstNull < 0 ? kms : kms.slice(0, firstNull)) as number[];
		for (let i = 1; i < nums.length; i++) expect(nums[i - 1]).toBeGreaterThanOrEqual(nums[i]);
		if (firstNull >= 0) expect(kms.slice(firstNull).every((k) => k == null)).toBe(true);
	});
});

describe('server render', () => {
	const sel: Selection = { mode: 'place', prefectureId: 20, specialtyId: 16, sectors: [...SECTORS] };
	const noop = () => {};
	it('renders every component without touching the DOM', () => {
		expect(render(SnapshotNotice, { props: { scan: data.scan, populationYear: 2021, distanceFlagKm: 50 } }).body).toContain('κατώτατο όριο');
		expect(render(MetricSummary, { props: { data, selection: sel } }).body).toContain('Ν. Ιωαννίνων');
		expect(render(CoverageList, { props: { data, selection: sel, sort: 'count', onSort: noop, selectedKey: null, onSelect: noop } }).body).toContain('Καρδιολόγος');
		expect(render(AccessMap, { props: { data, selection: sel, selectedKey: '20:16', onSelect: noop } }).body).toContain('έδρα νομού');
		const mx = render(CoverageMatrix, { props: { data, sectors: [...SECTORS], metric: 'nearestKm', onMetric: noop, onSelect: noop } }).body;
		expect(mx).toContain('χωρίς μέτρηση');
		expect(mx).toContain('Μεγάλη προβολή');
		expect(mx).not.toContain('role="dialog"'); // the big view opens on click only
	});
	it('SelectionBar: the two pickers, folded sectors, the «Βλέπεις» line and a reset only when something is chosen', () => {
		const html = render(SelectionBar, { props: { data, selection: { ...sel, sectors: ['esy', 'pfy'] }, onChange: noop, onReset: noop } }).body;
		expect(html).toContain('Βλέπεις:');
		expect(html).toContain('Ν. Ιωαννίνων · Καρδιολόγος · ΕΣΥ + ΠΦΥ');
		expect(html).toContain('Καθαρισμός');
		expect(html).toContain('Φορείς:');
		expect((html.match(/role="combobox"/g) ?? []).length).toBe(2);
		expect(html).toContain('value="Ιωάννινα"');
		expect(html).toContain('value="Καρδιολόγος"');
		const blank = render(SelectionBar, { props: { data, selection: all, onChange: noop, onReset: noop } }).body;
		expect(blank).toContain('όλη την Ελλάδα · όλες οι ειδικότητες · όλοι οι φορείς');
		expect(blank).not.toContain('Καθαρισμός');
		expect(blank).toContain('value="Όλη η Ελλάδα"');
		expect(blank).toContain('value="Όλες"');
	});
	it('CoverageList: the expanded row lists the sites by sector, or the nearest one when there are none', () => {
		const withSites = render(CoverageList, { props: { data, selection: sel, sort: 'count', onSort: noop, selectedKey: '20:16', onSelect: noop } }).body;
		expect(withSites).toContain('aria-expanded="true"');
		const first = providersIn(idx, 20, 16, [...SECTORS])[0];
		expect(withSites).toContain(titleCase(first.name));
		expect(withSites).toContain(titleCase(first.city));
		// Αιτωλοακαρνανία × Αναισθησιολόγος: nothing there, the nearest is 153 km away.
		const none = render(CoverageList, { props: { data, selection: { ...sel, prefectureId: 1 }, sort: 'count', onSort: noop, selectedKey: '1:6', onSelect: noop } }).body;
		expect(none).toContain('Δεν καταγράφεται σημείο');
		expect(none).toContain('Πλησιέστερο:');
		expect(none).toContain('153 χλμ');
		// Collapsed: nothing expanded.
		const closed = render(CoverageList, { props: { data, selection: sel, sort: 'count', onSort: noop, selectedKey: null, onSelect: noop } }).body;
		expect(closed).not.toContain('aria-expanded="true"');
	});
	it('no em dash and no eyebrow in any rendered component', () => {
		const html = [
			render(SnapshotNotice, { props: { scan: data.scan, populationYear: 2021, distanceFlagKm: 50 } }).body,
			render(SelectionBar, { props: { data, selection: sel, onChange: noop, onReset: noop } }).body,
			render(MetricSummary, { props: { data, selection: sel } }).body,
			render(MetricSummary, { props: { data, selection: all } }).body,
			render(CoverageList, { props: { data, selection: sel, sort: 'count', onSort: noop, selectedKey: '20:16', onSelect: noop } }).body,
			render(CoverageList, { props: { data, selection: all, sort: 'count', onSort: noop, selectedKey: null, onSelect: noop } }).body,
			render(CoverageMatrix, { props: { data, sectors: [...SECTORS], metric: 'count', onMetric: noop, onSelect: noop } }).body,
			render(WeeklyBriefing, { props: { report, onSelect: noop } }).body,
			render(PrefectureChoropleth, { props: { data, boundaries, selection: sel, onSelect: noop } }).body,
			render(PrefectureChoropleth, { props: { data, boundaries, selection: all, onSelect: noop } }).body,
			render(SpecialtyCoverageBars, { props: { data, sectors: [...SECTORS], selectedSpecialtyId: 16, onSelect: noop } }).body,
			render(CoverageRanking, { props: { data, selection: { ...sel, mode: 'specialty' }, onSelect: noop } }).body,
			render(ScanChangeChart, { props: { report } }).body,
			render(MethodologyBlock, { props: { report } }).body
		].join('\n');
		expect(html).not.toContain('—');
		expect(html).not.toContain('eyebrow');
		expect(html).not.toContain('Literata');
		expect(html).not.toContain('Commissioner');
	});
});

describe('weekly helpers', () => {
	it('classes rates into the five fixed intervals, unknown as null', () => {
		expect(rateClass(null)).toBeNull();
		expect(rateClass(NaN)).toBeNull();
		expect(rateClass(0)).toBe(0);
		expect(rateClass(0.3)).toBe(1);
		expect(rateClass(1)).toBe(1);
		expect(rateClass(1.01)).toBe(2);
		expect(rateClass(2)).toBe(2);
		expect(rateClass(3.9)).toBe(3);
		expect(rateClass(4)).toBe(3);
		expect(rateClass(4.1)).toBe(4);
	});
	it('projects lon/lat with the cos(38.5°) scale, y down', () => {
		const [x, y] = projectLonLat(23.7275, 37.9838);
		expect(x).toBeCloseTo(23.7275 * Math.cos((38.5 * Math.PI) / 180), 6);
		expect(y).toBe(-37.9838);
		const rings = projectRings({ type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 1], [0, 1], [0, 0]]] });
		expect(rings[0][0].area).toBeCloseTo(2 * Math.cos((38.5 * Math.PI) / 180), 6);
		expect(ringsPath(rings, 1)).toMatch(/^M0\.0,0\.0L1\.6,0\.0L1\.6,-1\.0L0\.0,-1\.0L0\.0,0\.0Z$/);
	});
	it('labels sectors and dates, counts days', () => {
		expect(sectorsLabel([...SECTORS])).toBe('όλοι οι φορείς');
		expect(sectorsLabel(['pfy', 'esy'])).toBe('ΕΣΥ + ΠΦΥ');
		expect(fmtDayShort('2026-09-12')).toBe('12 Σεπ');
		expect(daysBetween('2026-08-30', '2026-09-26')).toBe(27);
		expect(daysBetween(null, '2026-09-26')).toBeNull();
	});
	it('writes CSV with a BOM, CRLF and quoting', () => {
		const csv = toCsv([['Νομός', 'Σημεία'], ['Έβρος, Ν.', 3], ['A"b', null]]);
		expect(csv.startsWith('﻿')).toBe(true);
		expect(csv).toBe('﻿Νομός,Σημεία\r\n"Έβρος, Ν.",3\r\n"A""b",\r\n');
	});
	it('the boundaries file has all 51 prefectures of the fixture', () => {
		expect(boundaries.features.length).toBe(51);
		const ids = new Set(boundaries.features.map((f) => f.properties.id));
		for (const p of data.prefectures) expect(ids.has(p.id)).toBe(true);
	});
});

describe('server render (weekly layer)', () => {
	const noop = () => {};
	const sel: Selection = { mode: 'specialty', prefectureId: 20, specialtyId: 16, sectors: [...SECTORS] };
	it('WeeklyBriefing lists the findings with the scan date and the compared week', () => {
		const html = render(WeeklyBriefing, { props: { report, onSelect: noop } }).body;
		expect(html).toContain('26 Σεπτεμβρίου 2026');
		expect(html).toContain('19 Σεπ');
		for (const f of report.findings.slice(0, 4)) expect(html).toContain(f.text.slice(0, 40));
	});
	it('PrefectureChoropleth draws 51 paths (twice: map and inset), a legend with class counts and the credits', () => {
		const html = render(PrefectureChoropleth, { props: { data, boundaries, selection: sel, onSelect: noop } }).body;
		expect(html).toContain('Σημεία με ραντεβού ανά 100.000 κατοίκους: Καρδιολόγος');
		expect(html).toContain('όλοι οι φορείς');
		expect((html.match(/<path /g) ?? []).length).toBe(102);
		expect(html).toContain('Αττική, μεγέθυνση');
		expect(html).toContain('OpenStreetMap');
		expect(html).toContain('geoBoundaries');
		expect(html).toContain('<select');
		// Every prefecture is a class; the legend counts sum to 51.
		const rows = deriveRows(data, idx, sel);
		const classes = rows.map((r) => rateClass(r.per100k));
		expect(classes.every((c) => c != null)).toBe(true);
		const zeros = classes.filter((c) => c === 0).length;
		expect(html).toContain(`<span class="n num svelte-`);
		expect(html).toContain(`>${zeros}</span>`);
	});
	it('PrefectureChoropleth without a specialty maps how many specialties each prefecture has, in fixed classes', () => {
		const html = render(PrefectureChoropleth, { props: { data, boundaries, selection: { ...sel, specialtyId: null }, onSelect: noop } }).body;
		expect(html).toContain('Ειδικότητες με ραντεβού σε κάθε νομό');
		expect(html).toContain(`από ${data.specialties.length} ειδικότητες`);
		expect((html.match(/<path /g) ?? []).length).toBe(102);
		for (const label of ['0 έως 5', '6 έως 10', '11 έως 20', '21 έως 30', '31 και πάνω']) expect(html).toContain(label);
		// The fixture has six specialties, so every prefecture falls in the first two classes.
		const covered = specialtiesCovered(data, [...SECTORS]);
		const low = [...covered.values()].filter((n) => n <= 5).length;
		expect(html).toContain(`>${low}</span>`);
		// Each prefecture's label says «N από 6 ειδικότητες»; Ioannina is the selected one.
		expect(html).toContain(`Ιωάννινα · `);
		expect(html).toContain(`${covered.get(20)} από ${data.specialties.length} ειδικότητες`);
		// Exports are offered in both modes; no bottom sheet, no prompt to pick a specialty first.
		expect(html).not.toContain('disabled');
		expect(html).not.toContain('Δες τις δομές');
	});
	it('SpecialtyCoverageBars sorts the gaps first and folds beyond eight', () => {
		const html = render(SpecialtyCoverageBars, { props: { data, sectors: [...SECTORS], selectedSpecialtyId: 16, onSelect: noop } }).body;
		expect(html).toContain('Σε πόσους νομούς υπάρχει κάθε ειδικότητα');
		expect(html).toContain('από 51');
		const names = [...html.matchAll(/class="name svelte-[a-z0-9]+">([^<]+)</g)].map((m) => m[1]);
		const rows = deriveRows(data, idx, { mode: 'place', prefectureId: null, specialtyId: null, sectors: [...SECTORS] }).sort((a, b) => (a.prefsWith ?? 0) - (b.prefsWith ?? 0) || a.name.localeCompare(b.name, 'el'));
		expect(names).toEqual(rows.slice(0, 8).map((r) => r.name));
	});
	it('CoverageRanking lists at most ten, zeros first by population', () => {
		const html = render(CoverageRanking, { props: { data, selection: { ...sel, specialtyId: 6 }, onSelect: noop } }).body;
		expect(html).toContain('χαμηλότερη αναλογία');
		expect((html.match(/class="row /g) ?? []).length).toBeLessThanOrEqual(10);
		expect(html).toContain('ισοβαθμία στο μηδέν');
		const prompt = render(CoverageRanking, { props: { data, selection: { ...sel, specialtyId: null }, onSelect: noop } }).body;
		expect(prompt).toContain('Διάλεξε ειδικότητα');
	});
	it('ScanChangeChart shows the latest week first and the quiet line with one scan', () => {
		const html = render(ScanChangeChart, { props: { report } }).body;
		expect(html.indexOf('19 Σεπ → 26 Σεπ')).toBeLessThan(html.indexOf('12 Σεπ → 19 Σεπ'));
		expect(html).toContain('δεν επιστρέφονται πια');
		const one = render(ScanChangeChart, { props: { report: { ...report, history: [], scans: report.scans.slice(0, 1) } } }).body;
		expect(one).toContain('Η σύγκριση ξεκινά από την επόμενη εβδομάδα');
	});
	it('MethodologyBlock lists the scans and the version', () => {
		const html = render(MethodologyBlock, { props: { report } }).body;
		for (const s of report.scans) expect(html).toContain(fmtDayShort(s.id));
		expect(html).toContain('κατώτατο όριο');
		expect(html).toContain('Έκδοση μεθοδολογίας 1');
	});
});

describe('waits (box plot)', () => {
	it('summarises days: quartiles, median, mean, whiskers inside 1.5 IQR, the rest outliers', () => {
		const s = waitStats([1, 2, 3, 4, 5, 6, 7, 8, 100])!;
		expect(s.n).toBe(9);
		expect(s.median).toBe(5);
		expect([s.q1, s.q3]).toEqual([3, 7]);
		expect(s.lo).toBe(1);
		expect(s.hi).toBe(8); // 100 is beyond q3 + 1.5·IQR = 13
		expect(s.outliers).toEqual([100]);
		expect(s.mean).toBeCloseTo(15.11, 1);
		expect(waitStats([])).toBeNull();
	});
	it('rows follow the selection: specialties nationwide, a prefecture’s specialties, a specialty’s prefectures, one cell', () => {
		const none = waitRows(data, idx, all);
		expect(none.length).toBeGreaterThan(0);
		expect(new Set(none.map((r) => r.key.split(':')[0]))).toEqual(new Set(['0']));
		const pref = waitRows(data, idx, { ...all, prefectureId: 20 });
		expect(pref.every((r) => r.key.startsWith('20:'))).toBe(true);
		const spec = waitRows(data, idx, { ...all, mode: 'specialty', specialtyId: 16 });
		expect(spec.every((r) => r.key.endsWith(':16'))).toBe(true);
		const one = waitRows(data, idx, { ...all, prefectureId: 20, specialtyId: 16 });
		expect(one.length).toBeLessThanOrEqual(1);
		// longest typical wait first
		for (let i = 1; i < none.length; i++) expect(none[i - 1].stats.median).toBeGreaterThanOrEqual(none[i].stats.median);
	});
	it('renders one row per line with a box, and says how many sites had a date', () => {
		const html = render(WaitDistribution, { props: { data, selection: all, onSelect: () => {} } }).body;
		expect(html).toContain('Αναμονή για πρώτο ραντεβού');
		expect(html).toContain('class="box');
		expect(html).toContain('με ημερομηνία');
		expect(html).not.toContain('—');
	});
});
