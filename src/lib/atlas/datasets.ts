// Open data: every table the page shows, as static CSV and JSON files under /data/v1.
// The files are prerendered from the same atlas.json as the page, so they never drift from it.
// Pure data: no DOM, no request state.

import type { AtlasReport, CoverageCell, Provider, Sector } from './types';
import { SECTORS } from './types';
import {
	daysFromScan,
	offeredIds,
	prefectureState,
	providerDate,
	providerName,
	registeredIds,
	toCsv,
	waitStats
} from '../../routes/components/format';

export const DATA_BASE = '/data/v1';

/** One line of attribution, in every JSON file and in the catalog. */
export const SOURCE =
	'Άτλας πρόσβασης, https://atlas.haroldpoi.dev · δεδομένα από τον κατάλογο ηλεκτρονικών ραντεβού του Υπουργείου Υγείας';

export const LICENSE = {
	id: 'CC-BY-4.0',
	name: 'CC BY 4.0',
	url: 'https://creativecommons.org/licenses/by/4.0/deed.el'
};

export type DatasetFormat = 'csv' | 'json';
export type FilterKind = 'specialty' | 'prefecture';

/** The rows this dataset can be cut by: a specialty id or a prefecture id, never both. */
export interface DataFilter {
	specialtyId?: number;
	prefectureId?: number;
}

export type DataValue = string | number | boolean | null;
export type DataRow = Record<string, DataValue>;

export interface DataColumn {
	key: string;
	description: string;
}

export type DatasetId =
	| 'coverage'
	| 'specialty-coverage'
	| 'sites'
	| 'no-free-booking'
	| 'waits'
	| 'pin-issues'
	| 'scans'
	| 'prefectures'
	| 'specialties';

export interface Dataset {
	id: DatasetId;
	title: string;
	description: string;
	columns: DataColumn[];
	filters: FilterKind[];
}

const PUBLIC_SECTORS: Sector[] = ['esy', 'pfy'];
const FORMATS: DatasetFormat[] = ['csv', 'json'];

// ---------- columns ----------

const coverageColumns: DataColumn[] = [
	{ key: 'prefectureId', description: 'Κωδικός νομού (1–51).' },
	{ key: 'prefecture', description: 'Όνομα νομού.' },
	{ key: 'specialtyId', description: 'Κωδικός ειδικότητας.' },
	{ key: 'specialty', description: 'Όνομα ειδικότητας.' },
	{ key: 'population', description: 'Κάτοικοι νομού, ΕΛΣΤΑΤ 2021.' },
	{ key: 'esy', description: 'Σημεία ΕΣΥ που προσφέρουν την ειδικότητα.' },
	{ key: 'pfy', description: 'Σημεία ΠΦΥ που προσφέρουν την ειδικότητα.' },
	{ key: 'eopyy', description: 'Σημεία συμβεβλημένων ΕΟΠΥΥ που προσφέρουν την ειδικότητα.' },
	{ key: 'private', description: 'Ιδιώτες που προσφέρουν την ειδικότητα.' },
	{ key: 'publicSites', description: 'Σημεία ΕΣΥ και ΠΦΥ μαζί.' },
	{ key: 'per100k', description: 'Σημεία ανά 100.000 κατοίκους, όλοι οι φορείς.' },
	{ key: 'earliestDate', description: 'Πρώτη ελεύθερη ημερομηνία στον νομό, μορφή ISO.' },
	{ key: 'nearestKm', description: 'Χιλιόμετρα από την έδρα του νομού ως το πλησιέστερο σημείο.' },
	{ key: 'nearestPublicKm', description: 'Το ίδιο για δημόσια σημεία.' },
	{
		key: 'registeredPublic',
		description: 'Δημόσιες μονάδες με δηλωμένο ιατρείο και κανένα σημείο· κενό όταν το αρχείο δεν έχει τη μέτρηση.'
	},
	{ key: 'publicState', description: 'booking, registered ή none: αν ο νομός έχει ραντεβού, μόνο δηλωμένο ιατρείο ή τίποτα.' }
];

