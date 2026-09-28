import type { AtlasData, Provider, Selection } from '$lib/atlas/types';
import { buildIndex, daysFromScan, providerDate, providersIn, waitStats, type WaitStats } from './format';

export interface WaitSample { provider: Provider; days: number }

/** One site, one observation, over the selected sectors (the same sites waitRows counts).
 * Private and ΕΟΠΥΥ doctors stay anonymous: only their town is shown. Never substitute an
 * unrelated specialty date. */
export function waitSamples(data: AtlasData, selection: Selection): WaitSample[] {
	const out: WaitSample[] = [];
	const candidates = selection.specialtyId == null ? data.providers : providersIn(buildIndex(data), selection.prefectureId, selection.specialtyId, selection.sectors);
	for (const provider of candidates) {
		if (!selection.sectors.includes(provider.sector)) continue;
		if (selection.prefectureId != null && provider.prefectureId !== selection.prefectureId) continue;
		const dates = selection.specialtyId == null
			? provider.specialtyIds.map((id) => providerDate(provider, id))
			: [providerDate(provider, selection.specialtyId)];
		const days = dates.map((d) => daysFromScan(d, data.scan.at)).filter((d): d is number => d != null && d >= 0);
		if (days.length) out.push({ provider, days: Math.min(...days) });
	}
	return out.sort((a, b) => a.days - b.days || a.provider.id.localeCompare(b.provider.id));
}

export function prefectureWaits(data: AtlasData, selection: Selection): Map<number, WaitStats> {
	const groups = new Map<number, number[]>();
	for (const { provider, days } of waitSamples(data, { ...selection, prefectureId: null })) {
		if (provider.prefectureId == null) continue;
		const values = groups.get(provider.prefectureId) ?? [];
		values.push(days);
		groups.set(provider.prefectureId, values);
	}
	return new Map([...groups].map(([id, values]) => [id, waitStats(values)!]));
}

export interface WaitPoint { days: number; samples: WaitSample[]; lane: number }
/** Equal dates stay together; dots closer than `gap` (a fraction of the axis, i.e. one tap
 * target) go to separate lanes, so no two targets overlap. */
export function waitPoints(samples: WaitSample[], max: number, gap = 0.13): WaitPoint[] {
	const groups = new Map<number, WaitSample[]>();
	for (const sample of samples) groups.set(sample.days, [...(groups.get(sample.days) ?? []), sample]);
	const ends: number[] = [];
	return [...groups].sort(([a], [b]) => a - b).map(([days, items]) => {
		const pos = days / Math.max(1, max);
		let lane = ends.findIndex((end) => pos - end >= gap);
		if (lane < 0) lane = ends.length;
		ends[lane] = pos;
		return { days, samples: items, lane };
	});
}

/** The five wait classes, shared by the map's wait metrics and the wait chart's dots. */
export const WAIT_FILL = ['#f9e8b4', '#eecb7e', '#d9a04d', '#ad672d', '#743b1e'] as const;
export const WAIT_LABEL = ['έως 7 ημ.', '8 έως 14', '15 έως 30', '31 έως 60', 'πάνω από 60 ημ.'] as const;
export function waitClass(days: number): 0 | 1 | 2 | 3 | 4 {
	return days <= 7 ? 0 : days <= 14 ? 1 : days <= 30 ? 2 : days <= 60 ? 3 : 4;
}

/** A day axis that ends on a round step: weeks for short waits, fortnights, then months. */
export function dayAxis(maxDays: number): { max: number; ticks: number[] } {
	const step = maxDays <= 35 ? 7 : maxDays <= 98 ? 14 : 30;
	const max = Math.max(step * 2, Math.ceil(maxDays / step) * step);
	const ticks: number[] = [];
	for (let t = 0; t <= max; t += step) ticks.push(t);
	return { max, ticks };
}
