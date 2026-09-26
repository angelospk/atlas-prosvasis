import type { AtlasReport, PrefectureBoundaries } from '$lib/atlas/types';

// The data is a static file next to the page, rebuilt weekly by the scanner and committed
// here; at build time SvelteKit reads it from static/, so the page ships prerendered.
export const load = async ({ fetch }) => {
	const [atlas, boundaries] = await Promise.all([
		fetch('/atlas.json').then((r) => (r.ok ? (r.json() as Promise<AtlasReport>) : null)),
		fetch('/prefectures.geojson').then((r) => r.json() as Promise<PrefectureBoundaries>)
	]);
	return { atlas, boundaries };
};
