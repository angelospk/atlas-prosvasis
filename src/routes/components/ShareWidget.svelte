<script lang="ts">
	import type { Selection } from '$lib/atlas/types';
	import { SECTOR_WIDGETS, SPECIALTY_WIDGETS, widgetUrl, WIDGET_LABELS, type MapMetric, type Widget } from '$lib/atlas/url';
	let { widget, selection, metric = 'coverage' }: { widget: Widget; selection: Selection; metric?: MapMetric } = $props();
	const uid = $props.id();
	let open = $state(false);
	let status = $state('');
	let specialtyPicker = $state(true);
	let sectorPicker = $state(true);
	const url = $derived(widgetUrl(widget, selection, metric, undefined, specialtyPicker, sectorPicker).href);
	const code = $derived(`<iframe src="${url.replaceAll('&', '&amp;')}" title="${WIDGET_LABELS[widget]} · Άτλας πρόσβασης" width="100%" height="800" style="border:0" loading="lazy"></iframe>`);
	async function copy(value: string) { try { await navigator.clipboard.writeText(value); status = 'Αντιγράφηκε'; } catch { status = 'Επίλεξε και αντέγραψε το κείμενο παρακάτω.'; open = true; } }
</script>
<div class="share">
	<button class="toggle" aria-expanded={open} aria-controls={`${uid}-panel`} onclick={() => { open = !open; status = ''; }}><svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><rect x="1.5" y="3" width="17" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M8 8l-2.5 2L8 12M12 8l2.5 2L12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>Σύνδεσμος & ενσωμάτωση</button>
	{#if open}<div class="panel" id={`${uid}-panel`}>
		<a href={url} target="_blank" rel="noopener">Άνοιγμα widget ↗</a>
		{#if SPECIALTY_WIDGETS.includes(widget)}<label class="check"><input type="checkbox" bind:checked={specialtyPicker} />Ο αναγνώστης αλλάζει ειδικότητα</label>{/if}
		{#if SECTOR_WIDGETS.includes(widget)}<label class="check"><input type="checkbox" bind:checked={sectorPicker} />Ο αναγνώστης αλλάζει φορείς</label>{/if}
		<label>Σύνδεσμος<input readonly value={url} onclick={(e) => e.currentTarget.select()} /></label><button onclick={() => copy(url)}>Αντιγραφή συνδέσμου</button>
		<label>Κώδικας ενσωμάτωσης<textarea readonly rows="3" value={code} onclick={(e) => e.currentTarget.select()}></textarea></label><button onclick={() => copy(code)}>Αντιγραφή iframe</button>
		<span role="status">{status}</span>
	</div>{/if}
</div>
<style>
	.share { font-size:.75rem; min-width:0; } button { min-height:44px; border:0; border-bottom:1px solid var(--line-2); background:none; padding:.5rem 0; font-size:inherit; font-weight:500; color:var(--accent); } .toggle { display:inline-flex; align-items:center; gap:.4rem; } .panel { display:grid; gap:.65rem; background:var(--card); padding:1.2rem; border:1px solid var(--line); border-radius:6px; } label { display:grid; gap:.3rem; } .check { display:flex; align-items:center; gap:.5rem; min-height:44px; font-size:.8rem; } .check input { width:18px; height:18px; accent-color:var(--accent); } input:not([type]),textarea { width:100%; min-width:0; padding:.6rem; border:1px solid var(--line-2); border-radius:4px; color:var(--ink); background:var(--paper); font:inherit; } textarea { resize:vertical; } .panel button { justify-self:start; } a { color:var(--accent); text-decoration:underline; }
</style>
