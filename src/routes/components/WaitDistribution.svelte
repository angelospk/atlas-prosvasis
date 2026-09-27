<script lang="ts">
 import type { AtlasData, Selection } from '$lib/atlas/types';
 import { buildIndex, fmtDay, fmtStat, parseKey, plural, providerName, selectionLabel, titleCase, toCsv, waitRows } from './format';
 import { waitPoints, waitSamples, type WaitPoint } from './waits';
 import { downloadText } from './download';
 let { data, selection, onShowOnMap = (_key: string) => {}, onPickSpecialty = (_id: number | null) => {} }: {
  data: AtlasData; selection: Selection; onShowOnMap?: (key: string) => void; onPickSpecialty?: (id: number | null) => void;
 } = $props();
 const uid = $props.id();
 const idx = $derived(buildIndex(data));
 const rows = $derived(waitRows(data, idx, selection));
 let showingAll = $state(false);
 let selected = $state<{ key: string; days: number } | null>(null);
 // Measured in the browser; one 44 px tap target plus a little air, as a share of the axis.
 let plotWidth = $state(0);
 const gap = $derived(plotWidth > 0 ? Math.min(0.5, 48 / plotWidth) : 0.13);
 const axisMax = $derived(Math.max(7, Math.ceil(Math.max(0, ...rows.map((r) => r.stats.max)) / 7) * 7));
 const plotted = $derived(rows.map((r) => {
  const key = parseKey(r.key)!;
  const points = waitPoints(waitSamples(data, { ...selection, ...key }), axisMax, gap);
  return { ...r, points, height: Math.max(1, ...points.map((p) => p.lane + 1)) * 46 + 14 };
 }));
 const shown = $derived(showingAll ? plotted : plotted.slice(0, 12));
 const activeRow = $derived(plotted.find((r) => r.key === selected?.key));
 const activePoint = $derived(activeRow?.points.find((p) => p.days === selected?.days));
 const mapKey = $derived(activeRow?.key ?? (selection.specialtyId != null ? `${selection.prefectureId ?? 0}:${selection.specialtyId}` : null));
 const pct = (days: number) => `${days / axisMax * 100}%`;
 function describe(point: WaitPoint) {
  const cities = [...new Set(point.samples.map((s) => titleCase(s.provider.city) || 'Χωρίς πόλη'))];
  return `${plural(point.days, 'ημέρα', 'ημέρες')} · ${cities.join(', ')} · ${plural(point.samples.length, 'σημείο', 'σημεία')}`;
 }
 function exportCsv() {
  downloadText(`atlas-αναμονή-${data.scan.at.slice(0, 10)}.csv`, toCsv([
   ['Σάρωση', data.scan.at.slice(0, 10), data.scan.source],
   ['Νομός / ειδικότητα', 'Σημεία', 'Με ημερομηνία', 'Πρώτο', 'Μέσος όρος', 'Διάμεσος', 'Μέγιστο'],
   ...rows.map((r) => [r.name, r.sites, r.stats.n, r.stats.min, r.stats.mean, r.stats.median, r.stats.max])
  ]));
 }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') selected = null; }} />

