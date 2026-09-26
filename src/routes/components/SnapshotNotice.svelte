<script lang="ts">
	// One quiet line about what the numbers are (a directory snapshot, not capacity), with the
	// caveats folded away. Nothing here is dramatic on purpose: the reader may be the Ministry.
	import type { ScanMeta } from '$lib/atlas/types';
	import { fmtDateLong, fmtInt, plural } from './format';

	let { scan, populationYear, distanceFlagKm }: { scan: ScanMeta; populationYear: number; distanceFlagKm: number } =
		$props();

	const date = $derived(fmtDateLong(scan.at));
	const repaired = $derived(scan.providersWithoutPin);
	const unplaced = $derived(scan.providersWithoutPrefecture);
</script>

<details class="notice">
	<summary>
		<span class="line">
			Στιγμιότυπο του καταλόγου e-ραντεβού, <span class="strong">{date}</span>
			· {fmtInt(scan.units)} μονάδες και {fmtInt(scan.doctors)} ιατροί
			· πληθυσμός <span class="num">{populationYear}</span>
			· όριο απόστασης <span class="num">{distanceFlagKm} χλμ</span>
		</span>
		<span class="more" aria-hidden="true">Τι μετράμε</span>
	</summary>
	<ul class="caveats">
		<li>
			<b>Πηγή.</b> {scan.source}, όπως ήταν στις {date}. Οι ημερομηνίες ραντεβού μετρώνται από
			εκείνη την ημέρα, όχι από σήμερα.
		</li>
		<li>
			<b>Κατάλογος, όχι δυναμικότητα.</b> Μετράμε σημεία που δέχονται ραντεβού μέσω της πλατφόρμας.
			Ένα μηδέν σημαίνει «δεν καταγράφεται στον κατάλογο», όχι ότι δεν υπάρχει φροντίδα.
		</li>
		{#if !scan.unitSpecialtiesComplete}
			<li>
				<b>Νοσοκομεία και κέντρα υγείας: κατώτατο όριο.</b> Η σάρωση κράτησε μία ειδικότητα ανά
				μονάδα, οπότε οι δημόσιοι αριθμοί είναι υποεκτίμηση.
			</li>
		{/if}
		<li>
			<b>Θέσεις.</b> {plural(repaired, 'πάροχος', 'πάροχοι')} χωρίς αξιόπιστη θέση από το Υπουργείο.
			Τους βάζουμε στο κέντρο της πόλης και τους σημειώνουμε «περίπου», ή τους αφήνουμε έξω από τις
			αποστάσεις. {plural(unplaced, 'πάροχος', 'πάροχοι')} χωρίς νομό.
		</li>
		<li>
			<b>Αποστάσεις.</b> Από την έδρα του νομού, σε ευθεία γραμμή. Δεν είναι χρόνος διαδρομής.
		</li>
		<li>
			<b>Τα {distanceFlagKm} χλμ</b> είναι όριο επισκόπησης για να ξεχωρίζουν τα κενά, όχι κλινικό
			πρότυπο.
		</li>
		{#if scan.errors > 0}
			<li><b>Σφάλματα σάρωσης.</b> {plural(scan.errors, 'αίτημα απέτυχε', 'αιτήματα απέτυχαν')}. Τα αντίστοιχα σημεία λείπουν.</li>
		{/if}
	</ul>
</details>

<style>
	.notice {
		border-top: 1px solid var(--line);
		border-bottom: 1px solid var(--line);
		padding: 0.55rem 0;
		font-size: 0.86rem;
		color: var(--ink-2);
	}
	summary {
		list-style: none;
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: baseline;
		cursor: pointer;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	.line {
		min-width: 0;
	}
	.strong {
		color: var(--ink);
		font-weight: 600;
	}
	.num {
		font-variant-numeric: tabular-nums;
	}
	.more {
		flex: none;
		color: var(--accent-d);
		font-weight: 500;
		text-decoration: underline;
		text-decoration-color: var(--line-2);
		text-underline-offset: 3px;
	}
	.notice[open] .more {
		color: var(--ink-3);
	}
	summary:hover .more {
		text-decoration-color: var(--accent);
	}
	.caveats {
		margin: 0.7rem 0 0.2rem;
		padding: 0 0 0 1.1rem;
		display: grid;
		gap: 0.35rem;
		max-width: 70ch;
		line-height: 1.45;
	}
	.caveats b {
		color: var(--ink);
		font-weight: 600;
	}
	@media (max-width: 600px) {
		summary {
			flex-direction: column;
			gap: 0.2rem;
		}
	}
</style>