const specialtyCoverageColumns: DataColumn[] = [
	{ key: 'specialtyId', description: 'Κωδικός ειδικότητας.' },
	{ key: 'specialty', description: 'Όνομα ειδικότητας.' },
	{ key: 'prefectures', description: 'Πλήθος νομών της χώρας.' },
	{ key: 'prefecturesBooking', description: 'Νομοί με ένα τουλάχιστον δημόσιο σημείο που προσφέρει την ειδικότητα.' },
	{ key: 'prefecturesRegisteredOnly', description: 'Νομοί με δηλωμένο δημόσιο ιατρείο και κανένα σημείο.' },
	{ key: 'prefecturesNone', description: 'Νομοί χωρίς δημόσιο σημείο και χωρίς δηλωμένο ιατρείο.' },
	{ key: 'coverageShare', description: 'Μερίδιο νομών με ραντεβού, από 0 έως 1.' },
	{ key: 'residentsWithoutBooking', description: 'Κάτοικοι νομών χωρίς δημόσιο σημείο για την ειδικότητα.' }
];

const siteColumns: DataColumn[] = [
	{ key: 'providerId', description: 'Κωδικός μονάδας στον κατάλογο.' },
	{ key: 'name', description: 'Όνομα δημόσιας μονάδας.' },
	{ key: 'sector', description: 'Φορέας: esy ή pfy.' },
	{ key: 'city', description: 'Πόλη της μονάδας.' },
	{ key: 'address', description: 'Διεύθυνση της μονάδας.' },
	{ key: 'prefectureId', description: 'Κωδικός νομού.' },
	{ key: 'prefecture', description: 'Όνομα νομού· κενό όταν λείπει.' },
	{ key: 'lat', description: 'Γεωγραφικό πλάτος.' },
	{ key: 'lon', description: 'Γεωγραφικό μήκος.' },
	{ key: 'approxLocation', description: 'true όταν η θέση είναι κέντρο πόλης και όχι ακριβής.' },
	{ key: 'specialtyId', description: 'Κωδικός ειδικότητας.' },
	{ key: 'specialty', description: 'Όνομα ειδικότητας.' },
	{ key: 'state', description: 'bookable: ελεύθερο ραντεβού στην τελευταία σάρωση· not-now: σε μία από τις 4 τελευταίες, όχι στην τελευταία· registered-only: μόνο δηλωμένο ιατρείο.' },
	{ key: 'firstDate', description: 'Πρώτη ελεύθερη ημερομηνία για την ειδικότητα, μορφή ISO.' },
	{ key: 'lastBookable', description: 'Τελευταία σάρωση με ελεύθερο ραντεβού· κενό όταν δεν εμφανίστηκε ποτέ.' }
];

const noFreeBookingColumns: DataColumn[] = [
	{ key: 'providerId', description: 'Κωδικός μονάδας στον κατάλογο.' },
	{ key: 'name', description: 'Όνομα δημόσιας μονάδας.' },
	{ key: 'sector', description: 'Φορέας: esy ή pfy.' },
	{ key: 'city', description: 'Πόλη της μονάδας.' },
	{ key: 'prefectureId', description: 'Κωδικός νομού.' },
	{ key: 'prefecture', description: 'Όνομα νομού· κενό όταν λείπει.' },
	{ key: 'specialtyId', description: 'Κωδικός ειδικότητας.' },
	{ key: 'specialty', description: 'Όνομα ειδικότητας.' },
	{ key: 'state', description: 'not-now: είχε ελεύθερο ραντεβού σε μία από τις 4 τελευταίες σαρώσεις, όχι στην τελευταία· registered-only: μόνο δηλωμένο ιατρείο.' },
	{ key: 'lastBookable', description: 'Τελευταία σάρωση με ελεύθερο ραντεβού· κενό όταν δεν εμφανίστηκε ποτέ.' }
];

