import { SECTORS, type AtlasData, type Sector, type Selection } from './types';

export const MAP_METRICS = ['coverage', 'first', 'mean'] as const;
export type MapMetric = typeof MAP_METRICS[number];
export const WIDGETS = ['coverage', 'points', 'waits', 'list', 'summary', 'matrix', 'specialties', 'ranking', 'changes', 'briefing'] as const;
export type Widget = typeof WIDGETS[number];
export const WIDGET_LABELS: Record<Widget, string> = {
	coverage: 'Χάρτης κάλυψης', points: 'Χάρτης σημείων', waits: 'Αναμονή ραντεβού',
	list: 'Λίστα κάλυψης', summary: 'Σύνοψη', matrix: 'Πίνακας σύγκρισης',
	specialties: 'Κάλυψη ειδικοτήτων', ranking: 'Κατάταξη νομών', changes: 'Αλλαγές σαρώσεων', briefing: 'Εβδομαδιαία εικόνα'
};
export const PUBLIC_SITE = 'https://atlas.haroldpoi.dev';
export const PUBLIC_REPO = 'https://github.com/angelospk/atlas-prosvasis';

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('el').replace(/ς/g, 'σ');

export function readAtlasUrl(url: URL, data: AtlasData): { selection: Selection; metric: MapMetric } {
	// Numeric ids are canonical; a name («αιματολόγος», «Σέρρες») is accepted for hand-written links.
	const readId = (key: string, values: { id: number; name: string }[]) => {
		const raw = url.searchParams.get(key)?.trim();
		if (!raw) return null;
		if (/^\d+$/.test(raw)) {
			const id = Number(raw);
			return values.some((v) => v.id === id) ? id : null;
		}
		const wanted = fold(raw);
		return values.find((v) => fold(v.name) === wanted)?.id ?? null;
	};
	const prefectureId = readId('prefecture', data.prefectures);
	const specialtyId = readId('specialty', data.specialties);
	const requested = url.searchParams.get('sectors')?.split(',');
	const sectors = SECTORS.filter((s) => requested?.includes(s));
	const metric = url.searchParams.get('metric');
	return {
		selection: { prefectureId, specialtyId, mode: specialtyId != null && prefectureId == null ? 'specialty' : 'place', sectors: sectors.length ? sectors : [...SECTORS] },
		metric: MAP_METRICS.includes(metric as MapMetric) ? metric as MapMetric : 'coverage'
	};
}

/** Preserve unrelated query parameters; omit defaults and canonicalise sector order. */
export function writeAtlasUrl(url: URL, selection: Selection, metric: MapMetric): URL {
	const next = new URL(url);
	for (const [key, value] of [['prefecture', selection.prefectureId], ['specialty', selection.specialtyId]] as const) {
		if (value == null) next.searchParams.delete(key);
		else next.searchParams.set(key, String(value));
	}
	const sectors: Sector[] = SECTORS.filter((s) => selection.sectors.includes(s));
	if (sectors.length === SECTORS.length || !sectors.length) next.searchParams.delete('sectors');
	else next.searchParams.set('sectors', sectors.join(','));
	if (metric === 'coverage') next.searchParams.delete('metric');
	else next.searchParams.set('metric', metric);
	return next;
}

/** Widgets whose content depends on the specialty, so an embed can offer a specialty picker. */
export const SPECIALTY_WIDGETS: readonly Widget[] = ['coverage', 'points', 'waits', 'list', 'summary', 'ranking'];
/** `?specialty_picker=0` hides the embed's specialty picker; anything else (or nothing) shows it. */
export const PICKER_PARAM = 'specialty_picker';
export const pickerHidden = (url: URL) => url.searchParams.get(PICKER_PARAM) === '0';

/** Widgets whose content depends on the sectors, so an embed can offer sector toggles. */
export const SECTOR_WIDGETS: readonly Widget[] = ['coverage', 'points', 'waits', 'list', 'summary', 'matrix', 'specialties', 'ranking'];
/** `?sector_picker=0` hides the embed's sector toggles; anything else (or nothing) shows them. */
export const SECTOR_PICKER_PARAM = 'sector_picker';
export const sectorPickerHidden = (url: URL) => url.searchParams.get(SECTOR_PICKER_PARAM) === '0';

export function widgetUrl(widget: Widget, selection: Selection, metric: MapMetric, origin = PUBLIC_SITE, specialtyPicker = true, sectorPicker = true): URL {
	const url = writeAtlasUrl(new URL(`/embed/${widget}`, origin), selection, metric);
	if (!specialtyPicker && SPECIALTY_WIDGETS.includes(widget)) url.searchParams.set(PICKER_PARAM, '0');
	if (!sectorPicker && SECTOR_WIDGETS.includes(widget)) url.searchParams.set(SECTOR_PICKER_PARAM, '0');
	return url;
}
