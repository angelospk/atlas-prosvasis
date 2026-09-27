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
	fmtWaitCompact,
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
import AtlasNav from './AtlasNav.svelte';
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
import Page from '../+page.svelte';
import { dayAxis, WAIT_FILL, waitClass, waitPoints, waitSamples } from './waits';
import { contrast, mixOklab, readableText } from './format';
import { pickerHidden, readAtlasUrl, widgetUrl, writeAtlasUrl } from '$lib/atlas/url';
import { prefLabel } from './format';
import AtlasFooter from './AtlasFooter.svelte';
import { SECTION_IDS, calculateActiveSection } from './navigation';

const data = fixture as unknown as AtlasData;
const report = fixture as unknown as AtlasReport;
// Vite parses .json, not .geojson: read it from disk here (the page server does the same).
const boundaries = JSON.parse(
	readFileSync(new URL('../../../static/prefectures.geojson', import.meta.url), 'utf8')
) as PrefectureBoundaries;
const idx = buildIndex(data);
const all: Selection = { mode: 'place', prefectureId: null, specialtyId: null, sectors: [...SECTORS] };

function waitFixture(days: number[]): AtlasData {
	const base = structuredClone(data) as AtlasData;
	base.prefectures = [base.prefectures[0]];
	base.specialties = [{ id: 1, name: 'Καρδιολόγος' }];
	base.providers = days.map((day, i) => ({
		id: `wait-${i}`,
		sector: 'esy',
		name: `Νοσοκομείο ${i}`,
		city: 'Άρτα',
		address: '',
		prefectureId: 1,
		lat: 39.16,
		lon: 20.98,
		approx: false,
		specialtyIds: [1],
		firstDate: null,
		firstDates: { '1': new Date(Date.UTC(2026, 8, 26 + day)).toISOString().slice(0, 10) }
	}));
	base.cells = [{
		prefectureId: 1,
		specialtyId: 1,
		counts: { esy: days.length, pfy: 0, eopyy: 0, private: 0 },
		per100k: 1,
		earliestDate: null,
		nearestKm: 1,
		nearestProviderId: days.length ? 'wait-0' : null,
		nearestPublicKm: 1,
		nearestPublicProviderId: days.length ? 'wait-0' : null
	}];
	return base;
}

