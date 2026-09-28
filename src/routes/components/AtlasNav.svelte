<script lang="ts">
	import { onMount } from 'svelte';
	import type { AtlasData, Selection } from '$lib/atlas/types';
	import { SECTION_IDS, type Section } from './navigation';
	import AtlasMark from './AtlasMark.svelte';
	import SelectionBar from './SelectionBar.svelte';
	let {
		data,
		selection,
		onChange,
		onReset,
		updating = false,
		activeSection,
		onNavigate,
		onHeightChange = (_height: number) => {}
	}: {
		data: AtlasData;
		selection: Selection;
		onChange: (s: Selection) => void;
		onReset: () => void;
		updating?: boolean;
		activeSection: Section;
		onNavigate: (section: Section) => void;
		onHeightChange?: (height: number) => void;
	} = $props();
	let element: HTMLElement;
	const links: { section: Section; label: string }[] = [{section:'map',label:'Χάρτης'},{section:'list',label:'Λίστα'},{section:'waits',label:'Αναμονή'},{section:'details',label:'Αναλυτικά'}];
	onMount(() => {
		const publish = () => { const height = element.offsetHeight; document.documentElement.style.setProperty('--atlas-bar-height', `${height}px`); onHeightChange(height); };
		publish();
		const observer = new ResizeObserver(publish); observer.observe(element);
		return () => { observer.disconnect(); document.documentElement.style.removeProperty('--atlas-bar-height'); };
	});
</script>
<header class="nav-shell" bind:this={element}>
	<div class="inner">
		<a class="brand" href="#atlas-map" aria-label="Άτλας πρόσβασης: στον χάρτη" onclick={(e) => { e.preventDefault(); onNavigate('map'); }}><AtlasMark size={32} /></a>
		<div class="pick"><SelectionBar {data} {selection} {onChange} {onReset} /></div>
		<div class="tail">
			<nav aria-label="Ενότητες">{#each links as item (item.section)}<a href={`#${SECTION_IDS[item.section]}`} aria-current={activeSection === item.section ? 'location' : undefined} onclick={(e) => { e.preventDefault(); onNavigate(item.section); }}>{item.label}</a>{/each}</nav>
			<span class="status" role="status" aria-live="polite">{#if updating}<span class="spinner" aria-hidden="true"></span><span class="sr-only">Ενημέρωση…</span>{/if}</span>
		</div>
	</div>
</header>
<style>
	.nav-shell { position:sticky; top:0; z-index:50; background:var(--accent-d); color:white; border-bottom:1px solid #ffffff26; }
	.inner { max-width:1360px; margin:auto; padding:0 clamp(1rem,4vw,2.5rem); display:flex; align-items:center; gap:.9rem; min-height:56px; }
	.brand { display:flex; align-items:center; flex:none; border-radius:8px; }
	.pick { min-width:0; }
	.tail { display:flex; align-items:center; gap:.6rem; margin-left:auto; min-width:0; }
	nav { display:flex; gap:1.3rem; } nav a { display:flex; align-items:center; min-height:56px; border-bottom:3px solid transparent; padding-top:3px; font-size:.88rem; color:#d4e4ee; white-space:nowrap; }
	nav a[aria-current] { color:white; border-bottom-color:#f2c56e; } a:focus-visible { outline:2px solid #f2c56e; outline-offset:2px; }
	.status { display:inline-flex; width:14px; }
	.spinner { width:.75rem; height:.75rem; border:1.5px solid #ffffff59; border-top-color:#f2c56e; border-radius:50%; animation:atlas-spin .8s linear infinite; }
	@keyframes atlas-spin { to { transform:rotate(360deg); } }
	.sr-only { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
	@media (max-width:899px) {
		/* Row 1: the pickers and reset, full width. Row 2: mark and sections. */
		.inner { display:grid; grid-template-columns:auto minmax(0,1fr); grid-template-areas:'pick pick' 'brand tail'; gap:.1rem .7rem; padding-top:.5rem; min-height:0; }
		.pick { grid-area:pick; display:flex; } .brand { grid-area:brand; } .tail { grid-area:tail; margin-left:0; justify-content:space-between; }
		nav { gap:clamp(.55rem,3vw,1.2rem); min-width:0; overflow-x:auto; scrollbar-width:none; } nav a { min-height:44px; font-size:clamp(.76rem,3.4vw,.84rem); }
		.brand :global(svg) { width:26px; height:26px; }
	}
	@media (max-width:360px) { .inner { padding-inline:.6rem; column-gap:.5rem; } nav { gap:.4rem; } nav a { font-size:.72rem; } .tail { gap:.3rem; } }
</style>
