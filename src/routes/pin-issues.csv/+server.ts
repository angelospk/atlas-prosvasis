import type { AtlasReport } from '$lib/atlas/types';
import { pinIssuesCsv } from '../components/format';

// Public units whose Ministry pin is missing or wrong, as a file anyone can open. Built from
// the same weekly atlas.json as the page, so it never drifts from what the map shows.
export const prerender = true;

export const GET = async ({ fetch }) => {
	const report = (await fetch('/atlas.json').then((r) => r.json())) as AtlasReport;
	return new Response(pinIssuesCsv(report), { headers: { 'content-type': 'text/csv; charset=utf-8' } });
};