const waitColumns: DataColumn[] = [
	{ key: 'scope', description: 'public (ΕΣΥ και ΠΦΥ) ή all (όλοι οι φορείς).' },
	{ key: 'prefectureId', description: 'Κωδικός νομού· κενό για όλη την Ελλάδα.' },
	{ key: 'prefecture', description: 'Όνομα νομού ή Ελλάδα.' },
	{ key: 'specialtyId', description: 'Κωδικός ειδικότητας.' },
	{ key: 'specialty', description: 'Όνομα ειδικότητας.' },
	{ key: 'sites', description: 'Σημεία στον κατάλογο που προσφέρουν την ειδικότητα.' },
	{ key: 'withDate', description: 'Σημεία με ημερομηνία πρώτου ραντεβού.' },
	{ key: 'min', description: 'Οι λιγότερες ημέρες από τη σάρωση ως το πρώτο ελεύθερο ραντεβού.' },
	{ key: 'q1', description: 'Πρώτο τεταρτημόριο των ημερών αναμονής.' },
	{ key: 'median', description: 'Διάμεσος των ημερών αναμονής.' },
	{ key: 'q3', description: 'Τρίτο τεταρτημόριο των ημερών αναμονής.' },
	{ key: 'max', description: 'Οι περισσότερες ημέρες αναμονής.' },
	{ key: 'mean', description: 'Μέσος όρος ημερών αναμονής.' }
];

const pinIssueColumns: DataColumn[] = [
	{ key: 'providerId', description: 'Κωδικός μονάδας.' },
	{ key: 'name', description: 'Όνομα μονάδας.' },
	{ key: 'city', description: 'Πόλη της μονάδας.' },
	{ key: 'prefecture', description: 'Όνομα νομού.' },
	{ key: 'sector', description: 'Φορέας: esy ή pfy.' },
	{ key: 'reason', description: 'zero (μηδενικές συντεταγμένες), abroad (εκτός Ελλάδας) ή wrong_city (άλλη πόλη).' },
	{ key: 'status', description: 'open, fixed ή unverified.' },
	{ key: 'firstSeen', description: 'Σάρωση που το εντόπισε πρώτη φορά, μορφή ISO.' },
	{ key: 'lastSeen', description: 'Τελευταία σάρωση που το είδε λάθος, μορφή ISO.' },
	{ key: 'fixedSeen', description: 'Σάρωση που το είδε σωστό πρώτη φορά, μορφή ISO.' },
	{ key: 'daysOpen', description: 'Ημέρες από την πρώτη εμφάνιση ως την τελευταία σάρωση ή τη διόρθωση.' }
];

const scanColumns: DataColumn[] = [
	{ key: 'scan', description: 'Ημερομηνία σάρωσης, και ταυτότητα της γραμμής.' },
	{ key: 'complete', description: 'true όταν η σάρωση ολοκληρώθηκε.' },
	{ key: 'units', description: 'Μονάδες που βρήκε η σάρωση.' },
	{ key: 'doctors', description: 'Γιατροί που βρήκε η σάρωση.' },
	{ key: 'comparable', description: 'true όταν η διαφορά με την προηγούμενη σάρωση είναι συγκρίσιμη.' },
	{ key: 'added', description: 'Σημεία × ειδικότητες που προστέθηκαν από την προηγούμενη σάρωση.' },
	{ key: 'removed', description: 'Σημεία × ειδικότητες που έφυγαν από τον κατάλογο από την προηγούμενη σάρωση.' }
];

const prefectureColumns: DataColumn[] = [
	{ key: 'prefectureId', description: 'Κωδικός νομού (1–51).' },
	{ key: 'prefecture', description: 'Όνομα νομού.' },
	{ key: 'genitive', description: 'Γενική πτώση για το «Ν. …».' },
	{ key: 'population', description: 'Κάτοικοι νομού, ΕΛΣΤΑΤ 2021.' },
	{ key: 'seat', description: 'Έδρα του νομού.' },
	{ key: 'seatLat', description: 'Γεωγραφικό πλάτος της έδρας.' },
	{ key: 'seatLon', description: 'Γεωγραφικό μήκος της έδρας.' }
];

const specialtyColumns: DataColumn[] = [
	{ key: 'specialtyId', description: 'Κωδικός ειδικότητας.' },
	{ key: 'specialty', description: 'Όνομα ειδικότητας.' }
];

// ---------- the catalog of datasets ----------

