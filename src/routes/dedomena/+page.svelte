<script lang="ts">
	// /dedomena: every table of the atlas as a static CSV / JSON file, the URL pattern behind
	// them, and the list of public units where we found no free e-booking, by prefecture.
	import '../components/atlas.css';
	import { DATASETS, LICENSE, datasetPath, filterFor, type DataFilter } from '$lib/atlas/datasets';
	import { PUBLIC_SITE } from '$lib/atlas/url';
	import { fmtDateLong, fmtDayShort, fmtInt, plural, titleCase } from '../components/format';
	import AtlasMark from '../components/AtlasMark.svelte';
	import AtlasFooter from '../components/AtlasFooter.svelte';

	let { data: page } = $props();
	const data = $derived(page.atlas);

	let specialtyId = $state<number | null>(null);
	let prefectureId = $state<number | null>(null);
	const filter = $derived<DataFilter>(filterFor({ specialtyId, prefectureId }));

	const specs = $derived(data ? [...data.specialties].sort((a, b) => a.name.localeCompare(b.name, 'el')) : []);
	const prefs = $derived(data ? [...data.prefectures].sort((a, b) => a.name.localeCompare(b.name, 'el')) : []);
	const scope = (f: DataFilter) =>
		f.specialtyId != null ? (data?.specialties.find((s) => s.id === f.specialtyId)?.name ?? '') : f.prefectureId != null ? (data?.prefectures.find((p) => p.id === f.prefectureId)?.name ?? '') : '';

	// The units list follows both pickers (a specialty and a prefecture narrow it together).
	const offRows = $derived.by(() => {
		if (!data) return [];
		return data.off.filter((r) => (specialtyId == null || r.specialtyId === specialtyId) && (prefectureId == null || r.prefectureId === prefectureId));
	});
	const offGroups = $derived.by(() => {
		const groups = new Map<string, typeof offRows>();
		for (const r of offRows) {
			const key = (r.prefecture as string | null) ?? 'Χωρίς νομό';
			groups.set(key, [...(groups.get(key) ?? []), r]);
		}
		return [...groups];
	});
	const lastText = (d: unknown) => (typeof d === 'string' ? fmtDayShort(d) : 'ποτέ στις σαρώσεις μας');
	const example = $derived(`${PUBLIC_SITE}${datasetPath('coverage', 'csv', { specialtyId: specs.find((s) => s.name === 'Ψυχίατρος')?.id ?? specs[0]?.id ?? 1 })}`);
</script>

<svelte:head>
	<title>Ανοιχτά δεδομένα · Άτλας πρόσβασης</title>
	<meta name="description" content="Οι πίνακες του Άτλαντα πρόσβασης ως αρχεία CSV και JSON: κάλυψη ανά νομό και ειδικότητα, δημόσια σημεία, αναμονές, λάθος θέσεις, εβδομαδιαίες σαρώσεις. Άδεια CC BY 4.0." />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Source+Serif+4:wght@600;700&display=swap" />
</svelte:head>