function wideCoverageFixture(): AtlasData {
	const base = structuredClone(data) as AtlasData;
	base.specialties = [
		...base.specialties,
		...Array.from({ length: 6 }, (_, i) => ({ id: 100 + i, name: `Ειδικότητα ${i + 1}` }))
	];
	return base;
}

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
		expect(mx).not.toContain('Μεγάλη προβολή'); // the inline matrix is the view; no second copy
		expect(mx).not.toContain('role="dialog"');
	});
	it('AtlasNav: the mark without a title, the two pickers, folded sectors, sections and a reset only when something is chosen', () => {
		const nav = (selection: Selection) => render(AtlasNav, { props: { data, selection, onChange: noop, onReset: noop, activeSection: 'map', onNavigate: noop } }).body;
		const html = nav({ ...sel, sectors: ['esy', 'pfy'] });
		expect(html).toContain('Λίστα');
		expect(html).toContain('Καθαρισμός');
		expect(html).toContain('Φορείς');
		expect(html).toContain('2/4');
		expect(html).toContain('class="atlas-mark');
		expect(html).not.toContain('>Άτλας πρόσβασης<');
		expect((html.match(/role="combobox"/g) ?? []).length).toBe(2);
		expect(html).toContain('value="Ιωάννινα"');
		expect(html).toContain('value="Καρδιολόγος"');
		const blank = nav(all);
		expect(blank).toContain('Χάρτης');
		expect(blank).not.toContain('Καθαρισμός');
		expect(blank).toContain('value="Όλη η Ελλάδα"');
		expect(blank).toContain('value="Όλες οι ειδικότητες"');
	});
	it('CoverageList: the expanded row lists the sites by sector, or the nearest one when there are none', () => {
		const withSites = render(CoverageList, { props: { data, selection: sel, sort: 'count', onSort: noop, selectedKey: '20:16', onSelect: noop } }).body;
		expect(withSites).toContain('aria-expanded="true"');
		const first = providersIn(idx, 20, 16, [...SECTORS])[0];
		expect(withSites).toContain(providerName(first));
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
			render(AtlasNav, { props: { data, selection: sel, onChange: noop, onReset: noop, activeSection: 'map', onNavigate: noop } }).body,
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
			render(MethodologyBlock, { props: { report } }).body,
			render(WaitDistribution, { props: { data, selection: sel, onShowOnMap: noop } }).body,
			render(CoverageMatrix, { props: { data, sectors: [...SECTORS], metric: 'count', onMetric: noop, onSelect: noop, compact: true, prefectureId: 20, onPrefectureChange: noop } }).body
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

describe('responsive atlas contracts', () => {
	const sel: Selection = { mode: 'place', prefectureId: null, specialtyId: null, sectors: [...SECTORS] };
	const noop = () => {};

	it('formats compact wait dates relative to the scan, including invalid and negative offsets', () => {
		expect(fmtWaitCompact('2026-09-26', data.scan.at)).toBe('ίδια μέρα');
		expect(fmtWaitCompact('2026-09-29', data.scan.at)).toBe('σε 3 ημ.');
		expect(fmtWaitCompact(null, data.scan.at)).toBe('Χωρίς ημερομηνία');
		expect(fmtWaitCompact('not-a-date', data.scan.at)).toBe('Χωρίς ημερομηνία');
		expect(fmtWaitCompact('2026-09-25', data.scan.at)).toBe('Χωρίς ημερομηνία');
	});

	it('renders both labeled native selects with complete options and keeps desktop comboboxes', () => {
		const html = render(SelectionBar, { props: { data, selection: { ...sel, prefectureId: 20, specialtyId: 16 }, onChange: noop } }).body;
		expect(html).toContain('Νομός');
		expect(html).toContain('Ειδικότητα');
		expect((html.match(/<select/g) ?? []).length).toBe(2);
		expect((html.match(/role="combobox"/g) ?? []).length).toBe(2);
		expect(html).toContain('Όλη η Ελλάδα');
		expect(html).toContain('Όλες οι ειδικότητες');
		expect(html).toMatch(/id="[^"]+native-place"/);
		expect(html).toMatch(/id="[^"]+native-spec"/);
		expect(html).toContain('value="20" selected');
		expect(html).toContain('value="16" selected');
	});

	it.each([
		{ values: [3], sampleDots: 1 },
		{ values: [2, 4], sampleDots: 2 },
		{ values: [1, 2, 4, 8], sampleDots: 4 }
	])('renders small wait samples as dots only ($sampleDots)', ({ values, sampleDots }) => {
		const fixture = waitFixture(values);
		const html = render(WaitDistribution, {
			props: { data: fixture, selection: { ...sel, prefectureId: 1, specialtyId: 1 }, onShowOnMap: noop }
		}).body;
		expect((html.match(/class="sample-dot/g) ?? []).length).toBe(sampleDots);
		expect((html.match(/class="mean[ "]/g) ?? []).length).toBe(1);
		expect(html).not.toContain('class="box"');
		expect(html).not.toContain('class="whisk"');
		expect(html).not.toContain('class="median"');
	});

	it('plots every distinct day as a dot in its wait class, labels the two ends and shows an empty wait state', () => {
		const five = render(WaitDistribution, {
			props: { data: waitFixture([1, 1, 2, 3, 50]), selection: { ...sel, prefectureId: 1, specialtyId: 1 }, onShowOnMap: noop }
		}).body;
		expect((five.match(/class="sample-dot/g) ?? []).length).toBe(4);
		expect(five).toMatch(/class="end lo[^"]*"[^>]*>1<\/span>/);
		expect(five).toMatch(/class="end hi[^"]*"[^>]*>50<\/span>/);
		expect((five.match(/class="range/g) ?? []).length).toBe(1);
		expect(five).toContain(`--fill: ${WAIT_FILL[0]}`); // 1 day
		expect(five).toContain(`--fill: ${WAIT_FILL[3]}`); // 50 days
		expect(five).not.toContain('role="tooltip"'); // opens on hover, focus or tap only
		expect(five).toContain('1 ημέρα · Άρτα · 2 σημεία');
		expect(five).toContain('2 ημέρες · Άρτα · 1 σημείο');
		expect(five).not.toMatch(/class="box(?: |")/);
		const empty = render(WaitDistribution, {
			props: { data: waitFixture([]), selection: { ...sel, prefectureId: 1, specialtyId: 1 }, onShowOnMap: noop }
		}).body;
		expect(empty).toContain('Κανένα σημείο με ημερομηνία');
	});

	it('wait rows have no disclosure; specialty choice and map action are separate controls', () => {
		const html = render(WaitDistribution, {
			props: { data: waitFixture([1, 2, 4]), selection: { ...sel, prefectureId: 1, specialtyId: 1 }, onShowOnMap: noop }
		}).body;
		expect(html).not.toContain('aria-expanded');
		expect(html).toContain('<select');
		expect(html).toContain('Δες στον χάρτη');
		expect(html).not.toContain('section-kicker');
		const locked = render(WaitDistribution, {
			props: { data: waitFixture([1, 2, 4]), selection: { ...sel, prefectureId: 1, specialtyId: 1 }, onShowOnMap: noop, specialtyPicker: false }
		}).body;
		expect(locked).not.toContain('<select');
	});

	it('section navigation has four ordered anchors and a pure reading-band calculation', () => {
		const html = render(AtlasNav, { props: { data, selection: sel, onChange: noop, onReset: noop, activeSection: 'waits', onNavigate: noop, updating: false } }).body;
		const hrefs = [...html.matchAll(/href="(#[^"]+)"/g)].map((m) => m[1]);
		expect(hrefs).toEqual(['#atlas-map', '#atlas-map', '#atlas-list', '#atlas-waits', '#atlas-details']); // the mark, then the sections
		expect((html.match(/aria-current="location"/g) ?? []).length).toBe(1);
		expect(html).not.toContain('Βλέπεις:');
		expect(calculateActiveSection([
			{ section: 'map', top: 20 },
			{ section: 'list', top: 120 },
			{ section: 'waits', top: 320 },
			{ section: 'details', top: 600 }
		], 250)).toBe('list');
		expect(SECTION_IDS.details).toBe('atlas-details');
	});

	it('compact coverage list truncates at eight, supports all sort options, and expands all rows', () => {
		const wide = wideCoverageFixture();
		const props = { data: wide, selection: sel, sort: 'count' as const, onSort: noop, selectedKey: null, onSelect: noop, compact: true, expanded: false, onExpandedChange: noop };
		const compact = render(CoverageList, { props }).body;
		expect((compact.match(/data-key=/g) ?? []).length).toBe(8);
		expect(compact).toContain('Περισσότερες');
		expect(compact).toContain('Ταξινόμηση');
		expect(compact).toContain('Νομοί:');
		expect(compact).toContain('Οι ημέρες μετρούν από τη σάρωση.');
		expect(compact).not.toContain('Έδρες >');
		expect(compact).not.toContain('Σεπ');
		for (const metric of ['count', 'per100k', 'earliestDate', 'nearestKm'] as const) {
			const sorted = render(CoverageList, { props: { ...props, sort: metric } }).body;
			expect((sorted.match(/data-key=/g) ?? []).length).toBe(8);
		}
		const expanded = render(CoverageList, { props: { ...props, expanded: true } }).body;
		expect((expanded.match(/data-key=/g) ?? []).length).toBeGreaterThan(8);
		const desktop = render(CoverageList, { props: { ...props, compact: false } }).body;
		expect((desktop.match(/data-key=/g) ?? []).length).toBeGreaterThan(8);
	});

	it('compact matrix renders labeled controls and numeric actions, desktop retains the matrix and pagination', () => {
		const compact = render(CoverageMatrix, {
			props: { data, sectors: [...SECTORS], metric: 'count', onMetric: noop, onSelect: noop, compact: true, prefectureId: data.prefectures[0].id, onPrefectureChange: noop }
		}).body;
		expect(compact).toContain('Κάλυψη ανά νομό');
		expect(compact).toContain('Νομός');
		expect(compact).toContain('Μέτρηση');
		expect(compact).toContain('Ανά 100.000 κατοίκους');
		expect(compact).toContain('Δες στη λίστα');
		expect(compact).not.toContain('<table');
		expect(compact).not.toContain('Μεγάλη προβολή');
		const desktop = render(CoverageMatrix, {
			props: { data, sectors: [...SECTORS], metric: 'count', onMetric: noop, onSelect: noop, compact: false, prefectureId: data.prefectures[0].id, onPrefectureChange: noop }
		}).body;
		expect(desktop).toContain('<table');
		expect(desktop).toContain('Προηγούμενοι νομοί');
		expect(desktop).toContain('Επόμενοι νομοί');
	});

	it('page SSR uses a collapsed mobile point-map disclosure and all section IDs', () => {
		const html = render(Page, { props: { data: { atlas: report, boundaries } } }).body;
		expect(html).toContain('Εμφάνιση χάρτη σημείων');
		expect(html).toContain('aria-expanded="false"');
		expect(html).toContain('aria-busy="false"');
		expect(html).not.toContain('aria-label="Χάρτης παρόχων"');
		for (const id of Object.values(SECTION_IDS)) expect(html).toContain(`id="${id}"`);
	});

	it('selection status has a stable slot in both states', () => {
		const base = (updating: boolean) => render(AtlasNav, { props: { data, selection: sel, onChange: noop, onReset: noop, activeSection: 'map', onNavigate: noop, updating } }).body;
		expect(base(false)).toContain('role="status"');
		expect(base(false)).not.toContain('Ενημέρωση…');
		expect(base(true)).toContain('role="status"');
		expect(base(true)).toContain('Ενημέρωση…');
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
	it('PrefectureChoropleth draws the 51 paths once, a legend with class counts and the credits', () => {
		const html = render(PrefectureChoropleth, { props: { data, boundaries, selection: sel, onSelect: noop } }).body;
		expect(html).toContain('Σημεία με ραντεβού ανά 100.000 κατοίκους: Καρδιολόγος');
		expect(html).toContain('όλοι οι φορείς');
		expect((html.match(/<path /g) ?? []).length).toBe(51);
		expect(html).not.toContain('μεγέθυνση');
		expect(html).not.toContain('Όλες οι ειδικότητες'); // no specialty picker unless asked for
		const picker = render(PrefectureChoropleth, { props: { data, boundaries, selection: sel, onSelect: noop, onSpecialty: noop } }).body;
		expect(picker).toMatch(/<option value="16" selected/);
		expect(html).toContain('OpenStreetMap');
		expect(html).toContain('geoBoundaries');
		expect(html).not.toContain('Διάλεξε νομό'); // a tap on the map picks the prefecture
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
		expect((html.match(/<path /g) ?? []).length).toBe(51);
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
	it('renders wait rows with a distribution and says how many sites had a date', () => {
		const html = render(WaitDistribution, { props: { data, selection: all, onShowOnMap: () => {} } }).body;
		expect(html).toContain('Αναμονή για ραντεβού');
		expect(html).toContain('class="sample-dot');
		expect(html).toContain('class="axis');
		expect(html).toMatch(/\d+\/\d+ με ημερομηνία/); // the mean leaves out sites without a date: say so
		expect(html).not.toContain('—');
	});
});

describe('wait dots match their row', () => {
	it('every row value is a plotted dot, for every sector the row counts', () => {
		const data = fixture as unknown as AtlasData;
		const idx = buildIndex(data);
		const all: Selection = { mode: 'place', prefectureId: null, specialtyId: null, sectors: [...SECTORS] };
		for (const row of waitRows(data, idx, all)) {
			const key = parseKey(row.key)!;
			const dots = waitSamples(data, { ...all, ...key }).map((s) => s.days).sort((a, b) => a - b);
			expect(dots, row.key).toEqual([...row.values].sort((a, b) => a - b));
		}
	});
});

describe('wait table alternative', () => {
	it('lists every plotted dot of every row as a table row, private doctors by town only', () => {
		const base = fixture as unknown as AtlasData;
		const secret = 'ΠΑΠΑΔΟΠΟΥΛΟΣ ΙΩΑΝΝΗΣ';
		const data = { ...base, providers: base.providers.map((p) => (p.sector === 'private' || p.sector === 'eopyy' ? { ...p, name: secret } : p)) };
		expect(data.providers.some((p) => p.sector === 'eopyy') && data.providers.some((p) => p.sector === 'private')).toBe(true);
		const all: Selection = { mode: 'place', prefectureId: null, specialtyId: null, sectors: [...SECTORS] };
		const html = render(WaitDistribution, { props: { data, selection: all, onShowOnMap: () => {} } }).body;
		const table = html.slice(html.indexOf('<table'), html.indexOf('</table>'));
		expect(table).toContain('<caption');
		const idx = buildIndex(data);
		const rows = waitRows(data, idx, all);
		const groups = table.split('<tbody').slice(1);
		expect(groups.length).toBe(rows.length); // one tbody per row, so each rowgroup header covers only its own dots
		rows.forEach((row, g) => {
			const expected = waitPoints(waitSamples(data, { ...all, ...parseKey(row.key)! }), 1).map((p) => ({
				days: String(p.days), n: String(p.samples.length),
				cities: [...new Set(p.samples.map((s) => titleCase(s.provider.city) || 'Χωρίς πόλη'))].join(', ')
			}));
			const head = groups[g].match(/<th scope="rowgroup" rowspan="(\d+)"[^>]*>([^<]*)</);
			expect(head?.slice(1), row.key).toEqual([String(expected.length), row.name]);
			const cells = [...groups[g].matchAll(/<td class="num[^"]*">(\d+)<\/td><td[^>]*>([^<]*)<\/td><td class="num[^"]*">(\d+)<\/td>/g)]
				.map(([, days, cities, n]) => ({ days, cities, n }));
			expect(cells, row.key).toEqual(expected);
		});
		expect(html).not.toContain(secret);
	});
});

describe('round 2: brand, copy, embeds and contrast', () => {
	it('the day axis ends on a round step and starts at zero', () => {
		expect(dayAxis(5)).toEqual({ max: 14, ticks: [0, 7, 14] });
		expect(dayAxis(38)).toEqual({ max: 42, ticks: [0, 14, 28, 42] });
		expect(dayAxis(120).max).toBe(120);
		expect(waitClass(7)).toBe(0);
		expect(waitClass(8)).toBe(1);
		expect(waitClass(61)).toBe(4);
	});
	it('a locked share link carries specialty_picker=0, only for widgets with a specialty', () => {
		const s: Selection = { mode: 'specialty', prefectureId: null, specialtyId: 16, sectors: [...SECTORS] };
		expect(widgetUrl('coverage', s, 'mean', 'https://x.test', false).href).toBe('https://x.test/embed/coverage?specialty=16&metric=mean&specialty_picker=0');
		expect(widgetUrl('coverage', s, 'mean', 'https://x.test').searchParams.has('specialty_picker')).toBe(false);
		expect(widgetUrl('changes', s, 'coverage', 'https://x.test', false).searchParams.has('specialty_picker')).toBe(false);
		expect(pickerHidden(new URL('https://x.test/?specialty_picker=0'))).toBe(true);
		expect(pickerHidden(new URL('https://x.test/?specialty_picker=no'))).toBe(false);
		// Writing the selection back keeps the flag.
		expect(writeAtlasUrl(new URL('https://x.test/embed/waits?specialty_picker=0'), s, 'coverage').searchParams.get('specialty_picker')).toBe('0');
	});
	it('the favicon is the atlas mark, and the page has no tagline', () => {
		const favicon = readFileSync(new URL('../../../static/favicon.svg', import.meta.url), 'utf8');
		expect(favicon).not.toContain('svelte');
		expect(favicon).toContain('>α<');
		const html = render(Page, { props: { data: { atlas: report, boundaries } } }).body;
		expect(html).not.toContain('ανοιχτός χάρτης');
		expect(html).not.toContain('section-kicker');
		expect(html).not.toContain('μεγέθυνση');
		expect(html).toContain('class="atlas-mark');
	});
	it('every matrix tone gets digits at 4.5:1 or better, in both palettes', () => {
		const hex = (c: string) => c === '#fff' ? [1, 1, 1] : [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
		for (const toneInk of ['#152c3b', '#164e78']) for (let i = 0; i <= 100; i++) {
			const bg = mixOklab('#ffffff', toneInk, i / 100);
			expect(contrast(bg, hex(readableText(bg))), `${toneInk} @ ${i}%`).toBeGreaterThanOrEqual(4.5);
		}
		expect(readableText(mixOklab('#ffffff', '#164e78', 1))).toBe('#fff');
		expect(readableText(mixOklab('#ffffff', '#164e78', 0.1))).toBe('#152c3b');
	});
	it('the embed footer is one short line: mark, site, source, GitHub', () => {
		const html = render(AtlasFooter, { props: { embedded: true } }).body;
		expect(html).toContain('class="atlas-mark');
		expect(html).toContain('πηγή: e-ραντεβού');
		expect(html).not.toContain('Ανεξάρτητη');
	});
});

describe('round 3: no redundant controls', () => {
	const noop = () => {};
	it('the map shows the selected prefecture without hover, so a tap on a phone says something', () => {
		const selected = render(PrefectureChoropleth, { props: { data, boundaries, selection: { mode: 'place', prefectureId: 20, specialtyId: 16, sectors: [...SECTORS] }, onSelect: noop } }).body;
		expect(selected).toContain('class="tip');
		expect(selected).toContain(prefLabel(idx.prefById.get(20)));
		const none = render(PrefectureChoropleth, { props: { data, boundaries, selection: { mode: 'place', prefectureId: null, specialtyId: 16, sectors: [...SECTORS] }, onSelect: noop } }).body;
		expect(none).not.toContain('class="tip');
	});
	it('the page has one specialty picker (the bar), not one per section', () => {
		const html = render(Page, { props: { data: { atlas: report, boundaries } } }).body;
		const specialtySelects = [...html.matchAll(/<select[^>]*>\s*(?:<!--[^>]*-->\s*)*<option value=""[^>]*>Όλες οι ειδικότητες/g)].length;
		expect(specialtySelects).toBe(1);
		expect(html).not.toContain('Διάλεξε νομό');
	});
});

describe('url parameters', () => {
	it('accept ids or accent-free names for prefecture and specialty', () => {
		const data = fixture as unknown as AtlasData;
		const spec = data.specialties[0];
		const pref = data.prefectures[0];
		const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
		const url = new URL(`https://x.test/?specialty=${encodeURIComponent(fold(spec.name))}&prefecture=${pref.id}&metric=mean`);
		const state = readAtlasUrl(url, data);
		expect(state.selection.specialtyId).toBe(spec.id);
		expect(state.selection.prefectureId).toBe(pref.id);
		expect(state.metric).toBe('mean');
		expect(readAtlasUrl(new URL('https://x.test/?specialty=nope&metric=bad'), data).selection.specialtyId).toBeNull();
	});
});

describe('privacy and tap targets', () => {
	it('never names a private or ΕΟΠΥΥ doctor, even if the data carries a name', () => {
		const base = (fixture as unknown as AtlasData).providers[0];
		expect(providerName({ ...base, sector: 'private', name: 'ΠΑΠΑΔΟΠΟΥΛΟΣ ΙΩΑΝΝΗΣ' })).toBe('Ιδιώτης ιατρός');
		expect(providerName({ ...base, sector: 'eopyy', name: 'ΠΑΠΑΔΟΠΟΥΛΟΣ ΙΩΑΝΝΗΣ' })).toBe('Ιατρός συμβεβλημένος με τον ΕΟΠΥΥ');
	});
	it('dots closer than the minimum gap never share a lane', () => {
		const base = (fixture as unknown as AtlasData).providers[0];
		const samples = [0, 5, 10, 15, 20, 60].map((days, i) => ({ provider: { ...base, id: `p${i}` }, days }));
		const points = waitPoints(samples, 100, 0.2);
		const lanes = new Map<number, number[]>();
		for (const p of points) lanes.set(p.lane, [...(lanes.get(p.lane) ?? []), p.days / 100]);
		for (const xs of lanes.values()) for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(0.2);
		expect(lanes.size).toBe(4); // 20 and 60 fit back into the first lane
	});
});