<section id="atlas-waits" class="waits" aria-labelledby={`${uid}-title`}>
 <header class="head">
  <div><span class="section-kicker">Ο χρόνος μέχρι το ραντεβού</span><h2 id={`${uid}-title`}>Πόσες ημέρες περιμένεις;</h2></div>
  <button class="tool" onclick={exportCsv}>Λήψη CSV ↓</button>
 </header>
 <p class="sub">Ημέρες από τη σάρωση της {fmtDay(data.scan.at)} · {selectionLabel(idx, selection)}</p>
 <p class="note">Κάθε τελεία δείχνει σημεία με την ίδια αναμονή. Πέρασε από πάνω ή πάτησέ τη για πόλη και μονάδα.</p>
 <div class="legend"><span><i></i>Ημέρες έως το πρώτο ραντεβού</span><span><i class="diamond"></i>Μέσος όρος</span></div>
 {#if rows.length === 0}
  <p class="empty">Κανένα σημείο με ημερομηνία ραντεβού για αυτή την επιλογή.</p>
 {:else}
  <ol class="list">
   {#each shown as row (row.key)}
    <li class="row" data-key={row.key}>
     <div class="row-heading"><h3>{row.name}</h3><span>{row.stats.n} / {row.sites} με ημερομηνία</span></div>
     <div class="plot" style:height={`${row.height}px`} bind:clientWidth={plotWidth}>
      <div class="baseline" aria-hidden="true"></div>
      {#each row.points as point (point.days)}
       <button class="sample-dot" class:chosen={selected?.key === row.key && selected.days === point.days}
        style:left={pct(point.days)} style:top={`${point.lane * 46}px`}
        title={describe(point)} aria-label={`${row.name} · ${describe(point)}`}
        aria-pressed={selected?.key === row.key && selected.days === point.days}
        onclick={() => selected = selected?.key === row.key && selected.days === point.days ? null : { key: row.key, days: point.days }}>
        <b>{point.days}</b><span class="dot"></span>
        {#if point.samples.length > 1}<small>×{point.samples.length}</small>{/if}
       </button>
      {/each}
      <span class="mean" style:left={pct(row.stats.mean)} title={`Μέσος όρος ${fmtStat(row.stats.mean)} ημέρες`}></span>
     </div>
     <div class="values"><strong>{fmtStat(row.stats.mean)} <small>ημ. μέσος</small></strong><span>Πρώτο {row.stats.min} · διάμεσος {fmtStat(row.stats.median)}</span></div>
     {#if activePoint && activeRow?.key === row.key}
      <div class="inspector" aria-live="polite">
       <div class="inspection-title"><strong>{plural(activePoint.days, 'ημέρα', 'ημέρες')}</strong><span>{activeRow.name} · {plural(activePoint.samples.length, 'σημείο', 'σημεία')}</span><button class="tool" onclick={() => selected = null} aria-label="Κλείσιμο λεπτομερειών">Κλείσιμο ×</button></div>
       <ul>{#each activePoint.samples as { provider } (provider.id)}<li><b>{titleCase(provider.city) || 'Χωρίς πόλη'}</b><span>{providerName(provider)}</span>{#if provider.approx}<small>Θέση στον χάρτη κατά προσέγγιση</small>{/if}</li>{/each}</ul>
      </div>
     {/if}
    </li>
   {/each}
  </ol>
  {#if rows.length > 12}<button class="more tool" aria-expanded={showingAll} onclick={() => showingAll = !showingAll}>{showingAll ? 'Λιγότερες γραμμές' : `Όλες οι γραμμές (${rows.length})`}</button>{/if}
 {/if}
 <div class="actions">
  <label for={`${uid}-specialty`}>Επίλεξε ειδικότητα
   <select id={`${uid}-specialty`} value={selection.specialtyId ?? ''} onchange={(e) => { selected = null; onPickSpecialty(e.currentTarget.value ? Number(e.currentTarget.value) : null); }}>
    <option value="">Όλες οι ειδικότητες</option>{#each data.specialties as specialty (specialty.id)}<option value={specialty.id}>{specialty.name}</option>{/each}
   </select>
  </label>
  <button class="map-action tool" disabled={!mapKey} onclick={() => { if (mapKey) onShowOnMap(mapKey); }}>Δες στον χάρτη ↗</button>
 </div>
 <p class="note">Μετράμε το πρώτο διαθέσιμο ραντεβού κάθε σημείου κατά τη σάρωση, όχι τον πραγματικό χρόνο εξυπηρέτησης. Τα σημεία χωρίς ημερομηνία δεν μπαίνουν στον μέσο όρο.</p>
</section>

<style>
 .waits { display:grid; gap:1rem; min-width:0; scroll-margin-top:calc(var(--atlas-bar-height, 0px) + 16px); }
 .head,.row-heading,.inspection-title { display:flex; justify-content:space-between; align-items:center; gap:1rem; }
 h2 { font-size:clamp(1.5rem,3vw,2.2rem); } .sub,.note { margin:0; font-size:.83rem; color:var(--ink-3); }
 .legend { display:flex; gap:1.4rem; flex-wrap:wrap; font-size:.76rem; color:var(--ink-2); }
 .legend span { display:flex; gap:.5rem; align-items:center; } .legend i,.dot { width:8px; height:8px; background:var(--accent); border-radius:50%; display:block; }
 .legend .diamond { background:var(--urgent); border-radius:0; transform:rotate(45deg); }
 .list { list-style:none; padding:0; margin:0; } .row { border-top:1px solid var(--line); display:grid; grid-template-columns:minmax(120px,.9fr) minmax(0,2fr) minmax(130px,.7fr); align-items:center; gap:1.5rem; padding:1rem 0; }
 .row-heading { display:grid; gap:.4rem; } .row-heading h3 { font:600 .95rem var(--sans); } .row-heading>span,.values>span { font-size:.73rem; color:var(--ink-3); }
 .plot { position:relative; min-width:0; margin-inline:22px; background:repeating-linear-gradient(90deg,var(--line) 0 1px,transparent 1px 25%); }
 .baseline { position:absolute; inset:auto -12px 0; height:1px; background:var(--line-2); }
 .sample-dot { position:absolute; width:44px; min-height:44px; transform:translateX(-50%); display:flex; flex-direction:column; gap:2px; align-items:center; padding:0; border:0; background:transparent; font-size:.75rem; }
 .sample-dot b { font-weight:600; background:var(--paper); padding:0 3px; line-height:1.3; } .sample-dot small { font-size:.6rem; color:var(--ink-3); }
 .sample-dot:hover .dot,.sample-dot.chosen .dot { box-shadow:0 0 0 4px var(--accent-soft); background:var(--accent-d); } .sample-dot.chosen b { background:var(--accent); color:white; border-radius:3px; }
 .mean { position:absolute; bottom:-4px; width:9px; height:9px; background:var(--urgent); transform:translateX(-50%) rotate(45deg); }
 .values { display:grid; gap:.4rem; text-align:right; } .values strong { font-size:1.35rem; font-weight:500; } .values small { font-size:.74rem; font-weight:400; }
 .inspector { grid-column:1/-1; padding:1rem 1.2rem; border-left:3px solid var(--accent); background:var(--accent-soft); min-height:72px; } 
 .inspection-title { flex-wrap:wrap; font-size:.86rem; } .inspection-title strong { font-size:1.3rem; } .inspector ul { list-style:none; padding:0; margin:.7rem 0 0; max-height:220px; overflow:auto; display:grid; gap:.6rem; } .inspector li { display:grid; gap:.15rem; font-size:.85rem; } .inspector small { color:var(--ink-3); }
 .actions { display:flex; gap:1rem; align-items:end; flex-wrap:wrap; } .actions label { display:grid; gap:.35rem; font-size:.78rem; min-width:0; flex:1; max-width:400px; }
 select { width:100%; min-width:0; height:44px; border:1px solid var(--line-2); border-radius:var(--r-ctl); padding:0 .6rem; color:var(--ink); background:var(--card); font:inherit; font-size:16px; }
 .tool { min-height:44px; padding:.5rem .8rem; background:var(--card); border:1px solid var(--line-2); border-radius:var(--r-ctl); font-size:.78rem; font-weight:500; } .tool:disabled { opacity:.5; cursor:default; } .more { justify-self:start; } .map-action { background:var(--accent); color:white; border-color:var(--accent); }
 .empty { padding:1.5rem; background:var(--paper-2); }
 @media(max-width:899px) { .row { grid-template-columns:minmax(0,1fr) auto; gap:1rem .5rem; } .row-heading { grid-column:1; } .values { grid-column:2; grid-row:1; } .plot { grid-column:1/-1; grid-row:2; } .values strong { font-size:1.1rem; } .values>span { max-width:135px; } }
 @media(max-width:420px) { .head { align-items:start; } .actions { gap:.6rem; } .actions label { flex-basis:100%; max-width:none; } }
</style>
