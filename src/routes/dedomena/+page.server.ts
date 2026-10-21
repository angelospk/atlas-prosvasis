import type { AtlasReport } from '$lib/atlas/types';
import { datasetRows } from '$lib/atlas/datasets';

// The same weekly atlas.json as the main page, cut at build to what this page shows: the
// pickers and the units list (the whole atlas would inline ~3 MB into the HTML).
export const load = async ({ fetch }) => {
	const atlas = await fetch('/atlas.json').then((r) => (r.ok ? (r.json() as Promise<AtlasReport>) : null));
	if (!atlas) return { atlas: null };
	const { scan, specialties, prefectures } = atlas;
	return { atlas: { scan, specialties, prefectures, off: datasetRows(atlas, 'no-free-booking') } };
};
export const prerender = true;
