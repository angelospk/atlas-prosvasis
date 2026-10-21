// Open data: every table the page shows, as static CSV and JSON files under /data/v1.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AtlasReport, Provider } from './types';
import {
	DATASETS,
	DATA_BASE,
	LICENSE,
	catalog,
	datasetCsv,
	datasetJson,
	datasetPath,
	datasetPaths,
	datasetRows,
	filterFor,
	parseDatasetPath
} from './datasets';

const cell = (prefectureId: number, specialtyId: number, esy: number, pfy: number, priv: number, reg = 0) => ({
	prefectureId,
	specialtyId,
	counts: { esy, pfy, eopyy: 0, private: priv },
	registeredCounts: { esy: reg, pfy: 0, eopyy: 0, private: 0 },
	per100k: 1.5,
	earliestDate: esy + pfy + priv ? '2026-10-25' : null,
	nearestKm: 3,
	nearestProviderId: 'u1',
	nearestPublicKm: esy + pfy ? 3 : null,
	nearestPublicProviderId: esy + pfy ? 'u1' : null
});

const prov = (over: Partial<Provider>): Provider => ({
	id: 'x',
	sector: 'esy',
	name: 'ΓΕΝΙΚΟ ΝΟΣΟΚΟΜΕΙΟ ΑΛΦΑ',
	city: 'ΑΛΦΑ',
	address: 'Οδός 1',
	prefectureId: 1,
	lat: 38,
	lon: 21,
	approx: false,
	specialtyIds: [],
	offeredSpecialtyIds: [],
	registeredSpecialtyIds: [],
	lastBookable: {},
	firstDate: null,
	firstDates: {},
	...over
});

// Two prefectures (Α 1.000 residents, Β 3.000), two specialties (20 Ψυχίατρος, 7 Καρδιολόγος).
// Ψυχίατρος: Α bookable at u1, Β declared only at u2. Καρδιολόγος: Α only a private doctor, Β nothing.
const report: AtlasReport = {
	scan: { at: '2026-10-21T00:01:19', source: 'test', units: 2, doctors: 1, errors: 0, providersWithoutPin: 0, providersWithoutPrefecture: 0, unitSpecialtiesComplete: true },
	populationYear: 2021,
	distanceFlagKm: 50,
	prefectures: [
		{ id: 1, name: 'Άλφα', genitive: 'Άλφας', population: 1000, seat: { label: 'Άλφα', lat: 38, lon: 21 } },
		{ id: 2, name: 'Βήτα', genitive: 'Βήτας', population: 3000, seat: { label: 'Βήτα', lat: 39, lon: 22 } }
	],
	specialties: [
		{ id: 20, name: 'Ψυχίατρος' },
		{ id: 7, name: 'Καρδιολόγος' }
	],
	providers: [
		prov({ id: 'u1', specialtyIds: [20], offeredSpecialtyIds: [20, 7], registeredSpecialtyIds: [20], firstDates: { '20': '2026-10-25' }, lastBookable: { '7': '2026-10-04' } }),
		prov({ id: 'u2', sector: 'pfy', name: 'ΚΕΝΤΡΟ ΥΓΕΙΑΣ ΒΗΤΑ', city: 'ΒΗΤΑ', prefectureId: 2, registeredSpecialtyIds: [20], lastBookable: { '20': null } }),
		prov({ id: 'd1', sector: 'private', name: 'ΠΑΠΑΔΟΠΟΥΛΟΣ ΙΩΑΝΝΗΣ', address: 'Ιδιωτική 9', specialtyIds: [7], offeredSpecialtyIds: [7], firstDates: { '7': '2026-10-23' } })
	],
	cells: [cell(1, 20, 1, 0, 0, 0), cell(2, 20, 0, 0, 0, 1), cell(1, 7, 0, 0, 1, 0), cell(2, 7, 0, 0, 0, 0)],
	doors: { fullAt: '2026-10-21', checkedAt: '2026-10-21' },
	scans: [
		{ id: '2026-10-14', at: '2026-10-14T00:01:00', units: 2, doctors: 1, complete: true },
		{ id: '2026-10-21', at: '2026-10-21T00:01:19', units: 2, doctors: 1, complete: true }
	],
	methodologyVersion: '3',
	history: [{ from: '2026-10-14', to: '2026-10-21', comparable: true, added: 3, removed: 1, addedItems: [{ providerId: 'd1', name: 'ΠΑΠΑΔΟΠΟΥΛΟΣ ΙΩΑΝΝΗΣ', sector: 'private', prefectureId: 1, specialtyId: 7 }], removedItems: [] }],
	pinIssues: [
		{ providerId: 'u1', name: 'ΓΕΝΙΚΟ ΝΟΣΟΚΟΜΕΙΟ ΑΛΦΑ', sector: 'esy', city: 'ΑΛΦΑ', prefectureId: 1, reason: 'zero', status: 'open', firstSeen: '2026-09-26', lastSeen: '2026-10-21', fixedSeen: null, daysOpen: 25, recurred: false },
		{ providerId: 'd1', name: 'ΠΑΠΑΔΟΠΟΥΛΟΣ ΙΩΑΝΝΗΣ', sector: 'private', city: 'ΑΛΦΑ', prefectureId: 1, reason: 'abroad', status: 'open', firstSeen: '2026-09-26', lastSeen: '2026-10-21', fixedSeen: null, daysOpen: 25, recurred: false }
	],
	findings: []
};

