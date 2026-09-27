<script lang="ts">
	import type { Selection } from '$lib/atlas/types';
	import { widgetUrl, WIDGET_LABELS, type MapMetric, type Widget } from '$lib/atlas/url';
	let { widget, selection, metric = 'coverage' }: { widget: Widget; selection: Selection; metric?: MapMetric } = $props();
	let open = $state(false);
	let status = $state('');
	const url = $derived(widgetUrl(widget, selection, metric).href);
	const code = $derived(`<iframe src="${url.replaceAll('&', '&amp;')}" title="${WIDGET_LABELS[widget]} · Άτλας πρόσβασης" width="100%" height="800" style="border:0" loading="lazy"></iframe>`);
	async function copy(value: string) { try { await navigator.clipboard.writeText(value); status = 'Αντιγράφηκε'; } catch { status = 'Επίλεξε και αντέγραψε το κείμενο παρακάτω.'; open = true; } }
</script>
<div class="share">
	<button aria-expanded={open} onclick={() => { open = !open; status = ''; }}>Σύνδεσμος & ενσωμάτωση ↗</button>
	{#if open}<div class="panel"><p>{WIDGET_LABELS[widget]} με τα τρέχοντα φίλτρα, για χρήση σε άλλη σελίδα.</p><a href={url} target="_blank" rel="noopener">Άνοιγμα widget ↗</a><label>Σύνδεσμος<input readonly value={url} onclick={(e) => e.currentTarget.select()} /></label><button onclick={() => copy(url)}>Αντιγραφή συνδέσμου</button><label>Κώδικας ενσωμάτωσης<textarea readonly rows="3" value={code} onclick={(e) => e.currentTarget.select()}></textarea></label><button onclick={() => copy(code)}>Αντιγραφή iframe</button><span role="status">{status}</span></div>{/if}
</div>
<style>
	.share { font-size:.75rem; min-width:0; } button { min-height:44px; border:0; border-bottom:1px solid var(--line-2); background:none; padding:.5rem 0; font-size:inherit; font-weight:500; color:var(--accent); } .panel { display:grid; gap:.65rem; background:var(--card); padding:1.2rem; border:1px solid var(--line); border-radius:6px; } p { margin:0; } label { display:grid; gap:.3rem; } input,textarea { width:100%; min-width:0; padding:.6rem; border:1px solid var(--line-2); border-radius:4px; color:var(--ink); background:var(--paper); font:inherit; } textarea { resize:vertical; } .panel button { justify-self:start; } a { color:var(--accent); text-decoration:underline; }
</style>
