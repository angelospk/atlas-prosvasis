// Candidate headlines for «Τα δεδομένα έδειξαν ότι…», computed from each week's data so the
// numbers stay current. Each has a stable id; FEATURED picks which ones the page shows, in order.
// All about public care (ΕΣΥ + ΠΦΥ) unless the text says otherwise. Pure, no DOM.
import type { AtlasData, Sector, Selection } from '$lib/atlas/types';
import { SECTORS } from '$lib/atlas/types';
import type { MapMetric } from '$lib/atlas/url';
import { buildIndex, cellKey, daysFromScan, fmtInt, fmtStat, plural, providerDate, providersIn, specialtiesCovered, sumCounts } from './format';

export interface Insight {
	id: string;
	text: string;
	selection: Partial<Selection>;
	/** A prefecture × specialty to open on the point map; null = the list shows the evidence. */
	evidenceKey: string | null;
	/** How the prefecture map colours the selection. */
	metric: MapMetric;
	/** Where «Δες αναλυτικά» goes: the point map (needs evidenceKey), the list, or the sector counts. */
	detail: 'points' | 'list' | 'sites';
}

/** The ids shown on the page, in order. Ids missing from a week's data are skipped. */
export const FEATURED: readonly string[] = ['gap-worst', 'thinnest', 'concentration', 'private-share', 'longest-first', 'slowest-specialty', 'farthest'];
/** How many show before «Περισσότερα ευρήματα»; the rest, then every other gap, fold under it. */
export const FEATURED_VISIBLE = 4;

const PUBLIC: Sector[] = ['esy', 'pfy'];
/** Specialties most people need; the gap findings look only at these. */
const CORE = ['Παιδίατρος', 'Ψυχίατρος', 'Καρδιολόγος', 'Γενική/οικογενειακή ιατρική', 'Παθολόγος', 'Μαιευτήρας-γυναικολόγος', 'Οφθαλμίατρος', 'Ορθοπαιδικός', 'Ωτορινολαρυγγολόγος (ΩΡΛ)', 'Δερματολόγος', 'Πνευμονολόγος', 'Νευρολόγος', 'Ενδοκρινολόγος', 'Ουρολόγος'];

