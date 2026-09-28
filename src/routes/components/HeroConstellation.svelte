<script lang="ts">
	// The header drawing: the prefectures as a faint outline, every seat a point sized by how many
	// specialties public care (ΕΣΥ + ΠΦΥ) offers there. A slow wave of rings crosses west to east;
	// still under reduced motion.
	import type { AtlasData, PrefectureBoundaries } from '$lib/atlas/types';
	import { boxOf, projectLonLat, projectRings, ringsPath, specialtiesCovered, type Box } from './format';

	let { data, boundaries }: { data: AtlasData; boundaries: PrefectureBoundaries } = $props();

	const W = 300;
	const PAD = 10;

	const geo = $derived.by(() => {
		const polys = boundaries.features.flatMap((f) => projectRings(f.geometry));
		let box: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
		for (const poly of polys) for (const ring of poly) box = boxOf(ring.pts, box);
		const k = (W - 2 * PAD) / (box.x1 - box.x0);
		const fit = ([x, y]: [number, number]): [number, number] => [(x - box.x0) * k + PAD, (y - box.y0) * k + PAD];
		const d = ringsPath(polys.map((poly) => poly.map((r) => ({ pts: r.pts.map(fit), area: r.area }))), 0);
		const covered = specialtiesCovered(data, ['esy', 'pfy']);
		const max = Math.max(1, data.specialties.length);
		const points = data.prefectures.map((p) => {
			const [x, y] = fit(projectLonLat(p.seat.lon, p.seat.lat));
			return { id: p.id, x, y, r: 1.8 + ((covered.get(p.id) ?? 0) / max) * 5, delay: ((x - PAD) / (W - 2 * PAD)) * 5 };
		});
		return { d, points, H: Math.round((box.y1 - box.y0) * k + 2 * PAD) };
	});
</script>

<svg class="constellation" viewBox={`0 0 ${W} ${geo.H}`} aria-hidden="true">
	<path class="land" d={geo.d} />
	{#each geo.points as p (p.id)}
		<circle class="ring" cx={p.x} cy={p.y} r={p.r} style:animation-delay={`${p.delay.toFixed(2)}s`} />
		<circle class="dot" cx={p.x} cy={p.y} r={p.r} />
	{/each}
</svg>

<style>
	.constellation { display: block; width: 100%; height: auto; overflow: visible; }
	.land { fill: var(--paper-2); stroke: var(--line-2); stroke-width: 0.6; stroke-linejoin: round; }
	.dot { fill: var(--accent); stroke: var(--card); stroke-width: 1.5; }
	.ring { fill: none; stroke: #f2c56e; stroke-width: 1.5; opacity: 0; transform-box: fill-box; transform-origin: center; animation: ping 6s ease-out infinite; }
	@keyframes ping {
		0% { transform: scale(1); opacity: 0.9; }
		25%, 100% { transform: scale(3.2); opacity: 0; }
	}
	@media (prefers-reduced-motion: reduce) {
		.ring { animation: none; }
	}
</style>
