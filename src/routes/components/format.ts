// Pure helpers for the atlas components: Greek text/number/date formatting, cell keys,
// and the row deriver that both lists and the summary read from. No DOM, no state.

import type {
	AtlasData,
	AtlasReport,
	ChangeItem,
	CoverageCell,
	Metric,
	PinIssue,
	PinReason,
	Prefecture,
	PrefectureBoundaries,
	Provider,
	Sector,
	SectorCounts,
	Selection,
	Specialty
} from '$lib/atlas/types';
import { SECTORS } from '$lib/atlas/types';

/** Short sector names for marks and chips (the long ones live in SECTOR_LABEL). */
export const SECTOR_SHORT: Record<Sector, string> = {
	esy: 'ΕΣΥ',
	pfy: 'ΠΦΥ',
	eopyy: 'ΕΟΠΥΥ',
	private: 'Ιδιώτες'
};

export const METRIC_LABEL: Record<Metric, string> = {
	count: 'Σημεία',
	per100k: 'Ανά 100 χιλ.',
	nearestKm: 'Πλησιέστερος',
	earliestDate: 'Πρώτο ραντεβού'
};

export const METRICS: Metric[] = ['count', 'per100k', 'nearestKm', 'earliestDate'];

// ---------- text ----------

/** «ΚΑΡΔΙΟΛΟΓΟΣ» → «Καρδιολόγος». Greek-aware; keeps a capital after «/», «-», quotes. */
export function titleCase(s: string): string {
	// Already cased («Ιατρική της εργασίας», «Έβρος»): leave it; only SHOUTING is recased.
	if (/\p{Ll}/u.test(s)) return s.replace(/\s+/g, ' ').trim();
	return s
		.toLocaleLowerCase('el-GR')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/(^|[\s«("'/-])(\p{Ll})/gu, (_: string, p: string, c: string) => p + c.toUpperCase()) // not el-GR: it drops the accent («έ» → «Ε»)
		// A final sigma inside a lower-cased word: «ΓΕΝΙΚΟΣ» → «Γενικοσ» → «Γενικός».
		.replace(/σ(?=[\s.,;:)»"']|$)/gu, 'ς');
}

/** Accent-/case-insensitive key for searching Greek names. */
export function fold(s: string): string {
	return s
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLocaleLowerCase('el-GR')
		.replace(/ς/g, 'σ');
}

// ---------- numbers ----------

const intFmt = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 0 });
const oneFmt = new Intl.NumberFormat('el-GR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const statFmt = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 1 });

export function fmtInt(n: number): string {
	return intFmt.format(n);
}

/** An empty numeric cell. An en dash, never used as punctuation inside a sentence. */
export const EMPTY = '–';

/** Providers per 100 000: one decimal, «–» for null. */
export function fmtPer100k(n: number | null): string {
	if (n == null) return EMPTY;
	return oneFmt.format(n);
}

/** Decimal statistics in prose: at most one Greek decimal place. */
export function fmtStat(n: number): string {
	return statFmt.format(n);
}

/** Kilometres with one decimal for < 100, whole above («152 χλμ», «12,4 χλμ»). */
export function fmtKm(km: number | null): string {
	if (km == null) return EMPTY;
	return (km < 100 ? oneFmt.format(km) : intFmt.format(km)) + ' χλμ';
}

// ---------- dates (always relative to the scan, never to "today") ----------

const DAY = 86_400_000;
const WEEKDAYS = ['Κυρ', 'Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ'];
const MONTHS = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαΐ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];

/** Parse an ISO date (or date-time) as a UTC midnight; null when unparsable. */
export function parseDay(iso: string | null | undefined): Date | null {
	const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (!m) return null;
	const year = +m[1];
	const month = +m[2] - 1;
	const day = +m[3];
	const date = new Date(Date.UTC(year, month, day));
	return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day ? date : null;
}

/** «Δευ 29 Σεπ» */
export function fmtDay(iso: string | null): string {
	const d = parseDay(iso);
	if (!d) return EMPTY;
	return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** «26 Σεπτεμβρίου 2026», for the notice. */
export function fmtDateLong(iso: string): string {
	const d = parseDay(iso);
	if (!d) return iso;
	return d.toLocaleDateString('el-GR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Whole days from the scan date to `iso`; null when either is missing. */
export function daysFromScan(iso: string | null, scanAt: string): number | null {
	const a = parseDay(scanAt);
	const b = parseDay(iso);
	if (!a || !b) return null;
	return Math.round((b.getTime() - a.getTime()) / DAY);
}

/** «+3 ημ.», «την ημέρα της σάρωσης», «+2 εβδ.» */
export function fmtOffset(days: number | null): string {
	if (days == null) return '';
	if (days === 0) return 'την ημέρα της σάρωσης';
	if (days < 0) return `${days} ημ.`;
	if (days < 14) return `+${days} ημ.`;
	if (days < 60) return `+${Math.round(days / 7)} εβδ.`;
	return `+${Math.round(days / 30)} μήν.`;
}

/** Compact mobile date copy, measured from the scan rather than from today. */
export function fmtWaitCompact(iso: string | null, scanAt: string): string {
	const days = daysFromScan(iso, scanAt);
	if (days == null || days < 0) return 'Χωρίς ημερομηνία';
	if (days === 0) return 'ίδια μέρα';
	return `σε ${fmtInt(days)} ημ.`;
}

// ---------- keys ----------

/** `${prefectureId}:${specialtyId}`; prefecture 0 = all Greece. */
export function cellKey(prefectureId: number | null, specialtyId: number): string {
	return `${prefectureId ?? 0}:${specialtyId}`;
}

export function parseKey(key: string): { prefectureId: number | null; specialtyId: number } | null {
	const m = key.match(/^(\d+):(\d+)$/);
	if (!m) return null;
	const p = +m[1];
	return { prefectureId: p === 0 ? null : p, specialtyId: +m[2] };
}

// ---------- geometry ----------

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const R = 6371;
	const toRad = (x: number) => (x * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(a));
}

// ---------- sectors ----------

export function sumCounts(counts: SectorCounts, sectors: readonly Sector[]): number {
	let n = 0;
	for (const s of sectors) n += counts[s] ?? 0;
	return n;
}

export function isAllSectors(sectors: readonly Sector[]): boolean {
	return SECTORS.every((s) => sectors.includes(s));
}

export function isPublicOnly(sectors: readonly Sector[]): boolean {
	return sectors.length === 2 && sectors.includes('esy') && sectors.includes('pfy');
}

/** Keep the canonical sector order regardless of click order. */
export function orderSectors(sectors: readonly Sector[]): Sector[] {
	return SECTORS.filter((s) => sectors.includes(s));
}

// ---------- indexes ----------

export interface AtlasIndex {
	prefById: Map<number, Prefecture>;
	specById: Map<number, Specialty>;
	provById: Map<string, Provider>;
	cellByKey: Map<string, CoverageCell>;
	/** Providers per specialty id (a provider with several specialties appears in each). */
	provBySpec: Map<number, Provider[]>;
	/** Providers per prefecture × specialty (cellKey), in provBySpec order. */
	provByCell: Map<string, Provider[]>;
	population: number;
}

// Every component asks for the index of the same report; build it once. On a phone the
// repeated scans held the first render for seconds, with no button answering.
const indexes = new WeakMap<AtlasData, AtlasIndex>();
export function buildIndex(data: AtlasData): AtlasIndex {
	const known = indexes.get(data);
	if (known) return known;
	const prefById = new Map(data.prefectures.map((p) => [p.id, p]));
	const specById = new Map(data.specialties.map((s) => [s.id, s]));
	const provById = new Map(data.providers.map((p) => [p.id, p]));
	const cellByKey = new Map(data.cells.map((c) => [cellKey(c.prefectureId, c.specialtyId), c]));
	const provBySpec = new Map<number, Provider[]>();
	const provByCell = new Map<string, Provider[]>();
	for (const p of data.providers) {
		for (const s of p.specialtyIds) {
			const arr = provBySpec.get(s);
			if (arr) arr.push(p);
			else provBySpec.set(s, [p]);
			if (p.prefectureId == null) continue;
			const key = cellKey(p.prefectureId, s);
			const inCell = provByCell.get(key);
			if (inCell) inCell.push(p);
			else provByCell.set(key, [p]);
		}
	}
	let population = 0;
	for (const p of data.prefectures) population += p.population;
	const idx = { prefById, specById, provById, cellByKey, provBySpec, provByCell, population };
	indexes.set(data, idx);
	return idx;
}

/** Each site of a selection once (whatever its specialties): the unit of «μοναδικά σημεία». */
export function uniqueSites(data: AtlasData, selection: Selection): Provider[] {
	const { prefectureId, specialtyId, sectors } = selection;
	return data.providers.filter((p) => sectors.includes(p.sector) && (prefectureId == null || p.prefectureId === prefectureId) && (specialtyId == null || p.specialtyIds.includes(specialtyId)));
}

/** Providers located in a prefecture offering a specialty, restricted to `sectors`. */
export function providersIn(
	idx: AtlasIndex,
	prefectureId: number | null,
	specialtyId: number,
	sectors: readonly Sector[]
): Provider[] {
	const all = (prefectureId == null ? idx.provBySpec.get(specialtyId) : idx.provByCell.get(cellKey(prefectureId, specialtyId))) ?? [];
	return all.filter((p) => sectors.includes(p.sector));
}

export interface Nearest {
	km: number | null;
	provider: Provider | null;
	/** true when the answer could not be computed (no located provider in scope). */
	unknown: boolean;
}

/** Seat → nearest provider of the specialty within the chosen sectors, anywhere in Greece. */
export function nearestFor(idx: AtlasIndex, cell: CoverageCell, sectors: readonly Sector[]): Nearest {
	if (isAllSectors(sectors)) {
		return {
			km: cell.nearestKm,
			provider: cell.nearestProviderId ? (idx.provById.get(cell.nearestProviderId) ?? null) : null,
			unknown: cell.nearestKm == null
		};
	}
	if (isPublicOnly(sectors)) {
		return {
			km: cell.nearestPublicKm,
			provider: cell.nearestPublicProviderId ? (idx.provById.get(cell.nearestPublicProviderId) ?? null) : null,
			unknown: cell.nearestPublicKm == null
		};
	}
	const pref = idx.prefById.get(cell.prefectureId);
	if (!pref) return { km: null, provider: null, unknown: true };
	let best: Provider | null = null;
	let bestKm = Infinity;
	for (const p of idx.provBySpec.get(cell.specialtyId) ?? []) {
		if (!sectors.includes(p.sector) || p.lat == null || p.lon == null) continue;
		const km = haversineKm(pref.seat.lat, pref.seat.lon, p.lat, p.lon);
		if (km < bestKm) {
			bestKm = km;
			best = p;
		}
	}
	if (!best) return { km: null, provider: null, unknown: true };
	return { km: Math.round(bestKm * 10) / 10, provider: best, unknown: false };
}

/** For a prefecture without the specialty: the next `n` located sites in `sectors`, nearest to its
 *  seat first (in a straight line), leaving out `skipId` (already shown as «Πλησιέστερο»). */
export function nearbySites(idx: AtlasIndex, prefectureId: number, specialtyId: number, sectors: readonly Sector[], skipId: string | null, n = 3): { provider: Provider; km: number }[] {
	const pref = idx.prefById.get(prefectureId);
	if (!pref) return [];
	return (idx.provBySpec.get(specialtyId) ?? [])
		.filter((p) => p.id !== skipId && sectors.includes(p.sector) && p.lat != null && p.lon != null)
		.map((p) => ({ provider: p, km: Math.round(haversineKm(pref.seat.lat, pref.seat.lon, p.lat!, p.lon!) * 10) / 10 }))
		.sort((a, b) => a.km - b.km || a.provider.id.localeCompare(b.provider.id))
		.slice(0, n);
}

/** Soonest first-free date among the prefecture's public providers of the specialty in `sectors`. */
/** Display name. The public data names public units only; a private or ΕΟΠΥΥ doctor
 *  arrives without a name and is shown by what they are. */
export function providerName(p: Pick<Provider, 'sector' | 'name'>): string {
	// Privacy: private and ΕΟΠΥΥ doctors are never named, whatever the data carries.
	if (p.sector === 'eopyy') return 'Ιατρός συμβεβλημένος με τον ΕΟΠΥΥ';
	if (p.sector === 'private') return 'Ιδιώτης ιατρός';
	return p.name ? titleCase(p.name) : 'Δημόσια μονάδα';
}

/** What changed for the current prefecture / specialty / sectors in the latest comparable
 *  interval; null for the national view (the change chart covers it) or without one.
 *  `partial`: the scan lists fewer items than it counts (it itemises public units only). */
export function selectionChanges(report: AtlasReport, selection: Selection): { from: string; to: string; added: ChangeItem[]; removed: ChangeItem[]; partial: boolean } | null {
	const { prefectureId, specialtyId, sectors } = selection;
	if (prefectureId == null && specialtyId == null) return null;
	const delta = [...(report.history ?? [])].reverse().find((d) => d.comparable);
	if (!delta) return null;
	const keep = (x: ChangeItem) => sectors.includes(x.sector) && (prefectureId == null || x.prefectureId === prefectureId) && (specialtyId == null || x.specialtyId === specialtyId);
	return {
		from: delta.from,
		to: delta.to,
		added: delta.addedItems.filter(keep),
		removed: delta.removedItems.filter(keep),
		partial: delta.addedItems.length < delta.added || delta.removedItems.length < delta.removed
	};
}

/** A provider's first free date for one specialty (availability differs per specialty). */
export function providerDate(p: Provider, specialtyId: number): string | null {
	return p.firstDates?.[String(specialtyId)] ?? null;
}

export function earliestFor(idx: AtlasIndex, cell: CoverageCell, sectors: readonly Sector[]): string | null {
	let best: string | null = null;
	for (const p of providersIn(idx, cell.prefectureId, cell.specialtyId, sectors)) {
		const d = providerDate(p, cell.specialtyId);
		if (d && (best == null || d < best)) best = d;
	}
	return best;
}

// ---------- rows ----------

/** One line of a coverage list; the same shape in every mode so the list has one template. */
export interface Row {
	key: string;
	name: string;
	/** Secondary text: seat for a prefecture, nothing for a specialty. */
	sub: string | null;
	counts: SectorCounts;
	count: number;
	per100k: number | null;
	earliestDate: string | null;
	/** Seat → nearest provider (km); null with `nearestUnknown` when it could not be computed. */
	nearestKm: number | null;
	nearestUnknown: boolean;
	/** nearestKm > distanceFlagKm (a screening flag, not a clinical standard). */
	flagged: boolean;
	/** National rows only: prefectures with ≥1 provider / seats beyond the threshold. */
	prefsWith: number | null;
	prefsFlagged: number | null;
}

function emptyCounts(): SectorCounts {
	return { esy: 0, pfy: 0, eopyy: 0, private: 0 };
}

function cellRow(
	data: AtlasData,
	idx: AtlasIndex,
	cell: CoverageCell,
	sectors: readonly Sector[],
	name: string,
	sub: string | null
): Row {
	const pref = idx.prefById.get(cell.prefectureId);
	const count = sumCounts(cell.counts, sectors);
	// Seat → nearest located provider in the chosen sectors (inside or outside the prefecture).
	const km = nearestFor(idx, cell, sectors).km;
	return {
		key: cellKey(cell.prefectureId, cell.specialtyId),
		name,
		sub,
		counts: cell.counts,
		count,
		per100k: pref && pref.population > 0 ? (count / pref.population) * 100_000 : null,
		earliestDate: earliestFor(idx, cell, sectors),
		nearestKm: km,
		nearestUnknown: km == null,
		flagged: km != null && km > data.distanceFlagKm,
		prefsWith: null,
		prefsFlagged: null
	};
}

/** National row for one specialty: sums over all prefectures. */
function nationalRow(data: AtlasData, idx: AtlasIndex, spec: Specialty, sectors: readonly Sector[]): Row {
	const counts = emptyCounts();
	let count = 0;
	let prefsWith = 0;
	let prefsFlagged = 0;
	let earliest: string | null = null;
	let farthest: number | null = null;
	let unknown = 0;
	for (const pref of data.prefectures) {
		const cell = idx.cellByKey.get(cellKey(pref.id, spec.id));
		if (!cell) {
			unknown++;
			continue;
		}
		for (const s of sectors) counts[s] += cell.counts[s] ?? 0;
		const n = sumCounts(cell.counts, sectors);
		count += n;
		if (n > 0) prefsWith++;
		// Every prefecture whose seat is beyond the flag counts, also ones with a provider
		// somewhere in the νομός but far from its seat (the place rows flag those too).
		const near = nearestFor(idx, cell, sectors);
		if (near) {
			if (near.unknown) unknown++;
			else if (near.km != null) {
				if (near.km > data.distanceFlagKm) prefsFlagged++;
				if (farthest == null || near.km > farthest) farthest = near.km;
			}
		}
		const e = earliestFor(idx, cell, sectors);
		if (e && (earliest == null || e < earliest)) earliest = e;
	}
	return {
		key: cellKey(null, spec.id),
		name: titleCase(spec.name),
		sub: null,
		counts,
		count,
		per100k: idx.population > 0 ? (count / idx.population) * 100_000 : null,
		earliestDate: earliest,
		nearestKm: farthest,
		nearestUnknown: farthest == null && count === 0 && unknown > 0,
		flagged: prefsFlagged > 0,
		prefsWith,
		prefsFlagged
	};
}

/** Rows for the current selection: specialties (place mode) or prefectures (specialty mode). */
/** One prefecture × specialty row, as the place-mode list builds it; null when there is no such cell. */
export function cellRowFor(data: AtlasData, idx: AtlasIndex, prefectureId: number, specialtyId: number, sectors: readonly Sector[]): Row | null {
	const cell = idx.cellByKey.get(cellKey(prefectureId, specialtyId));
	const spec = idx.specById.get(specialtyId);
	return cell && spec ? cellRow(data, idx, cell, sectors, titleCase(spec.name), null) : null;
}

export function deriveRows(data: AtlasData, idx: AtlasIndex, selection: Selection): Row[] {
	const sectors = selection.sectors;
	if (selection.mode === 'specialty') {
		if (selection.specialtyId == null) return [];
		const rows: Row[] = [];
		for (const pref of data.prefectures) {
			const cell = idx.cellByKey.get(cellKey(pref.id, selection.specialtyId));
			if (!cell) continue;
			rows.push(cellRow(data, idx, cell, sectors, pref.name, pref.seat.label));
		}
		return rows;
	}
	if (selection.prefectureId == null) {
		return data.specialties.map((s) => nationalRow(data, idx, s, sectors));
	}
	const rows: Row[] = [];
	for (const spec of data.specialties) {
		const cell = idx.cellByKey.get(cellKey(selection.prefectureId, spec.id));
		if (!cell) continue;
		rows.push(cellRow(data, idx, cell, sectors, titleCase(spec.name), null));
	}
	return rows;
}

/**
 * Sort rows by a metric. Nulls always last. count/per100k: most first. nearestKm: farthest
 * first (the gaps are the story). earliestDate: soonest first. National rows sort nearestKm
 * by flagged prefectures, then farthest seat.
 */
export function sortRows(rows: Row[], metric: Metric): Row[] {
	const cmpNum = (a: number | null, b: number | null, desc: boolean) => {
		if (a == null && b == null) return 0;
		if (a == null) return 1;
		if (b == null) return -1;
		return desc ? b - a : a - b;
	};
	const byName = (a: Row, b: Row) => a.name.localeCompare(b.name, 'el');
	return [...rows].sort((a, b) => {
		let r = 0;
		switch (metric) {
			case 'count':
				r = cmpNum(a.count, b.count, true);
				break;
			case 'per100k':
				r = cmpNum(a.per100k, b.per100k, true);
				break;
			case 'nearestKm':
				r = cmpNum(a.prefsFlagged, b.prefsFlagged, true) || cmpNum(a.nearestKm, b.nearestKm, true);
				break;
			case 'earliestDate':
				if (a.earliestDate == null && b.earliestDate == null) r = 0;
				else if (a.earliestDate == null) r = 1;
				else if (b.earliestDate == null) r = -1;
				else r = a.earliestDate < b.earliestDate ? -1 : a.earliestDate > b.earliestDate ? 1 : 0;
				break;
		}
		return r || byName(a, b);
	});
}

/** The metric value of a row as a number for scales (dates → days from the scan). */
export function metricValue(row: Row, metric: Metric, scanAt: string): number | null {
	switch (metric) {
		case 'count':
			return row.count;
		case 'per100k':
			return row.per100k;
		case 'nearestKm':
			return row.nearestKm;
		case 'earliestDate':
			return daysFromScan(row.earliestDate, scanAt);
	}
}

/** «Ν. Έβρου» / «όλη η Ελλάδα». */
export function prefLabel(pref: Prefecture | null | undefined): string {
	return pref ? `Ν. ${pref.genitive}` : 'όλη η Ελλάδα';
}

/** Greek plural helper: «1 ειδικότητα» / «3 ειδικότητες». */
export function plural(n: number, one: string, many: string): string {
	return `${fmtInt(n)} ${n === 1 ? one : many}`;
}

// ---------- weekly layer: rate classes, projection, pin reasons, CSV ----------

/**
 * Fixed display intervals for sites per 100 000 residents: 0 · >0–1 · >1–2 · >2–4 · >4.
 * They are display intervals, not standards, and stay the same across specialties and weeks
 * so two maps can be compared by eye.
 */
export const RATE_BREAKS = [1, 2, 4] as const;
export type RateClass = 0 | 1 | 2 | 3 | 4;
export const RATE_CLASS_LABEL: Record<RateClass, string> = {
	0: '0',
	1: '>0–1',
	2: '>1–2',
	3: '>2–4',
	4: '>4'
};

/** Class of a rate; null = unknown (no cell or no population). */
export function rateClass(rate: number | null): RateClass | null {
	if (rate == null || !Number.isFinite(rate)) return null;
	if (rate <= 0) return 0;
	if (rate <= RATE_BREAKS[0]) return 1;
	if (rate <= RATE_BREAKS[1]) return 2;
	if (rate <= RATE_BREAKS[2]) return 3;
	return 4;
}

/** «ΕΣΥ + ΠΦΥ», or «όλοι οι φορείς» when all four are on. */
export function sectorsLabel(sectors: readonly Sector[]): string {
	if (isAllSectors(sectors)) return 'όλοι οι φορείς';
	return orderSectors(sectors)
		.map((s) => SECTOR_SHORT[s])
		.join(' + ');
}

/** «όλη την Ελλάδα · Παιδίατρος · ΕΣΥ + ΠΦΥ»: what the page shows, in one plain line. */
export function selectionLabel(idx: AtlasIndex, selection: Selection): string {
	const pref = selection.prefectureId == null ? null : idx.prefById.get(selection.prefectureId);
	const spec = selection.specialtyId == null ? null : idx.specById.get(selection.specialtyId);
	return [
		pref ? `Ν. ${pref.genitive}` : 'όλη την Ελλάδα',
		spec ? titleCase(spec.name) : 'όλες οι ειδικότητες',
		sectorsLabel(selection.sectors)
	].join(' · ');
}

/** true when something other than the default (all Greece, all specialties, all sectors) is chosen. */
export function isDefaultSelection(selection: Selection): boolean {
	return selection.prefectureId == null && selection.specialtyId == null && isAllSectors(selection.sectors);
}

/** Specialties with at least one site in `sectors`, per prefecture id. */
export function specialtiesCovered(data: AtlasData, sectors: readonly Sector[]): Map<number, number> {
	const m = new Map<number, number>();
	for (const p of data.prefectures) m.set(p.id, 0);
	for (const c of data.cells) {
		if (sumCounts(c.counts, sectors) > 0) m.set(c.prefectureId, (m.get(c.prefectureId) ?? 0) + 1);
	}
	return m;
}

/**
 * Fixed display classes for «specialties with a site» per prefecture: 0–5 · 6–10 · 11–20 ·
 * 21–30 · 31+. Fixed on purpose, like RATE_BREAKS, so two weeks' maps compare by eye.
 */
export const COUNT_BREAKS = [5, 10, 20, 30] as const;
export type CountClass = 0 | 1 | 2 | 3 | 4;
export const COUNT_CLASS_LABEL: Record<CountClass, string> = {
	0: '0 έως 5',
	1: '6 έως 10',
	2: '11 έως 20',
	3: '21 έως 30',
	4: '31 και πάνω'
};

export function countClass(n: number | null): CountClass | null {
	if (n == null || !Number.isFinite(n)) return null;
	if (n <= COUNT_BREAKS[0]) return 0;
	if (n <= COUNT_BREAKS[1]) return 1;
	if (n <= COUNT_BREAKS[2]) return 2;
	if (n <= COUNT_BREAKS[3]) return 3;
	return 4;
}

/** Equirectangular projection centred on Greece: x grows east, y grows south (SVG). */
const COS_LAT = Math.cos((38.5 * Math.PI) / 180);
export function projectLonLat(lon: number, lat: number): [number, number] {
	return [lon * COS_LAT, -lat];
}

export interface Ring {
	/** Projected points. */
	pts: [number, number][];
	/** Shoelace area in projected units (absolute). */
	area: number;
}

/** Project every ring of a Polygon / MultiPolygon; the first ring of each polygon is its outer ring. */
export function projectRings(geometry: PrefectureBoundaries['features'][number]['geometry']): Ring[][] {
	const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
	return polys.map((poly) =>
		poly.map((ring) => {
			const pts = ring.map(([lon, lat]) => projectLonLat(lon, lat));
			let a = 0;
			for (let i = 0; i < pts.length; i++) {
				const [x1, y1] = pts[i];
				const [x2, y2] = pts[(i + 1) % pts.length];
				a += x1 * y2 - x2 * y1;
			}
			return { pts, area: Math.abs(a) / 2 };
		})
	);
}

export interface Box {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
}

export function boxOf(points: readonly [number, number][], init?: Box): Box {
	const b: Box = init ? { ...init } : { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
	for (const [x, y] of points) {
		if (x < b.x0) b.x0 = x;
		if (y < b.y0) b.y0 = y;
		if (x > b.x1) b.x1 = x;
		if (y > b.y1) b.y1 = y;
	}
	return b;
}

/** SVG path data for a set of rings (M … Z per ring), with `digits` decimals. */
export function ringsPath(polys: Ring[][], digits = 2): string {
	const f = (n: number) => n.toFixed(digits);
	let d = '';
	for (const poly of polys) {
		for (const ring of poly) {
			if (ring.pts.length === 0) continue;
			d += `M${f(ring.pts[0][0])},${f(ring.pts[0][1])}`;
			for (let i = 1; i < ring.pts.length; i++) d += `L${f(ring.pts[i][0])},${f(ring.pts[i][1])}`;
			d += 'Z';
		}
	}
	return d;
}

/** Why a Ministry pin is wrong, in words. */
export const PIN_REASON_TEXT: Record<PinReason, string> = {
	zero: 'χωρίς συντεταγμένες, εμφανίζεται στον Κόλπο της Γουινέας',
	abroad: 'εκτός Ελλάδας',
	wrong_city: 'σε άλλη πόλη'
};

export const PIN_STATUS_TEXT: Record<PinIssue['status'], string> = {
	open: 'ανοιχτό',
	fixed: 'διορθώθηκε',
	unverified: 'χωρίς επαλήθευση'
};

/** Whole days between two ISO dates (b − a); null when either is missing. */
export function daysBetween(a: string | null | undefined, b: string | null | undefined): number | null {
	const da = parseDay(a);
	const db = parseDay(b);
	if (!da || !db) return null;
	return Math.round((db.getTime() - da.getTime()) / DAY);
}

/** «12 Σεπ» (no weekday), for axes and timelines. */
export function fmtDayShort(iso: string | null): string {
	const d = parseDay(iso);
	if (!d) return EMPTY;
	return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export type CsvValue = string | number | null | undefined;

/** RFC 4180 CSV with a UTF-8 BOM so Excel opens Greek correctly; numbers use a dot. */
export function toCsv(rows: readonly (readonly CsvValue[])[]): string {
	const cell = (v: CsvValue) => {
		if (v == null) return '';
		const s = typeof v === 'number' ? String(v) : v;
		return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
	};
	return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

// ---------- waits: distribution of days to the first free appointment ----------

export interface WaitStats {
	n: number;
	min: number;
	max: number;
	q1: number;
	median: number;
	q3: number;
	mean: number;
	/** Whisker ends: the farthest values within 1.5 × IQR of the box (Tukey). */
	lo: number;
	hi: number;
	/** Values beyond the whiskers: the rare, exceptional waits. */
	outliers: number[];
}

function quantile(sorted: number[], q: number): number {
	const pos = (sorted.length - 1) * q;
	const i = Math.floor(pos);
	const f = pos - i;
	return i + 1 < sorted.length ? sorted[i] + f * (sorted[i + 1] - sorted[i]) : sorted[i];
}

/** Box-plot summary of waits in days; null when there is no value. */
export function waitStats(values: readonly number[]): WaitStats | null {
	if (values.length === 0) return null;
	const v = [...values].sort((a, b) => a - b);
	const q1 = quantile(v, 0.25);
	const q3 = quantile(v, 0.75);
	const fence = 1.5 * (q3 - q1);
	const inside = v.filter((x) => x >= q1 - fence && x <= q3 + fence);
	return {
		n: v.length,
		min: v[0],
		max: v[v.length - 1],
		q1,
		median: quantile(v, 0.5),
		q3,
		mean: v.reduce((s, x) => s + x, 0) / v.length,
		lo: inside[0],
		hi: inside[inside.length - 1],
		outliers: v.filter((x) => x < q1 - fence || x > q3 + fence)
	};
}

export interface WaitRow {
	key: string;
	name: string;
	/** Sites in scope, with or without a date. */
	sites: number;
	/** The same sites by sector. */
	counts: Record<Sector, number>;
	/** Sorted day offsets used to calculate `stats`, including duplicate samples. */
	values: number[];
	stats: WaitStats;
}

/**
 * One row per specialty (Greece or a chosen prefecture) or per prefecture (a chosen
 * specialty), or the single chosen cell; every site in the chosen sectors with a first
 * free date is one value, sorted by `order` in `dir`.
 */
/** The measure the wait rows sort by: the mean wait or the first appointment (fewest days). */
export type WaitOrder = 'mean' | 'first';
/** desc: most days first (the default), asc: fewest days first. */
export type SortDir = 'asc' | 'desc';
export function waitRows(data: AtlasData, idx: AtlasIndex, selection: Selection, order: WaitOrder = 'mean', dir: SortDir = 'desc'): WaitRow[] {
	const { prefectureId, specialtyId, sectors } = selection;
	const pairs: { prefectureId: number | null; specialtyId: number; name: string }[] =
		specialtyId != null && prefectureId == null
			? data.prefectures.map((p) => ({ prefectureId: p.id, specialtyId, name: p.name }))
			: data.specialties
					.filter((s) => specialtyId == null || s.id === specialtyId)
					.map((s) => ({ prefectureId, specialtyId: s.id, name: s.name }));
	const rows: WaitRow[] = [];
	for (const p of pairs) {
		const sites = providersIn(idx, p.prefectureId, p.specialtyId, sectors);
		const days = sites
			.map((x) => daysFromScan(providerDate(x, p.specialtyId), data.scan.at))
			.filter((d): d is number => d != null && d >= 0);
		const values = days.sort((a, b) => a - b);
		const stats = waitStats(values);
		const counts = Object.fromEntries(SECTORS.map((s) => [s, sites.filter((x) => x.sector === s).length])) as Record<Sector, number>;
		if (stats) rows.push({ key: cellKey(p.prefectureId, p.specialtyId), name: p.name, sites: sites.length, counts, values, stats });
	}
	const sign = dir === 'asc' ? 1 : -1;
	const cmp = order === 'first' ? (a: WaitRow, b: WaitRow) => a.stats.min - b.stats.min || a.stats.mean - b.stats.mean : (a: WaitRow, b: WaitRow) => a.stats.mean - b.stats.mean || a.stats.min - b.stats.min;
	return rows.sort((a, b) => sign * cmp(a, b) || a.name.localeCompare(b.name, 'el'));
}

// ---- readable text on a mixed tone (the matrix cells) ----
const srgbToLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
const hexRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
function toOklab([r, g, b]: number[]) {
	const [lr, lg, lb] = [r, g, b].map(srgbToLinear);
	const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
	const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
	const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
	return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromOklab([L, a, b]: number[]) {
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
	return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
		.map((v) => Math.min(1, Math.max(0, linearToSrgb(v))));
}
const luminance = (rgb: number[]) => rgb.map(srgbToLinear).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
export const contrast = (a: number[], b: number[]) => {
	const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
	return (x + 0.05) / (y + 0.05);
};
/** The same colour CSS draws for `color-mix(in oklab, from, to t)`, as sRGB 0..1. */
export function mixOklab(from: string, to: string, t: number): number[] {
	const [a, b] = [toOklab(hexRgb(from)), toOklab(hexRgb(to))];
	return fromOklab(a.map((v, i) => v + (b[i] - v) * t));
}
/** Text colour for a cell of that background: white, else the ink, else black (always ≥ 4.5:1). */
export function readableText(bg: number[], ink = '#152c3b'): string {
	// 4.6, not 4.5: the browser rounds the mixed colour to whole RGB steps.
	if (contrast(bg, [1, 1, 1]) >= 4.6) return '#fff';
	if (contrast(bg, hexRgb(ink)) >= 4.6) return ink;
	return '#000000';
}