<div class="atlas data-page">
	<header class="bar"><a class="back" href="/"><AtlasMark size={26} /><span>Άτλας πρόσβασης</span></a></header>
	<main class="page">
		<header class="top">
			<h1>Ανοιχτά δεδομένα</h1>
			<p class="lede">
				Όλοι οι πίνακες του άτλαντα, ως αρχεία CSV και JSON. Κάθε αρχείο έχει σταθερή διεύθυνση και ενημερώνεται με την
				εβδομαδιαία σάρωση.
			</p>
			{#if data}
				<p class="meta">
					Σάρωση <strong>{fmtDateLong(data.scan.at)}</strong> · Άδεια <a href={LICENSE.url} target="_blank" rel="noopener">{LICENSE.name}</a>: ελεύθερη
					χρήση, με αναφορά «Άτλας πρόσβασης, atlas.haroldpoi.dev».
				</p>
			{/if}
		</header>

		{#if !data}
			<p>Δεν υπάρχει ακόμη σάρωση.</p>
		{:else}
			<section class="how" aria-labelledby="how-title">
				<h2 id="how-title">Πώς τα παίρνεις</h2>
				<p>Το φίλτρο είναι μέρος της διεύθυνσης. Άλλαξε τον αριθμό για άλλη ειδικότητα ή νομό:</p>
				<pre><code>{example}</code></pre>
				<ul>
					<li><code>/data/v1/&lt;σύνολο&gt;.csv</code> ή <code>.json</code>: όλο το σύνολο.</li>
					<li><code>/data/v1/&lt;σύνολο&gt;/specialty-&lt;id&gt;.csv</code>: μία ειδικότητα. <code>prefecture-&lt;id&gt;</code>: ένας νομός.</li>
					<li>
						<a href="/data/v1/index.json" target="_blank" rel="noopener">index.json</a>: ο κατάλογος, με τις στήλες κάθε συνόλου. Τα αναγνωριστικά (id)
						είναι στα <a href="#specialties">Ειδικότητες</a> και <a href="#prefectures">Νομοί</a>.
					</li>
				</ul>
				<p class="note">Τα CSV είναι UTF-8 και ανοίγουν σωστά στο Excel. Τα σημεία είναι μόνο δημόσιες μονάδες. Ιδιώτες και γιατροί ΕΟΠΥΥ μετρούν μόνο στα σύνολα, χωρίς όνομα ή διεύθυνση.</p>
			</section>

			<div class="pick" role="group" aria-label="Φίλτρο αρχείων">
				<label>Ειδικότητα
					<select bind:value={specialtyId}>
						<option value={null}>Όλες</option>
						{#each specs as s (s.id)}<option value={s.id}>{titleCase(s.name)}</option>{/each}
					</select>
				</label>
				<label>Νομός
					<select bind:value={prefectureId}>
						<option value={null}>Όλη η Ελλάδα</option>
						{#each prefs as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
					</select>
				</label>
				<p class="note">Τα αρχεία έχουν ένα φίλτρο: με ειδικότητα και νομό μαζί, δίνουν την ειδικότητα για όλους τους νομούς.</p>
			</div>

			<ol class="sets">
				{#each DATASETS as d (d.id)}
					{@const f = d.filters.length ? filter : {}}
					<li id={d.id}>
						<div class="head">
							<h2>{d.title}</h2>
							<div class="fmt">
								<a href={datasetPath(d.id, 'csv', f)} download>CSV</a>
								<a href={datasetPath(d.id, 'json', f)} target="_blank" rel="noopener">JSON</a>
							</div>
						</div>
						<p>{d.description}{#if scope(f)} <span class="scope">· {scope(f)}</span>{/if}</p>
						<details>
							<summary>{plural(d.columns.length, 'στήλη', 'στήλες')}</summary>
							<dl>{#each d.columns as c (c.key)}<dt><code>{c.key}</code></dt><dd>{c.description}</dd>{/each}</dl>
						</details>
					</li>
				{/each}
			</ol>

			<section class="off" id="off-list" aria-labelledby="off-title">
				<h2 id="off-title">Μονάδες χωρίς ελεύθερο ηλεκτρονικό ραντεβού</h2>
				<p>
					Δημόσιες μονάδες που έχουν την ειδικότητα, αλλά στην τελευταία σάρωση δεν βρήκαμε ελεύθερο ηλεκτρονικό ραντεβού.
					Μπορεί οι θέσεις να είναι κλεισμένες ή το ιατρείο να μην κλείνει ηλεκτρονικά· η σάρωση δεν ξεχωρίζει τα δύο.
					<strong>{fmtInt(offRows.length)}</strong> {offRows.length === 1 ? 'καταχώριση' : 'καταχωρίσεις'}{#if scope(filter)} · {scope(filter)}{/if}.
				</p>
				{#each offGroups as [name, rows] (name)}
					<details>
						<summary><span>{name}</span><span class="n">{rows.length}</span></summary>
						<table>
							<thead><tr><th>Μονάδα</th><th>Ειδικότητα</th><th>Τι βρήκαμε</th><th>Τελευταία φορά με ελεύθερο ραντεβού</th></tr></thead>
							<tbody>
								{#each rows as r (`${r.providerId}:${r.specialtyId}`)}
									<tr>
										<td>{r.name}<span class="city">{r.city}</span></td>
										<td>{titleCase(String(r.specialty))}</td>
										<td>{r.state === 'registered-only' ? 'δηλωμένο ιατρείο' : 'είχε ραντεβού, όχι τώρα'}</td>
										<td>{lastText(r.lastBookable)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</details>
				{/each}
			</section>
		{/if}
		<AtlasFooter />
	</main>
</div>

<style>
	.data-page {
		min-height: 100vh;
		background: var(--paper);
		color: var(--ink);
	}
	.bar {
		background: var(--accent-d);
		color: white;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 56px;
		padding: 0 clamp(1rem, 4vw, 2.5rem);
		color: white;
		font-weight: 500;
	}
	.page {
		max-width: 920px;
		margin: auto;
		padding: 2rem clamp(1rem, 4vw, 2.5rem) 2rem;
		display: grid;
		gap: 1.6rem;
	}
	h1 {
		font-size: clamp(2rem, 5vw, 2.8rem);
	}
	h2 {
		font-size: clamp(1.15rem, 2vw, 1.35rem);
	}
	.lede {
		font-size: 1.05rem;
		margin: 0.6rem 0 0;
		max-width: 60ch;
	}
	.meta,
	.note {
		color: var(--ink-2);
		font-size: 0.86rem;
	}
	.meta {
		margin: 0.5rem 0 0;
	}
	.how,
	.sets li,
	.off {
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 1rem 1.1rem;
	}
	.how p,
	.how ul {
		margin: 0.5rem 0 0;
	}
	.how li {
		margin: 0.25rem 0;
	}
	pre {
		margin: 0.5rem 0;
		padding: 0.6rem 0.8rem;
		background: var(--paper);
		border-radius: 6px;
		overflow-x: auto;
		font-size: 0.85rem;
	}
	code {
		font-size: 0.85em;
	}
	.pick {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		align-items: end;
		position: sticky;
		top: 0;
		z-index: 5;
		background: var(--paper);
		padding: 0.6rem 0;
	}
	.pick label {
		display: grid;
		gap: 0.2rem;
		font-size: 0.82rem;
		color: var(--ink-2);
	}
	.pick select {
		font: inherit;
		font-size: 0.95rem;
		color: var(--ink);
		padding: 0.35rem 0.5rem;
		border: 1px solid var(--line-2);
		border-radius: 6px;
		background: var(--card);
		min-width: 12rem;
	}
	.pick .note {
		margin: 0;
		flex-basis: 100%;
	}
	.sets {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.8rem;
	}
	.sets li {
		scroll-margin-top: 7rem;
	}
	.sets li:target {
		border-color: var(--accent);
		box-shadow: 0 0 0 2px var(--accent-soft);
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.8rem;
		flex-wrap: wrap;
	}
	.sets p {
		margin: 0.4rem 0;
		color: var(--ink-2);
	}
	.scope {
		color: var(--accent-d);
		font-weight: 500;
	}
	.fmt {
		display: flex;
		gap: 0.4rem;
	}
	.fmt a {
		padding: 0.3rem 0.8rem;
		border: 1px solid var(--line-2);
		border-radius: 6px;
		font-weight: 600;
		font-size: 0.85rem;
		color: var(--accent-d);
	}
	.fmt a:hover {
		background: var(--accent-soft);
	}
	summary {
		cursor: pointer;
		font-size: 0.86rem;
		color: var(--ink-2);
	}
	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.25rem 0.8rem;
		margin: 0.5rem 0 0;
		font-size: 0.85rem;
	}
	dd {
		margin: 0;
		color: var(--ink-2);
	}
	.off p {
		margin: 0.5rem 0 0.8rem;
		color: var(--ink-2);
	}
	.off details {
		border-top: 1px solid var(--line);
		padding: 0.45rem 0;
	}
	.off summary {
		display: flex;
		justify-content: space-between;
		font-size: 0.95rem;
		color: var(--ink);
	}
	.off .n {
		color: var(--ink-3);
		font-variant-numeric: tabular-nums;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		margin-top: 0.5rem;
		font-size: 0.84rem;
	}
	th {
		text-align: left;
		font-weight: 500;
		color: var(--ink-3);
		border-bottom: 1px solid var(--line);
		padding: 0.3rem 0.4rem;
	}
	td {
		padding: 0.35rem 0.4rem;
		border-bottom: 1px solid var(--paper-2);
		vertical-align: top;
	}
	.city {
		display: block;
		color: var(--ink-3);
		font-size: 0.78rem;
	}
	#specialties,
	#prefectures,
	#off-list {
		scroll-margin-top: 7rem;
	}
	@media (max-width: 560px) {
		/* Hidden from sight, not from screen readers: the cells keep their column names. */
		table thead {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip: rect(0 0 0 0);
		}
		table tr {
			display: grid;
			grid-template-columns: 1fr 1fr;
			border-bottom: 1px solid var(--paper-2);
			padding: 0.3rem 0;
		}
		table td {
			border: 0;
			padding: 0.1rem 0.4rem;
		}
		table td:first-child {
			grid-column: 1 / -1;
			font-weight: 500;
		}
	}
</style>
