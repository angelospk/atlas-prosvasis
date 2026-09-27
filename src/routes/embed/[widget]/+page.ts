import { error } from '@sveltejs/kit';
import type { AtlasReport, PrefectureBoundaries } from '$lib/atlas/types';
import { WIDGETS, type Widget } from '$lib/atlas/url';

// One prerendered page per widget; the filters arrive as query parameters and are read in the browser.
export const entries = () => WIDGETS.map((widget) => ({ widget }));

export const load = async ({ fetch, params }) => {
	if (!WIDGETS.includes(params.widget as Widget)) error(404, 'Άγνωστο widget');
	const [atlas, boundaries] = await Promise.all([
		fetch('/atlas.json').then((r) => (r.ok ? (r.json() as Promise<AtlasReport>) : null)),
		params.widget === 'coverage' ? fetch('/prefectures.geojson').then((r) => r.json() as Promise<PrefectureBoundaries>) : null
	]);
	return { widget: params.widget as Widget, atlas, boundaries };
};