export const DATASETS: Dataset[] = [
	{
		id: 'coverage',
		title: 'Κάλυψη ανά νομό και ειδικότητα',
		description: 'Ένας νομός και μία ειδικότητα ανά γραμμή: σημεία ανά φορέα, πληθυσμός και πρώτη ελεύθερη ημερομηνία.',
		columns: coverageColumns,
		filters: ['specialty', 'prefecture']
	},
	{
		id: 'specialty-coverage',
		title: 'Κάλυψη νομών ανά ειδικότητα',
		description: 'Πόσοι νομοί έχουν δημόσιο σημείο, μόνο δηλωμένο ιατρείο ή τίποτα, και πόσοι κάτοικοι μένουν έξω.',
		columns: specialtyCoverageColumns,
		filters: []
	},
	{
		id: 'sites',
		title: 'Δημόσια σημεία',
		description: 'Μία γραμμή ανά δημόσιο σημείο και ειδικότητα, με την κατάσταση του ραντεβού.',
		columns: siteColumns,
		filters: ['specialty', 'prefecture']
	},
	{
		id: 'no-free-booking',
		title: 'Χωρίς ελεύθερο ηλεκτρονικό ραντεβού',
		description: 'Τα δημόσια σημεία όπου δεν βρήκαμε ελεύθερο ηλεκτρονικό ραντεβού στη σάρωση.',
		columns: noFreeBookingColumns,
		filters: ['specialty', 'prefecture']
	},
	{
		id: 'waits',
		title: 'Αναμονή ως το πρώτο ραντεβού',
		description: 'Ημέρες από τη σάρωση ως το πρώτο ελεύθερο ραντεβού ανά ειδικότητα, για όλη την Ελλάδα και ανά νομό.',
		columns: waitColumns,
		filters: ['specialty', 'prefecture']
	},
	{
		id: 'pin-issues',
		title: 'Λάθος θέσεις στον χάρτη',
		description: 'Δημόσιες μονάδες με λάθος ή χαμένη θέση στην πηγή, όπως τη μετράμε κάθε εβδομάδα.',
		columns: pinIssueColumns,
		filters: []
	},
	{
		id: 'scans',
		title: 'Εβδομαδιαίες σαρώσεις',
		description: 'Μία γραμμή ανά σάρωση, με τα μεγέθη και τη διαφορά από την προηγούμενη.',
		columns: scanColumns,
		filters: []
	},
	{
		id: 'prefectures',
		title: 'Νομοί',
		description: 'Οι 51 νομοί με πληθυσμό και έδρα, για συνδέσεις με τα άλλα αρχεία.',
		columns: prefectureColumns,
		filters: []
	},
	{
		id: 'specialties',
		title: 'Ειδικότητες',
		description: 'Οι ειδικότητες του καταλόγου, για συνδέσεις με τα άλλα αρχεία.',
		columns: specialtyColumns,
		filters: []
	}
];

const byId = new Map(DATASETS.map((d) => [d.id, d]));

function columnsOf(id: DatasetId): DataColumn[] {
	return byId.get(id)!.columns;
}

function filtersOf(id: DatasetId): FilterKind[] {
	return byId.get(id)!.filters;
}

// ---------- paths ----------

/** A filter is kept only when its dataset can be cut by it (a static server ignores a query). */
function normalizeFilter(id: DatasetId, filter: DataFilter): DataFilter {
	const kinds = filtersOf(id);
	const out: DataFilter = {};
	if (kinds.includes('specialty') && filter.specialtyId != null) out.specialtyId = filter.specialtyId;
	if (kinds.includes('prefecture') && filter.prefectureId != null) out.prefectureId = filter.prefectureId;
	return out;
}

/** The absolute path of one file; the whole set when the filter is empty or unsupported. */
export function datasetPath(id: DatasetId, format: DatasetFormat, filter: DataFilter = {}): string {
	const base = `${DATA_BASE}/${id}`;
	const f = normalizeFilter(id, filter);
	if (f.specialtyId != null) return `${base}/specialty-${f.specialtyId}.${format}`;
	if (f.prefectureId != null) return `${base}/prefecture-${f.prefectureId}.${format}`;
	return `${base}.${format}`;
}

export interface ParsedDatasetPath {
	id: DatasetId;
	format: DatasetFormat;
	filter: DataFilter;
}

const WHOLE = /^([a-z][a-z0-9-]*)\.(csv|json)$/;
const FILTERED = /^([a-z][a-z0-9-]*)\/(specialty|prefecture)-(\d+)\.(csv|json)$/;