const ids = DATASETS.map((d) => d.id);

describe('open data: paths', () => {
	it('lists the nine datasets, each with a Greek title and a description per column', () => {
		expect(ids).toEqual(['coverage', 'specialty-coverage', 'sites', 'no-free-booking', 'waits', 'pin-issues', 'scans', 'prefectures', 'specialties']);
		for (const d of DATASETS) {
			expect(d.title).toMatch(/\p{Script=Greek}/u);
			expect(d.columns.length).toBeGreaterThan(1);
			for (const c of d.columns) {
				expect(c.key).toMatch(/^[a-z][A-Za-z0-9]*$/);
				expect(c.description).toMatch(/\p{Script=Greek}/u);
			}
		}
	});

	it('puts the filter in the path, never in a query (a static server ignores the query)', () => {
		expect(DATA_BASE).toBe('/data/v1');
		expect(datasetPath('coverage', 'csv')).toBe('/data/v1/coverage.csv');
		expect(datasetPath('coverage', 'json', { specialtyId: 20 })).toBe('/data/v1/coverage/specialty-20.json');
		expect(datasetPath('sites', 'csv', { prefectureId: 34 })).toBe('/data/v1/sites/prefecture-34.csv');
		// A dataset without filters ignores one.
		expect(datasetPath('pin-issues', 'csv', { specialtyId: 20 })).toBe('/data/v1/pin-issues.csv');
	});

	it('parses every path it builds, and nothing else', () => {
		expect(parseDatasetPath('coverage/specialty-20.json')).toEqual({ id: 'coverage', format: 'json', filter: { specialtyId: 20 } });
		expect(parseDatasetPath('scans.csv')).toEqual({ id: 'scans', format: 'csv', filter: {} });
		for (const bad of ['nope.csv', 'coverage.xml', 'coverage/specialty-x.csv', 'pin-issues/specialty-20.csv', 'coverage/region-3.csv', '../atlas.json']) {
			expect(parseDatasetPath(bad)).toBeNull();
		}
	});

	it('enumerates a file per dataset and format, and per specialty / prefecture where the dataset filters', () => {
		const paths = datasetPaths(report);
		expect(paths).toContain('index.json');
		expect(paths).toContain('coverage.csv');
		expect(paths).toContain('coverage/specialty-7.json');
		expect(paths).toContain('no-free-booking/prefecture-2.csv');
		expect(paths).not.toContain('scans/specialty-20.csv');
		expect(new Set(paths).size).toBe(paths.length);
		for (const p of paths.filter((x) => x !== 'index.json')) expect(parseDatasetPath(p)).not.toBeNull();
	});

	it('filterFor: the specialty wins, then the prefecture, else the whole set', () => {
		expect(filterFor({ prefectureId: 2, specialtyId: 20 })).toEqual({ specialtyId: 20 });
		expect(filterFor({ prefectureId: 2, specialtyId: null })).toEqual({ prefectureId: 2 });
		expect(filterFor({ prefectureId: null, specialtyId: null })).toEqual({});
	});
});

