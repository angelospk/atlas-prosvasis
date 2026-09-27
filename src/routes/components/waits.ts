import type { AtlasData, Provider, Selection } from '$lib/atlas/types';
import { daysFromScan, providerDate, waitStats, type WaitStats } from './format';

export interface WaitSample { provider: Provider; days: number }

/** One site, one observation, over the selected sectors (the same sites waitRows counts).
 * Private and ΕΟΠΥΥ doctors stay anonymous: only their town is shown. Never substitute an
 * unrelated specialty date. */
export function waitSamples(data: AtlasData, selection: Selection): WaitSample[] {
	const out: WaitSample[] = [];
	for (const provider of data.providers) {
		if (!selection.sectors.includes(provider.sector)) continue;
		if (selection.prefectureId != null && provider.prefectureId !== selection.prefectureId) continue;
		if (selection.specialtyId != null && !provider.specialtyIds.includes(selection.specialtyId)) continue;
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