/** The inverse of `datasetPath`, for the prerendered endpoint; null for anything else. */
export function parseDatasetPath(relPath: string): ParsedDatasetPath | null {
	const whole = WHOLE.exec(relPath);
	if (whole) {
		const id = whole[1] as DatasetId;
		if (!byId.has(id)) return null;
		return { id, format: whole[2] as DatasetFormat, filter: {} };
	}
	const cut = FILTERED.exec(relPath);
	if (!cut) return null;
	const id = cut[1] as DatasetId;
	const kind = cut[2] as FilterKind;
	if (!byId.has(id) || !filtersOf(id).includes(kind)) return null;
	return {
		id,
		format: cut[4] as DatasetFormat,
		filter: kind === 'specialty' ? { specialtyId: Number(cut[3]) } : { prefectureId: Number(cut[3]) }
	};
}

/** Every file the endpoint prerenders, relative to DATA_BASE: the catalog, then all cuts. */
export function datasetPaths(report: AtlasReport): string[] {
	const paths = ['index.json'];
	for (const d of DATASETS) {
		for (const format of FORMATS) paths.push(`${d.id}.${format}`);
		if (d.filters.includes('specialty')) {
			for (const s of report.specialties) for (const format of FORMATS) paths.push(`${d.id}/specialty-${s.id}.${format}`);
		}
		if (d.filters.includes('prefecture')) {
			for (const p of report.prefectures) for (const format of FORMATS) paths.push(`${d.id}/prefecture-${p.id}.${format}`);
		}
	}
	return paths;
}

/** The one filter the page's selection maps to: the specialty wins, then the prefecture. */
export function filterFor(selection: { prefectureId: number | null; specialtyId: number | null }): DataFilter {
	if (selection.specialtyId != null) return { specialtyId: selection.specialtyId };
	if (selection.prefectureId != null) return { prefectureId: selection.prefectureId };
	return {};
}

// ---------- rows ----------

const cmp = (a: string, b: string) => a.localeCompare(b, 'el');
const round1 = (n: number) => Math.round(n * 10) / 10;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

function isPublic(p: Provider): boolean {
	return p.sector === 'esy' || p.sector === 'pfy';
}

/** One row with exactly the declared columns, in their order; missing values become null. */
function row(columns: readonly DataColumn[], values: Record<string, DataValue>): DataRow {
	const out: DataRow = {};
	for (const c of columns) out[c.key] = values[c.key] ?? null;
	return out;
}

interface Lookups {
	prefName: Map<number, string>;
	prefPopulation: Map<number, number>;
	specName: Map<number, string>;
	cellByKey: Map<string, CoverageCell>;
}

function lookups(report: AtlasReport): Lookups {
	return {
		prefName: new Map(report.prefectures.map((p) => [p.id, p.name])),
		prefPopulation: new Map(report.prefectures.map((p) => [p.id, p.population])),
		specName: new Map(report.specialties.map((s) => [s.id, s.name])),
		cellByKey: new Map(report.cells.map((c) => [`${c.prefectureId}:${c.specialtyId}`, c]))
	};
}

function coverageRows(report: AtlasReport, idx: Lookups, filter: DataFilter): DataRow[] {
	const rows: DataRow[] = [];
	for (const cell of report.cells) {
		if (filter.specialtyId != null && cell.specialtyId !== filter.specialtyId) continue;
		if (filter.prefectureId != null && cell.prefectureId !== filter.prefectureId) continue;
		const pref = idx.prefName.get(cell.prefectureId);
		const spec = idx.specName.get(cell.specialtyId);
		if (pref == null || spec == null) continue;
		const population = idx.prefPopulation.get(cell.prefectureId) ?? 0;
		const publicSites = (cell.counts.esy ?? 0) + (cell.counts.pfy ?? 0);
		const registeredPublic = cell.registeredCounts ? (cell.registeredCounts.esy ?? 0) + (cell.registeredCounts.pfy ?? 0) : null;
		rows.push(
			row(columnsOf('coverage'), {
				prefectureId: cell.prefectureId,
				prefecture: pref,
				specialtyId: cell.specialtyId,
				specialty: spec,
				population,
				esy: cell.counts.esy ?? 0,
				pfy: cell.counts.pfy ?? 0,
				eopyy: cell.counts.eopyy ?? 0,
				private: cell.counts.private ?? 0,
				publicSites,
				per100k: cell.per100k ?? null,
				earliestDate: cell.earliestDate ?? null,
				nearestKm: cell.nearestKm ?? null,
				nearestPublicKm: cell.nearestPublicKm ?? null,
				registeredPublic,
				publicState: prefectureState(cell, PUBLIC_SECTORS)
			})
		);
	}
	return rows.sort((a, b) => cmp(String(a.prefecture), String(b.prefecture)) || cmp(String(a.specialty), String(b.specialty)));
}

