<script lang="ts">
	// Linked map. Leaflet touches `window` at import, so it is loaded in onMount only; the
	// `L` namespace is a type-only import. No choropleth: providers as the four sector marks,
	// prefecture seats as open circles, and for the selected cell one thin dashed line from the
	// seat to its nearest provider with the km on it.
	import { onMount } from 'svelte';
	import type * as Leaflet from 'leaflet';
	import 'leaflet/dist/leaflet.css';
	import 'leaflet.markercluster/dist/MarkerCluster.css';
	import type { AtlasData, Provider, Selection } from '$lib/atlas/types';
	import { SECTORS } from '$lib/atlas/types';
	import { buildIndex, mapFrame, notBookableNow, offeredIds, providerName, cellKey, fmtKm, nearestFor, parseKey, prefLabel, providersIn, SECTOR_SHORT, titleCase } from './format';

	let {
		data,
		selection,
		selectedKey,
		onSelect,
		focusSite = null
	}: {
		data: AtlasData;
		selection: Selection;
		selectedKey: string | null;
		onSelect: (key: string) => void;
		/** A site picked in the list: the map flies to it and rings it. `n` repeats a pick of the same site. */
		focusSite?: { id: string; n: number } | null;
	} = $props();

	const idx = $derived(buildIndex(data));

	// Providers in view: the selected specialty everywhere (specialty mode or national), or
	// everything inside the selected prefecture (narrowed to a specialty when one is chosen).
	const shown = $derived.by((): Provider[] => {
		const { mode, prefectureId, specialtyId, sectors } = selection;
		if (mode === 'specialty') return specialtyId == null ? [] : providersIn(idx, null, specialtyId, sectors);
		if (specialtyId != null) return providersIn(idx, prefectureId, specialtyId, sectors);
		return data.providers.filter((p) => sectors.includes(p.sector) && (prefectureId == null || p.prefectureId === prefectureId));
	});
	const located = $derived(shown.filter((p) => p.lat != null && p.lon != null));
	const missing = $derived(shown.length - located.length);
	const approxCount = $derived(located.filter((p) => p.approx).length);

	// The selected cell's seat → nearest provider line.
	const line = $derived.by(() => {
		const k = selectedKey ? parseKey(selectedKey) : null;
		if (!k || k.prefectureId == null) return null;
		const pref = idx.prefById.get(k.prefectureId);
		const cell = idx.cellByKey.get(selectedKey!);
		if (!pref || !cell) return null;
		const near = nearestFor(idx, cell, selection.sectors);
		if (near.km == null || !near.provider || near.provider.lat == null || near.provider.lon == null) return { pref, near: null };
		return { pref, near };
	});
	const selectedPrefId = $derived(line?.pref.id ?? selection.prefectureId);

	let mapEl: HTMLDivElement;
	let L: typeof Leaflet | null = null;
	let map: Leaflet.Map | null = null;
	let providerLayer: Leaflet.LayerGroup | null = null;
	let seatLayer: Leaflet.LayerGroup | null = null;
	let lineLayer: Leaflet.LayerGroup | null = null;
	let focusLayer: Leaflet.Marker | null = null;
	let lastFrame = '';
	// The overview of the selection and the view it gave; `moved` once the reader leaves it.
	let home: Leaflet.LatLngBounds | null = null;
	let homeView: { center: Leaflet.LatLng; zoom: number } | null = null;
	let moved = $state(false);
	const homeLabel = $derived(selection.mode === 'place' && selection.prefectureId != null ? 'Όλος ο νομός' : 'Όλη η Ελλάδα');
	const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	function iconFor(p: Provider, selected: boolean) {
		return L!.divIcon({
			className: `atlas-pin ${p.sector}${p.approx ? ' approx' : ''}${selected ? ' sel' : ''}`,
			html: '<span></span>',
			iconSize: [12, 12],
			iconAnchor: [6, 6]
		});
	}

	function keyFor(p: Provider): string | null {
		if (p.prefectureId == null) return null;
		const spec = selection.specialtyId != null && offeredIds(p).includes(selection.specialtyId) ? selection.specialtyId : offeredIds(p)[0];
		return spec == null ? null : cellKey(p.prefectureId, spec);
	}

	function drawProviders() {
		if (!L || !map) return;
		if (providerLayer) map.removeLayer(providerLayer);
		const selKey = selectedKey ? parseKey(selectedKey) : null;
		const group = L.markerClusterGroup({
			showCoverageOnHover: false,
			maxClusterRadius: 28,
			spiderfyOnMaxZoom: true,
			iconCreateFunction: (c) =>
				L!.divIcon({ className: 'atlas-cluster', html: `<span>${c.getChildCount()}</span>`, iconSize: [26, 26] })
		});
		for (const p of located) {
			const inSel = !!selKey && p.prefectureId === selKey.prefectureId && offeredIds(p).includes(selKey.specialtyId);
			const m = L.marker([p.lat!, p.lon!], { icon: iconFor(p, inSel), keyboard: false });
			const where = p.prefectureId != null ? prefLabel(idx.prefById.get(p.prefectureId)) : '';
			m.bindTooltip(`${providerName(p)}${where ? ` · ${where}` : ''}${p.approx ? ' · θέση περίπου' : ''}${selection.specialtyId != null && notBookableNow(p, selection.specialtyId) ? ' · χωρίς ανοιχτό πρόγραμμα αυτή την εβδομάδα' : ''}`, {
				direction: 'top',
				offset: [0, -6],
				className: 'atlas-km'
			});
			m.on('click', () => {
				const k = keyFor(p);
				if (k) onSelect(k);
			});
			group.addLayer(m);
		}
		providerLayer = group.addTo(map);
	}

	function drawSeats() {
		if (!L || !map) return;
		if (seatLayer) map.removeLayer(seatLayer);
		const g = L.layerGroup();
		for (const pref of data.prefectures) {
			const sel = pref.id === selectedPrefId;
			const c = L.circleMarker([pref.seat.lat, pref.seat.lon], {
				radius: sel ? 6 : 4,
				color: sel ? '#2f6b5b' : '#5f696c',
				weight: sel ? 2 : 1.2,
				fill: true,
				fillColor: '#fffcf7',
				fillOpacity: sel ? 0.9 : 0.4,
				interactive: true
			});
			c.bindTooltip(`Έδρα ${prefLabel(pref)}: ${pref.seat.label}`, { direction: 'top', offset: [0, -6], className: 'atlas-km' });
			c.on('click', () => {
				if (selection.specialtyId != null) onSelect(cellKey(pref.id, selection.specialtyId));
			});
			g.addLayer(c);
		}
		seatLayer = g.addTo(map);
	}

	function drawLine() {
		if (!L || !map) return;
		if (lineLayer) map.removeLayer(lineLayer);
		lineLayer = null;
		if (!line?.near?.provider) return;
		const { pref, near } = line;
		const p = near.provider!;
		const g = L.layerGroup();
		const a: Leaflet.LatLngTuple = [pref.seat.lat, pref.seat.lon];
		const b: Leaflet.LatLngTuple = [p.lat!, p.lon!];
		const flagged = near.km! > data.distanceFlagKm;
		// The km sit on hover only: a permanent label covered the points underneath, and the
		// list beside the map already states the distance.
		g.addLayer(
			L.polyline([a, b], { color: flagged ? '#a0402e' : '#2f6b5b', weight: 1.5, dashArray: '4 5', opacity: 0.6 }).bindTooltip(
				`${fmtKm(near.km)} σε ευθεία`,
				{ sticky: true, className: 'atlas-km' }
			)
		);
		// The nearest site may lie outside the prefecture's points: mark it with the line.
		if (!located.includes(p)) {
			const where = p.prefectureId != null ? prefLabel(idx.prefById.get(p.prefectureId)) : '';
			g.addLayer(L.marker(b, { icon: iconFor(p, true), keyboard: false }).bindTooltip(`${providerName(p)}${where ? ` · ${where}` : ''} · πλησιέστερο`, { direction: 'top', offset: [0, -6], className: 'atlas-km' }));
		}
		lineLayer = g.addTo(map);
	}

	// Frame the view when what we look at changes (not on sector toggles or a row with sites).
	function frame() {
		if (!L || !map) return;
		const f = mapFrame(idx, selection, located, selectedKey);
		// The overview follows every change (a sector toggle too); the view moves only on a new subject.
		home = f.overview.length ? L.latLngBounds(f.overview).pad(0.12) : null;
		const sig = `${selection.mode}|${selection.prefectureId}|${selection.specialtyId}|${f.focusId ?? ''}`;
		if (sig !== lastFrame) {
			lastFrame = sig;
			const target = f.focus ? L.latLngBounds(f.focus).pad(0.2) : home;
			if (target) map.fitBounds(target, { maxZoom: 11, animate: false });
		}
		measureHome();
	}
	// The view the overview gives at this size, measured without moving the map.
	function measureHome() {
		if (!map) return;
		homeView = home ? { center: home.getCenter(), zoom: Math.min(11, map.getBoundsZoom(home)) } : null;
		if (homeView) checkMoved();
		else moved = false;
	}
	function checkMoved() {
		if (!map || !homeView) return;
		const off = map.latLngToContainerPoint(homeView.center).distanceTo(map.getSize().divideBy(2));
		moved = Math.abs(map.getZoom() - homeView.zoom) >= 0.5 || off > 40;
	}
	function goHome() {
		if (!map || !home) return;
		map.fitBounds(home, { maxZoom: 11, animate: !reduced() });
	}

	// A site picked in the list: fly there and ring it, above any cluster.
	function showFocus() {
		if (!L || !map) return;
		if (focusLayer) map.removeLayer(focusLayer);
		focusLayer = null;
		const p = focusSite ? idx.provById.get(focusSite.id) : null;
		if (!p || p.lat == null || p.lon == null) return;
		const where = p.prefectureId != null ? prefLabel(idx.prefById.get(p.prefectureId)) : '';
		focusLayer = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: `atlas-pin ${p.sector} focus`, html: '<span></span>', iconSize: [16, 16], iconAnchor: [8, 8] }), keyboard: false, zIndexOffset: 1000 })
			.bindTooltip(`${providerName(p)}${where ? ` · ${where}` : ''}${p.approx ? ' · θέση περίπου' : ''}`, { direction: 'top', offset: [0, -9], className: 'atlas-km', permanent: true })
			.addTo(map);
		map.flyTo([p.lat, p.lon], Math.max(map.getZoom(), 13), { animate: !reduced(), duration: 0.6 });
	}

	// Redraw layers when their inputs change; each effect reads only what it needs.
	$effect(() => {
		void located;
		void selectedKey;
		drawProviders();
	});
	$effect(() => {
		void selectedPrefId;
		void selection.specialtyId;
		drawSeats();
	});
	$effect(() => {
		void line;
		drawLine();
	});
	$effect(() => {
		void selection.mode;
		void selection.prefectureId;
		void selection.specialtyId;
		// Read here: frame() returns early until Leaflet has loaded, and would track nothing else.
		void selectedKey;
		void located;
		frame();
	});
	$effect(() => {
		void focusSite;
		showFocus();
	});

	onMount(() => {
		let cleanup = () => {};
		let alive = true;
		(async () => {
			const mod = await import('leaflet');
			await import('leaflet.markercluster');
			if (!alive) return;
			L = mod.default ?? (mod as unknown as typeof Leaflet);
			map = L.map(mapEl, { scrollWheelZoom: false, zoomSnap: 0.5, attributionControl: true });
			map.setView([38.4, 23.8], 6);
			L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
				maxZoom: 18,
				attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
			}).addTo(map);
			drawSeats();
			drawProviders();
			drawLine();
			lastFrame = '';
			map.on('moveend', checkMoved);
			map.on('resize', measureHome);
			frame();
			showFocus();
			setTimeout(() => map?.invalidateSize(), 0);
			cleanup = () => {
				map?.remove();
				map = null;
			};
		})();
		return () => {
			alive = false;
			cleanup();
		};
	});
