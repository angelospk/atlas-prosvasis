<script lang="ts">
	import { onMount } from 'svelte';
	import { SECTION_IDS, type Section } from './navigation';
	let { activeSection, onNavigate, onHeightChange }: { activeSection: Section; onNavigate: (section: Section) => void; onHeightChange: (height: number) => void } = $props();
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
	<div class="inner"><a class="brand" href="#atlas-map" onclick={(e) => { e.preventDefault(); onNavigate('map'); }}><span class="brand-mark" aria-hidden="true">α</span>Άτλας πρόσβασης</a>
	<nav aria-label="Ενότητες">{#each links as item}<a href={`#${SECTION_IDS[item.section]}`} aria-current={activeSection === item.section ? 'location' : undefined} onclick={(e) => { e.preventDefault(); onNavigate(item.section); }}>{item.label}</a>{/each}</nav></div>
</header>
<style>
	.nav-shell { position:sticky; top:0; z-index:50; background:var(--accent-d); color:white; border-bottom:1px solid #ffffff26; }
	.inner { max-width:1360px; margin:auto; padding:0 clamp(1rem,4vw,2.5rem); display:flex; align-items:center; justify-content:space-between; gap:1rem; min-height:68px; }
	.brand { display:flex; align-items:center; gap:.65rem; font-size:1rem; font-weight:600; white-space:nowrap; }
	.brand-mark { width:31px; height:31px; border:1px solid #9bc2db; display:grid; place-items:center; font-size:1.5rem; font-family:Georgia,serif; border-radius:50% 50% 2px 50%; }
	nav { display:flex; gap:1.5rem; } nav a { display:flex; align-items:center; min-height:68px; border-bottom:3px solid transparent; padding-top:3px; font-size:.88rem; color:#d4e4ee; }
	nav a[aria-current] { color:white; border-bottom-color:#f2c56e; } a:focus-visible { outline-color:#f2c56e; }
	@media(max-width:650px) { .inner { display:grid; gap:0; padding-top:.6rem; } .brand { font-size:.88rem; } .brand-mark { width:24px; height:24px; font-size:1.15rem; } nav { justify-content:space-between; gap:1rem; } nav a { min-height:44px; font-size:.84rem; } }
</style>