const people = (n: number) => (n >= 1e6 ? `${fmtStat(Math.round(n / 1e5) / 10)} εκατομμύρια` : n >= 1e3 ? `${fmtInt(Math.round(n / 1e3))} χιλιάδες` : fmtInt(n));
/** «για ουρολόγο», «για μαιευτήρα-γυναικολόγο»: the accusative of a doctor's title; fields («ιατρική») stay. */
export function forSpecialty(name: string): string {
	// Only the title is lowercased; an acronym in brackets («(ΩΡΛ)») stays as it is.
	const cut = name.indexOf('(');
	const [head, tail] = cut < 0 ? [name, ''] : [name.slice(0, cut), name.slice(cut)];
	const low = head.toLocaleLowerCase('el');
	if (low.includes('ιατρική')) return low + tail;
	return low.replace(/(\p{L})(ος|ας)(?=$|[\s\-(])/gu, (_, c: string, end: string) => c + (end === 'ος' ? 'ο' : 'α')) + tail;
}
const pct = (a: number, b: number) => `${fmtInt(Math.round((a / b) * 100))}%`;

export function insights(data: AtlasData): Insight[] {
	const idx = buildIndex(data);
	const out: Insight[] = [];
	const total = data.prefectures.length;
	const core = data.specialties.filter((s) => CORE.includes(s.name));
	const pubCount = (prefectureId: number, specialtyId: number) => {
		const c = idx.cellByKey.get(cellKey(prefectureId, specialtyId));
		return c ? sumCounts(c.counts, PUBLIC) : 0;
	};

	// Gaps: per core specialty, the prefectures with no public site and the residents there.
	const gaps = core
		.map((s) => {
			const missing = data.prefectures.filter((p) => pubCount(p.id, s.id) === 0);
			return { s, missing, residents: missing.reduce((n, p) => n + p.population, 0) };
		})
		.filter((g) => g.missing.length > 0)
		.sort((a, b) => b.residents - a.residents || b.missing.length - a.missing.length);
	for (const [i, g] of gaps.entries()) {
		out.push({
			id: i === 0 ? 'gap-worst' : `gap-${g.s.id}`,
			text: `${g.s.name}: σε ${g.missing.length} από τους ${total} νομούς δεν υπάρχει δημόσια δομή με ηλεκτρονικό ραντεβού. Εκεί ζουν ${people(g.residents)} κάτοικοι.`,
			selection: { mode: 'specialty', prefectureId: null, specialtyId: g.s.id, sectors: [...PUBLIC] },
			evidenceKey: null,
			metric: 'coverage',
			detail: 'list'
		});
	}

	// The prefecture where public care books the fewest specialties.
	const covered = specialtiesCovered(data, PUBLIC);
	const thin = [...data.prefectures].sort((a, b) => (covered.get(a.id) ?? 0) - (covered.get(b.id) ?? 0) || b.population - a.population)[0];
	if (thin) {
		out.push({
			id: 'thinnest',
			text: `Ν. ${thin.genitive}: το δημόσιο δίνει ηλεκτρονικό ραντεβού μόνο για ${covered.get(thin.id) ?? 0} από τις ${data.specialties.length} ειδικότητες.`,
			selection: { mode: 'place', prefectureId: thin.id, specialtyId: null, sectors: [...PUBLIC] },
			evidenceKey: null,
			metric: 'coverage',
			detail: 'list'
		});
	}

	// Concentration: the share of public sites in Attica and Thessaloniki against their share of people.
	const big = data.prefectures.filter((p) => p.name === 'Αττική' || p.name === 'Θεσσαλονίκη');
	const pubSites = data.providers.filter((p) => PUBLIC.includes(p.sector) && p.prefectureId != null);
	if (big.length === 2 && pubSites.length > 0) {
		const ids = new Set(big.map((p) => p.id));
		const sites = pubSites.filter((p) => ids.has(p.prefectureId!)).length;
		const residents = big.reduce((n, p) => n + p.population, 0);
		out.push({
			id: 'concentration',
			text: `Αττική και Θεσσαλονίκη έχουν το ${pct(residents, idx.population)} των κατοίκων και το ${pct(sites, pubSites.length)} των δημόσιων δομών με ηλεκτρονικό ραντεβού.`,
			selection: { mode: 'place', prefectureId: null, specialtyId: null, sectors: [...PUBLIC] },
			evidenceKey: null,
			metric: 'coverage',
			detail: 'sites'
		});
	}

	// Private share of every bookable site.
	const sites = data.providers.length;
	const priv = data.providers.filter((p) => p.sector === 'private' || p.sector === 'eopyy').length;
	if (sites > 0) {
		out.push({
			id: 'private-share',
			text: `${pct(priv, sites)} των σημείων με ηλεκτρονικό ραντεβού είναι ιδιώτες ή συμβεβλημένοι με τον ΕΟΠΥΥ· μόνο ${pct(sites - priv, sites)} είναι δημόσιες δομές.`,
			selection: { mode: 'place', prefectureId: null, specialtyId: null, sectors: [...SECTORS] },
			evidenceKey: null,
			metric: 'coverage',
			detail: 'sites'
		});
	}

	// Waits: the first public appointment per prefecture × core specialty.
	const firsts: { prefectureId: number; specialtyId: number; days: number }[] = [];
	for (const s of core) {
		for (const p of data.prefectures) {
			const days = providersIn(idx, p.id, s.id, PUBLIC)
				.map((x) => daysFromScan(providerDate(x, s.id), data.scan.at))
				.filter((d): d is number => d != null && d >= 0);
			if (days.length) firsts.push({ prefectureId: p.id, specialtyId: s.id, days: Math.min(...days) });
		}
	}
	const longest = [...firsts].sort((a, b) => b.days - a.days)[0];
	if (longest) {
		const p = idx.prefById.get(longest.prefectureId)!;
		const s = idx.specById.get(longest.specialtyId)!;
		out.push({
			id: 'longest-first',
			text: `Ν. ${p.genitive}: το πρώτο δημόσιο ραντεβού για ${forSpecialty(s.name)} είναι σε ${plural(longest.days, 'ημέρα', 'ημέρες')} από τη σάρωση.`,
			selection: { mode: 'place', prefectureId: p.id, specialtyId: s.id, sectors: [...PUBLIC] },
			evidenceKey: cellKey(p.id, s.id),
			metric: 'first',
			detail: 'points'
		});
	}
	// The core specialty whose first public appointment is slowest across the country (median).
	const bySpec = core
		.map((s) => {
			const d = firsts.filter((f) => f.specialtyId === s.id).map((f) => f.days).sort((a, b) => a - b);
			return { s, n: d.length, median: d.length ? d[Math.floor((d.length - 1) / 2)] : -1 };
		})
		.filter((x) => x.n >= 5)
		.sort((a, b) => b.median - a.median)[0];
	if (bySpec) {
		out.push({
			id: 'slowest-specialty',
			text: `${bySpec.s.name}: στον μισό από τους ${bySpec.n} νομούς με δημόσια δομή, το πρώτο ραντεβού αργεί ${plural(bySpec.median, 'ημέρα', 'ημέρες')} ή περισσότερο.`,
			selection: { mode: 'specialty', prefectureId: null, specialtyId: bySpec.s.id, sectors: [...PUBLIC] },
			evidenceKey: null,
			metric: 'first',
			detail: 'list'
		});
	}

	// Distance: the farthest nearest public site for a core specialty, from a prefecture seat.
	const far = data.cells
		.filter((c) => core.some((s) => s.id === c.specialtyId) && c.nearestPublicKm != null)
		.sort((a, b) => b.nearestPublicKm! - a.nearestPublicKm!)[0];
	if (far) {
		const p = idx.prefById.get(far.prefectureId)!;
		const s = idx.specById.get(far.specialtyId)!;
		out.push({
			id: 'farthest',
			text: `Ν. ${p.genitive}: η πιο κοντινή δημόσια δομή για ${forSpecialty(s.name)} απέχει ${fmtInt(Math.round(far.nearestPublicKm!))} χλμ από την έδρα (${p.seat.label}), σε ευθεία.`,
			selection: { mode: 'place', prefectureId: p.id, specialtyId: s.id, sectors: [...PUBLIC] },
			evidenceKey: cellKey(p.id, s.id),
			metric: 'coverage',
			detail: 'points'
		});
	}
	return out;
}

/** FEATURED, in order, from this week's candidates, then the remaining gaps. */
export function featured(data: AtlasData, ids: readonly string[] = FEATURED): Insight[] {
	const list = insights(data);
	const all = new Map(list.map((i) => [i.id, i]));
	const chosen = ids.map((id) => all.get(id)).filter((i): i is Insight => i != null);
	return [...chosen, ...list.filter((i) => i.id.startsWith('gap-') && !ids.includes(i.id))];
}