describe('open data: rows', () => {
	it('coverage: one row per prefecture × specialty with the public state', () => {
		const rows = datasetRows(report, 'coverage', { specialtyId: 20 });
		expect(rows.map((r) => [r.prefecture, r.publicSites, r.registeredPublic, r.publicState])).toEqual([
			['Άλφα', 1, 0, 'booking'],
			['Βήτα', 0, 1, 'registered']
		]);
		expect(rows[0]).toMatchObject({ prefectureId: 1, specialtyId: 20, specialty: 'Ψυχίατρος', population: 1000, esy: 1, pfy: 0, eopyy: 0, private: 0, per100k: 1.5, earliestDate: '2026-10-25', nearestKm: 3, nearestPublicKm: 3 });
		// A private doctor alone is not public coverage.
		expect(datasetRows(report, 'coverage', { prefectureId: 1 }).find((r) => r.specialtyId === 7)!.publicState).toBe('none');
	});

	it('specialty-coverage: prefectures by public state, the share and the residents left out', () => {
		const rows = datasetRows(report, 'specialty-coverage', {});
		expect(rows.find((r) => r.specialtyId === 20)).toEqual({
			specialtyId: 20,
			specialty: 'Ψυχίατρος',
			prefectures: 2,
			prefecturesBooking: 1,
			prefecturesRegisteredOnly: 1,
			prefecturesNone: 0,
			coverageShare: 0.5,
			residentsWithoutBooking: 3000
		});
		expect(rows.find((r) => r.specialtyId === 7)).toMatchObject({ prefecturesBooking: 0, prefecturesNone: 2, coverageShare: 0, residentsWithoutBooking: 4000 });
	});

	it('sites: public units only, one row per unit × specialty, with its state', () => {
		const rows = datasetRows(report, 'sites', {});
		expect(rows.map((r) => [r.providerId, r.specialtyId, r.state, r.firstDate, r.lastBookable])).toEqual([
			['u1', 7, 'not-now', null, '2026-10-04'],
			['u1', 20, 'bookable', '2026-10-25', null],
			['u2', 20, 'registered-only', null, null]
		]);
		expect(rows[1]).toMatchObject({ name: 'Γενικο Νοσοκομειο Αλφα', sector: 'esy', city: 'ΑΛΦΑ', prefecture: 'Άλφα', lat: 38, lon: 21, approxLocation: false });
	});

	it('never publishes a private or ΕΟΠΥΥ doctor by name, address or position', () => {
		for (const id of ids) {
			const csv = datasetCsv(report, id, {});
			const json = datasetJson(report, id, {});
			for (const s of ['ΠΑΠΑΔΟΠΟΥΛΟΣ', 'Ιδιωτική 9', 'd1']) {
				expect(csv, `${id}.csv`).not.toContain(s);
				expect(json, `${id}.json`).not.toContain(s);
			}
		}
	});

	it('no-free-booking: the public units without a free e-booking now, both kinds', () => {
		const rows = datasetRows(report, 'no-free-booking', {});
		expect(rows.map((r) => [r.prefecture, r.specialty, r.state])).toEqual([
			['Άλφα', 'Καρδιολόγος', 'not-now'],
			['Βήτα', 'Ψυχίατρος', 'registered-only']
		]);
		expect(datasetRows(report, 'no-free-booking', { prefectureId: 1 })).toHaveLength(1);
	});

	it('waits: days to the first free appointment, Greece and per prefecture, public and all sectors', () => {
		const rows = datasetRows(report, 'waits', { specialtyId: 20 });
		const greece = rows.find((r) => r.scope === 'public' && r.prefectureId == null)!;
		expect(greece).toMatchObject({ specialtyId: 20, prefecture: 'Ελλάδα', withDate: 1, min: 4, median: 4, max: 4, mean: 4 });
		const cardio = datasetRows(report, 'waits', { specialtyId: 7 });
		expect(cardio.filter((r) => r.scope === 'public')).toEqual([]); // no public date
		expect(cardio.find((r) => r.scope === 'all' && r.prefectureId === 1)).toMatchObject({ withDate: 1, min: 2 });
	});

	it('pin-issues: public units only, like /pin-issues.csv', () => {
		expect(datasetRows(report, 'pin-issues', {}).map((r) => r.providerId)).toEqual(['u1']);
	});

	it('scans: one row per scan with the change since the one before, counts only', () => {
		expect(datasetRows(report, 'scans', {})).toEqual([
			{ scan: '2026-10-14', complete: true, units: 2, doctors: 1, comparable: null, added: null, removed: null },
			{ scan: '2026-10-21', complete: true, units: 2, doctors: 1, comparable: true, added: 3, removed: 1 }
		]);
	});

	it('prefectures and specialties: the keys to join on', () => {
		expect(datasetRows(report, 'prefectures', {})[1]).toEqual({ prefectureId: 2, prefecture: 'Βήτα', genitive: 'Βήτας', population: 3000, seat: 'Βήτα', seatLat: 39, seatLon: 22 });
		expect(datasetRows(report, 'specialties', {}).map((r) => r.specialty)).toEqual(['Καρδιολόγος', 'Ψυχίατρος']);
	});
});