function specialtyCoverageRows(report: AtlasReport, idx: Lookups): DataRow[] {
	const rows: DataRow[] = [];
	const total = report.prefectures.length;
	for (const spec of report.specialties) {
		let booking = 0;
		let registeredOnly = 0;
		let none = 0;
		let residentsWithoutBooking = 0;
		for (const pref of report.prefectures) {
			// A prefecture without a cell counts as having nothing.
			const state = prefectureState(idx.cellByKey.get(`${pref.id}:${spec.id}`), PUBLIC_SECTORS);
			if (state === 'booking') booking++;
			else {
				if (state === 'registered') registeredOnly++;
				else none++;
				residentsWithoutBooking += pref.population;
			}
		}
		rows.push(
			row(columnsOf('specialty-coverage'), {
				specialtyId: spec.id,
				specialty: spec.name,
				prefectures: total,
				prefecturesBooking: booking,
				prefecturesRegisteredOnly: registeredOnly,
				prefecturesNone: none,
				coverageShare: total > 0 ? round3(booking / total) : 0,
				residentsWithoutBooking
			})
		);
	}
	return rows.sort((a, b) => cmp(String(a.specialty), String(b.specialty)));
}

interface SiteRecord {
	provider: Provider;
	prefecture: string | null;
	specialtyId: number;
	specialty: string;
	state: 'bookable' | 'not-now' | 'registered-only';
	firstDate: string | null;
	lastBookable: string | null;
}

/** Public units only (privacy: private and ΕΟΠΥΥ doctors are never named). */
function siteRecords(report: AtlasReport, idx: Lookups, filter: DataFilter): SiteRecord[] {
	const known = new Set(idx.specName.keys());
	const out: SiteRecord[] = [];
	for (const p of report.providers) {
		if (!isPublic(p)) continue;
		if (filter.prefectureId != null && p.prefectureId !== filter.prefectureId) continue;
		const offered = offeredIds(p);
		for (const id of new Set([...p.specialtyIds, ...offered, ...registeredIds(p)])) {
			if (!known.has(id)) continue;
			if (filter.specialtyId != null && id !== filter.specialtyId) continue;
			const bookable = p.specialtyIds.includes(id);
			out.push({
				provider: p,
				prefecture: p.prefectureId == null ? null : (idx.prefName.get(p.prefectureId) ?? null),
				specialtyId: id,
				specialty: idx.specName.get(id)!,
				state: bookable ? 'bookable' : offered.includes(id) ? 'not-now' : 'registered-only',
				firstDate: bookable ? providerDate(p, id) : null,
				lastBookable: bookable ? null : (p.lastBookable?.[String(id)] ?? null)
			});
		}
	}
	return out;
}

function sitesRows(records: SiteRecord[]): DataRow[] {
	const rows = records.map((r) =>
		row(columnsOf('sites'), {
			providerId: r.provider.id,
			name: providerName(r.provider),
			sector: r.provider.sector,
			city: r.provider.city,
			address: r.provider.address,
			prefectureId: r.provider.prefectureId,
			prefecture: r.prefecture,
			lat: r.provider.lat ?? null,
			lon: r.provider.lon ?? null,
			approxLocation: r.provider.approx,
			specialtyId: r.specialtyId,
			specialty: r.specialty,
			state: r.state,
			firstDate: r.firstDate,
			lastBookable: r.lastBookable
		})
	);
	return rows.sort(
		(a, b) =>
			cmp(String(a.prefecture ?? ''), String(b.prefecture ?? '')) ||
			cmp(String(a.name), String(b.name)) ||
			cmp(String(a.specialty), String(b.specialty))
	);
}