</script>

<figure class="mapwrap">
	<div class="stage">
		<div class="map" bind:this={mapEl} role="region" aria-label="Χάρτης παρόχων"></div>
		{#if moved}<button type="button" class="home" onclick={goHome}><svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M1 4.5V1h3.5M11 4.5V1H7.5M1 7.5V11h3.5M11 7.5V11H7.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>{homeLabel}</button>{/if}
	</div>
	<figcaption class="legend">
		{#each SECTORS as s (s)}
			<span class="lg" class:dim={!selection.sectors.includes(s)}><span class="smark {s}" aria-hidden="true"></span>{SECTOR_SHORT[s]}</span>
		{/each}
		<span class="lg"><span class="seat" aria-hidden="true"></span>έδρα νομού</span>
		<span class="lg"><span class="smark private approx" aria-hidden="true"></span>θέση περίπου{approxCount > 0 ? ` (${approxCount})` : ''}</span>
		{#if missing > 0}
			<span class="lg muted">{missing} χωρίς θέση, δεν φαίνονται</span>
		{/if}
	</figcaption>
</figure>

<style>
	.mapwrap {
		margin: 0;
		display: grid;
		gap: 0.45rem;
	}
	.stage {
		position: relative;
		min-width: 0;
	}
	/* Above Leaflet's panes (z-index up to 1000 inside .map, which is its own stacking context). */
	.home {
		position: absolute;
		top: 10px;
		right: 10px;
		z-index: 1;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 36px;
		padding: 0 0.75rem;
		border: 1px solid var(--line-2);
		border-radius: var(--r-ctl);
		background: var(--card);
		color: var(--ink);
		font: inherit;
		font-size: 0.82rem;
		font-weight: 600;
		box-shadow: var(--shadow);
		cursor: pointer;
	}
	.home:hover {
		border-color: var(--ink-3);
	}
	.home:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.map {
		height: 520px;
		width: 100%;
		min-width: 0;
		max-width: 100%;
		border: 1px solid var(--line);
		border-radius: 10px;
		overflow: hidden;
		z-index: 0;
		background: var(--paper-2);
	}
	@media (max-width: 899px) {
		.map {
			height: min(60dvh, 420px);
			min-height: 280px;
		}
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 1rem;
		font-size: 0.76rem;
		color: var(--ink-2);
	}
	.lg {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.lg.dim {
		opacity: 0.45;
	}
	.muted {
		color: var(--ink-3);
	}
	.seat {
		display: inline-block;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		border: 1.2px solid var(--ink-3);
		background: var(--card);
	}
	.legend .approx {
		outline: 1.5px dashed var(--ink-3);
		outline-offset: 2px;
		margin-left: 2px;
	}
	:global(.atlas-kmwrap) {
		background: none;
		border: 0;
	}
</style>
