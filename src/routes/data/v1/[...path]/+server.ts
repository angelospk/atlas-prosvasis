import { readFileSync } from 'node:fs';
import { error, type RequestEvent } from '@sveltejs/kit';
import type { AtlasReport } from '$lib/atlas/types';
import { catalog, datasetCsv, datasetJson, datasetPaths, parseDatasetPath } from '$lib/atlas/datasets';

// The open-data files: one static file per table, per format, and per specialty / prefecture.
// Everything is prerendered from the same atlas.json as the page, so the files never drift
// from what the map shows. A static host serves them; no server is needed.
export const prerender = true;

/** One entry per file, listed from the atlas itself so no table is ever forgotten. */
export const entries = () =>
	datasetPaths(JSON.parse(readFileSync('static/atlas.json', 'utf8')) as AtlasReport).map((path) => ({ path }));

// Prerendering calls GET once per file; read (and parse) the atlas once.
let atlas: AtlasReport | null = null;

async function report(fetch: RequestEvent['fetch']): Promise<AtlasReport> {
	if (!atlas) atlas = (await fetch('/atlas.json').then((r) => r.json())) as AtlasReport;
	return atlas;
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const CSV_HEADERS = { 'content-type': 'text/csv; charset=utf-8' };

export async function GET({ params, fetch }: RequestEvent) {
	const data = await report(fetch);

	if (params.path === 'index.json') return new Response(JSON.stringify(catalog(data)), { headers: JSON_HEADERS });

	const parsed = parseDatasetPath(params.path ?? '');
	if (!parsed) error(404, 'Δεν υπάρχει τέτοιο αρχείο.');

	if (parsed.format === 'csv') {
		return new Response(datasetCsv(data, parsed.id, parsed.filter), { headers: CSV_HEADERS });
	}
	return new Response(datasetJson(data, parsed.id, parsed.filter), { headers: JSON_HEADERS });
}