describe('open data: files', () => {
	it('CSV: a BOM (Excel reads Greek), the column keys as the header, one line per row', () => {
		const csv = datasetCsv(report, 'no-free-booking', {});
		const lines = csv.replace(/^﻿/, '').trim().split('\r\n');
		expect(csv.startsWith('﻿')).toBe(true);
		expect(lines[0]).toBe(DATASETS.find((d) => d.id === 'no-free-booking')!.columns.map((c) => c.key).join(','));
		expect(lines).toHaveLength(3);
	});

	it('JSON: the rows with the scan date, the filter, the columns, the source and the licence', () => {
		const j = JSON.parse(datasetJson(report, 'coverage', { specialtyId: 20 }));
		expect(j).toMatchObject({ dataset: 'coverage', scanAt: '2026-10-21', filter: { specialtyId: 20 }, license: LICENSE });
		expect(LICENSE).toMatchObject({ id: 'CC-BY-4.0' });
		expect(j.source).toContain('atlas.haroldpoi.dev');
		expect(j.rows).toHaveLength(2);
		expect(j.columns.map((c: { key: string }) => c.key)).toEqual(Object.keys(j.rows[0]));
	});

	it('every row has exactly the declared columns, in order', () => {
		for (const d of DATASETS) {
			for (const r of datasetRows(report, d.id, {})) expect(Object.keys(r), d.id).toEqual(d.columns.map((c) => c.key));
		}
	});

	it('index.json: every dataset with its URLs and URL patterns', () => {
		const c = catalog(report);
		expect(c.scanAt).toBe('2026-10-21');
		expect(c.license).toEqual(LICENSE);
		const cov = c.datasets.find((d) => d.id === 'coverage')!;
		expect(cov.csv).toBe('/data/v1/coverage.csv');
		expect(cov.bySpecialty).toBe('/data/v1/coverage/specialty-{specialtyId}.{csv,json}');
		expect(c.datasets.find((d) => d.id === 'scans')!.bySpecialty).toBeNull();
	});
});

describe('open data on the real atlas.json', () => {
	const real = JSON.parse(readFileSync('static/atlas.json', 'utf8')) as AtlasReport;

	it('the specialty files add up to the whole file', () => {
		for (const id of ['coverage', 'sites', 'no-free-booking'] as const) {
			const whole = datasetRows(real, id, {}).length;
			const parts = real.specialties.reduce((n, s) => n + datasetRows(real, id, { specialtyId: s.id }).length, 0);
			expect(parts, id).toBe(whole);
		}
	});

	it('no private or ΕΟΠΥΥ name or address reaches any file', () => {
		const hidden = real.providers.filter((p) => p.sector === 'eopyy' || p.sector === 'private');
		const names = new Set(hidden.map((p) => p.name).filter((n) => n.length > 6));
		const pub = new Set(real.providers.filter((p) => p.sector === 'esy' || p.sector === 'pfy').map((p) => p.name));
		for (const id of ids) {
			const text = datasetJson(real, id, {});
			for (const n of names) if (!pub.has(n)) expect(text.includes(`"${n}"`), `${id}: ${n}`).toBe(false);
		}
	});

	it('no private or ΕΟΠΥΥ id, address or position reaches any file, whole or cut', () => {
		const isPub = (p: Provider) => p.sector === 'esy' || p.sector === 'pfy';
		const hidden = real.providers.filter((p) => !isPub(p));
		expect(hidden.length).toBeGreaterThan(100); // the check is not vacuous
		const pubPos = new Set(real.providers.filter(isPub).map((p) => `${p.lat},${p.lon}`));
		const pubText = new Set(real.providers.filter(isPub).flatMap((p) => [p.address, p.name]));
		const ids = hidden.map((p) => `"${p.id}"`);
		const pos = hidden.filter((p) => p.lat != null && !pubPos.has(`${p.lat},${p.lon}`)).map((p) => [p.lat, p.lon]);
		// The export already blanks their addresses; if one ever comes through, no file may carry it.
		expect(hidden.every((p) => !p.address)).toBe(true);
		const addr = hidden.map((p) => p.address).filter((a) => a && a.length > 8 && !pubText.has(a));
		const files = DATASETS.flatMap((d) => [datasetJson(real, d.id, {}), ...(d.filters.length ? [datasetJson(real, d.id, { specialtyId: 20 }), datasetJson(real, d.id, { prefectureId: 34 })] : [])]);
		const csvs = DATASETS.map((d) => datasetCsv(real, d.id, {}));
		for (const text of csvs) for (const id of hidden.map((p) => p.id)) expect(text.includes(`,${id},`) || text.includes(`\n${id},`), `csv: ${id}`).toBe(false);
		for (const text of files) {
			const j = JSON.parse(text) as { dataset: string; rows: Record<string, unknown>[] };
			for (const id of ids) expect(text.includes(id), `${j.dataset}: ${id}`).toBe(false);
			for (const a of addr) expect(text.includes(JSON.stringify(a)), `${j.dataset}: address`).toBe(false);
			const rowPos = new Set(j.rows.filter((r) => r.lat != null).map((r) => `${r.lat},${r.lon}`));
			for (const [la, lo] of pos) expect(rowPos.has(`${la},${lo}`), `${j.dataset}: position`).toBe(false);
		}
	});

	it('the Ψυχίατρος headline matches the specialty-coverage row (6 none + 5 declared)', () => {
		const row = datasetRows(real, 'specialty-coverage', {}).find((r) => r.specialty === 'Ψυχίατρος')!;
		expect([row.prefecturesNone, row.prefecturesRegisteredOnly]).toEqual([6, 5]);
	});
});