function noFreeBookingRows(records: SiteRecord[]): DataRow[] {
	const rows = records
		.filter((r) => r.state !== 'bookable')
		.map((r) =>
			row(columnsOf('no-free-booking'), {
				providerId: r.provider.id,
				name: providerName(r.provider),
				sector: r.provider.sector,
				city: r.provider.city,
				prefectureId: r.provider.prefectureId,
				prefecture: r.prefecture,
				specialtyId: r.specialtyId,
				specialty: r.specialty,
				state: r.state,
				lastBookable: r.lastBookable
			})
		);
	return rows.sort(
		(a, b) =>
			cmp(String(a.prefecture ?? ''), String(b.prefecture ?? '')) ||
			cmp(String(a.specialty), String(b.specialty)) ||
			cmp(String(a.name), String(b.name))
	);
}

function waitRows(report: AtlasReport, idx: Lookups, filter: DataFilter): DataRow[] {
	const scanAt = report.scan.at;
	const scopes: { scope: 'public' | 'all'; sectors: Sector[] }[] = [
		{ scope: 'public', sectors: PUBLIC_SECTORS },
		{ scope: 'all', sectors: [...SECTORS] }
	];
	const rows: DataRow[] = [];
	for (const spec of report.specialties) {
		if (filter.specialtyId != null && spec.id !== filter.specialtyId) continue;
		for (const { scope, sectors } of scopes) {
			const inScope = report.providers.filter((p) => sectors.includes(p.sector) && offeredIds(p).includes(spec.id));
			const places: { prefectureId: number | null; prefecture: string }[] = [
				{ prefectureId: null, prefecture: 'Ελλάδα' },
				...report.prefectures.map((p) => ({ prefectureId: p.id, prefecture: p.name }))
			];
			for (const place of places) {
				if (filter.prefectureId != null && place.prefectureId !== filter.prefectureId) continue;
				const sites = place.prefectureId == null ? inScope : inScope.filter((p) => p.prefectureId === place.prefectureId);
				const days = sites
					.map((p) => daysFromScan(providerDate(p, spec.id), scanAt))
					.filter((d): d is number => d != null && d >= 0);
				const stats = waitStats(days);
				if (!stats) continue;
				rows.push(
					row(columnsOf('waits'), {
						scope,
						prefectureId: place.prefectureId,
						prefecture: place.prefecture,
						specialtyId: spec.id,
						specialty: spec.name,
						sites: sites.length,
						withDate: stats.n,
						min: round1(stats.min),
						q1: round1(stats.q1),
						median: round1(stats.median),
						q3: round1(stats.q3),
						max: round1(stats.max),
						mean: round1(stats.mean)
					})
				);
			}
		}
	}
	return rows.sort(
		(a, b) =>
			cmp(String(a.specialty), String(b.specialty)) ||
			cmp(String(a.scope), String(b.scope)) ||
			byPlace(a, b)
	);
}

/** Greece (no prefecture id) first, then prefecture ids in order. */
function byPlace(a: DataRow, b: DataRow): number {
	if (a.prefectureId == null && b.prefectureId == null) return 0;
	if (a.prefectureId == null) return -1;
	if (b.prefectureId == null) return 1;
	return Number(a.prefectureId) - Number(b.prefectureId);
}

const PIN_STATUS_ORDER: Record<string, number> = { open: 0, unverified: 1, fixed: 2 };

function pinIssueRows(report: AtlasReport, idx: Lookups): DataRow[] {
	return report.pinIssues
		.filter((i) => i.sector === 'esy' || i.sector === 'pfy')
		.map((i) => ({ ...i, prefecture: i.prefectureId == null ? '' : (idx.prefName.get(i.prefectureId) ?? '') }))
		.sort((a, b) => PIN_STATUS_ORDER[a.status] - PIN_STATUS_ORDER[b.status] || cmp(a.prefecture, b.prefecture) || cmp(a.name, b.name))
		.map((i) =>
			row(columnsOf('pin-issues'), {
				providerId: i.providerId,
				name: i.name,
				city: i.city,
				prefecture: i.prefecture,
				sector: i.sector,
				reason: i.reason,
				status: i.status,
				firstSeen: i.firstSeen,
				lastSeen: i.lastSeen,
				fixedSeen: i.fixedSeen,
				daysOpen: i.daysOpen
			})
		);
}

function scanRows(report: AtlasReport): DataRow[] {
	return [...report.scans]
		.sort((a, b) => cmp(a.id, b.id))
		.map((s) => {
			const delta = report.history.find((h) => h.to === s.id);
			return row(columnsOf('scans'), {
				scan: s.id,
				complete: s.complete,
				units: s.units,
				doctors: s.doctors,
				comparable: delta ? delta.comparable : null,
				added: delta ? delta.added : null,
				removed: delta ? delta.removed : null
			});
		});
}

function prefectureRows(report: AtlasReport): DataRow[] {
	return [...report.prefectures]
		.sort((a, b) => cmp(a.name, b.name))
		.map((p) =>
			row(columnsOf('prefectures'), {
				prefectureId: p.id,
				prefecture: p.name,
				genitive: p.genitive,
				population: p.population,
				seat: p.seat.label,
				seatLat: p.seat.lat,
				seatLon: p.seat.lon
			})
		);
}

function specialtyRows(report: AtlasReport): DataRow[] {
	return [...report.specialties]
		.sort((a, b) => cmp(a.name, b.name))
		.map((s) => row(columnsOf('specialties'), { specialtyId: s.id, specialty: s.name }));
}

/** The rows of one dataset; datasets without filters ignore one. */
export function datasetRows(report: AtlasReport, id: DatasetId, filter: DataFilter = {}): DataRow[] {
	switch (id) {
		case 'coverage':
			return coverageRows(report, lookups(report), normalizeFilter(id, filter));
		case 'specialty-coverage':
			return specialtyCoverageRows(report, lookups(report));
		case 'sites':
			return sitesRows(siteRecords(report, lookups(report), normalizeFilter(id, filter)));
		case 'no-free-booking':
			return noFreeBookingRows(siteRecords(report, lookups(report), normalizeFilter(id, filter)));
		case 'waits':
			return waitRows(report, lookups(report), normalizeFilter(id, filter));
		case 'pin-issues':
			return pinIssueRows(report, lookups(report));
		case 'scans':
			return scanRows(report);
		case 'prefectures':
			return prefectureRows(report);
		case 'specialties':
			return specialtyRows(report);
	}
}

// ---------- files ----------

/** A value as CSV carries it: booleans as true/false, null as an empty cell. */
function csvValue(v: DataValue): string | number | null {
	if (v == null) return null;
	if (typeof v === 'boolean') return v ? 'true' : 'false';
	return v;
}

/** RFC 4180 CSV with the column keys as the header, and a BOM so Excel reads Greek. */
export function datasetCsv(report: AtlasReport, id: DatasetId, filter: DataFilter = {}): string {
	const columns = columnsOf(id);
	const rows = datasetRows(report, id, filter);
	return toCsv([columns.map((c) => c.key), ...rows.map((r) => columns.map((c) => csvValue(r[c.key] ?? null)))]);
}

/** The same table as JSON, with the scan date, the filter, the columns, the source and the licence. */
export function datasetJson(report: AtlasReport, id: DatasetId, filter: DataFilter = {}): string {
	const dataset = byId.get(id)!;
	return JSON.stringify({
		dataset: dataset.id,
		title: dataset.title,
		description: dataset.description,
		scanAt: report.scan.at.slice(0, 10),
		filter: normalizeFilter(id, filter),
		source: SOURCE,
		license: LICENSE,
		columns: dataset.columns,
		rows: datasetRows(report, id, filter)
	});
}

/** index.json: what exists, where, and under which URL patterns. */
export function catalog(report: AtlasReport) {
	return {
		scanAt: report.scan.at.slice(0, 10),
		source: SOURCE,
		license: LICENSE,
		datasets: DATASETS.map((d) => ({
			id: d.id,
			title: d.title,
			description: d.description,
			columns: d.columns,
			filters: d.filters,
			csv: datasetPath(d.id, 'csv'),
			json: datasetPath(d.id, 'json'),
			bySpecialty: d.filters.includes('specialty') ? `${DATA_BASE}/${d.id}/specialty-{specialtyId}.{csv,json}` : null,
			byPrefecture: d.filters.includes('prefecture') ? `${DATA_BASE}/${d.id}/prefecture-{prefectureId}.{csv,json}` : null
		}))
	};
}
