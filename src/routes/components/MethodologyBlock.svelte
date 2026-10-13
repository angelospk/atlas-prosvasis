<script lang="ts">
	// How the numbers are made, in prose, folded away. Calm on purpose: it is the part the
	// Ministry will read first if it disagrees with a figure.
	import type { AtlasReport } from '$lib/atlas/types';
	import { SECTORS, SECTOR_LABEL } from '$lib/atlas/types';
	import { daysFromScan, fmtDateLong, fmtDayShort, fmtInt, provisionalPinIds } from './format';
	import { FEEDBACK_FORM, PUBLIC_REPO } from '$lib/atlas/url';

	let { report }: { report: AtlasReport } = $props();

	const scans = $derived([...report.scans].sort((a, b) => a.id.localeCompare(b.id)));
	const complete = $derived(scans.filter((s) => s.complete).length);
	const time = $derived(report.scan.at.slice(11, 16));
	// The longest wait the scan saw: the catalogue's own search window is at least this long.
	const longest = $derived(Math.max(0, ...report.providers.flatMap((p) => Object.values(p.firstDates ?? {}).map((d) => daysFromScan(d, report.scan.at) ?? 0))));
	const provisional = $derived(provisionalPinIds(report).size);
</script>

<details class="method">
	<summary>
		<span class="t">Μεθοδολογία</span>
		<span class="s">
			Πηγή, σαρώσεις, τι μετράμε και τι όχι · έκδοση <span class="num">{report.methodologyVersion}</span>
		</span>
		<span class="more" aria-hidden="true">Ανάγνωση</span>
	</summary>

	<div class="body">
		<section>
			<h3>Τι μετράει ο άτλας</h3>
			<p>
				Μετράει διαθεσιμότητα μέσω ηλεκτρονικού ραντεβού: ποιοι δέχονται ραντεβού στον κατάλογο του Υπουργείου
				και πόσο νωρίς. Ένα κενό στον κατάλογο δεν σημαίνει ότι λείπει η ιατρική φροντίδα. Μπορεί να υπάρχει
				γιατρός που κλείνει ραντεβού μόνο με τηλέφωνο ή στο γκισέ. Ξεχωρίζουμε τρεις περιπτώσεις:
			</p>
			<ul class="cases">
				<li><span class="strong">Καμία μονάδα στον κατάλογο.</span> Για τον νομό και την ειδικότητα ο κατάλογος δεν επέστρεψε κανένα σημείο. Μετράει 0.</li>
				<li><span class="strong">Κανένα ελεύθερο ραντεβού.</span> Το σημείο υπάρχει, αλλά η αναζήτηση του καταλόγου δεν βρήκε ελεύθερη ημέρα. Μετράει στα σημεία, όχι στην αναμονή («με ημερομηνία» στο γράφημα).</li>
				<li><span class="strong">Αποτυχημένος έλεγχος.</span> Ο κατάλογος δεν απάντησε για το σημείο. Μένει έξω από την αναμονή και δεν μετράει ως έλλειψη. Μια σάρωση με σφάλματα σημειώνεται ελλιπής και δεν συγκρίνεται.</li>
			</ul>
			<p>
				Το πόσο μπροστά ψάχνει ο κατάλογος το ορίζει ο ίδιος, όχι εμείς. Η μακρύτερη αναμονή που βρήκε αυτή η
				σάρωση είναι <span class="num">{fmtInt(longest)}</span> ημέρες.
			</p>
		</section>

		<section>
			<h3>Πηγή και σαρώσεις</h3>
			<p>
				Ο κατάλογος ηλεκτρονικών ραντεβού του Υπουργείου Υγείας ({report.scan.source}). Κάθε εβδομάδα
				σαρώνουμε ολόκληρο τον κατάλογο. Η σελίδα δείχνει τη σάρωση της
				<span class="strong">{fmtDateLong(report.scan.at)}</span>{#if time}{" "}(ξεκίνησε στις <span class="num">{time}</span>){/if}. Οι ημερομηνίες ραντεβού είναι στιγμιότυπα
				εκείνης της ημέρας, όχι σημερινή διαθεσιμότητα.
			</p>
			{#if scans.length > 0}
				<ul class="scans">
					{#each scans as s (s.id)}
						<li>
							<span class="strong num">{fmtDayShort(s.id)}</span>
							<span class="num">{fmtInt(s.units)} μονάδες · {fmtInt(s.doctors)} ιατροί</span>
							{#if !s.complete}<span class="inc">ελλιπής, δεν συγκρίνεται</span>{/if}
						</li>
					{/each}
				</ul>
				<p class="muted">
					{fmtInt(complete)} από {fmtInt(scans.length)} σαρώσεις πλήρεις. Συγκρίνονται και δημοσιεύονται μόνο πλήρεις σαρώσεις.
				</p>
			{/if}
		</section>

		<section>
			<h3>Φορείς</h3>
			<p>
				{#each SECTORS as s, i (s)}<span class="smark {s}" aria-hidden="true"></span> {SECTOR_LABEL[s]}{i < SECTORS.length - 1 ? ' · ' : ''}{/each}
			</p>
			<p>
				Δημόσια σημεία = νοσοκομεία ΕΣΥ και κέντρα υγείας / ΠΦΥ. Οι ημερομηνίες πρώτου ραντεβού
				αφορούν όλους τους φορείς, όπως τις έδωσε ο κατάλογος την ημέρα της σάρωσης.
			</p>
			<p>
				Ονομαστικά εμφανίζονται μόνο οι δημόσιες μονάδες. Οι ιδιώτες και οι συμβεβλημένοι με τον ΕΟΠΥΥ
				ιατροί μετρούν σε όλους τους αριθμούς, αλλά χωρίς όνομα και διεύθυνση, με θέση το κέντρο της
				πόλης τους.
			</p>
		</section>

		<section>
			<h3>Αναμονή</h3>
			<p>
				Για κάθε σημείο παροχής κρατάμε την πρώτη ελεύθερη ημέρα ραντεβού που έδωσε ο κατάλογος, ανά ειδικότητα, και
				μετράμε τις ημέρες από τη σάρωση. Στο γράφημα αναμονής κάθε γραμμή είναι μια ειδικότητα ή ένας νομός:
				κάθε τελεία είναι μια ημέρα αναμονής (σημεία με την ίδια ημέρα μαζί), η μπάρα πάει από το πρώτο ως το
				τελευταίο ραντεβού και η σκούρα γραμμή είναι ο μέσος όρος.
			</p>
		</section>

		<section>
			<h3>Τι είναι ένα «σημείο παροχής»</h3>
			<p>
				Μια μονάδα ή ένας ιατρός που δέχεται ραντεβού μέσω της πλατφόρμας για μια ειδικότητα. Μετράμε σημεία,
				όχι ιατρούς ούτε δυναμικότητα. Ένας ιατρός με δύο ιατρεία, ή καταχωρισμένος και ως συμβεβλημένος
				ΕΟΠΥΥ και ως ιδιώτης, μετράει δύο φορές. Έτσι τον βλέπει και ο πολίτης στον κατάλογο.
				{#if !report.scan.unitSpecialtiesComplete}
					Σε αυτή τη σάρωση κρατήθηκε μία ειδικότητα ανά νοσοκομείο/κέντρο υγείας, οπότε οι δημόσιοι αριθμοί
					είναι κατώτατο όριο.
				{/if}
			</p>
		</section>

		<section>
			<h3>Ειδικότητες</h3>
			<p>
				Οι ειδικότητες είναι όπως τις ονομάζει ο κατάλογος· ενώνουμε μόνο προφανείς παραλλαγές γραφής και
				αποδίδουμε τόνους. Ό,τι δεν αναγνωρίζουμε μένει με κεφαλαία, όπως στην πηγή.
			</p>
		</section>

		<section>
			<h3>Πληθυσμός και νομοί</h3>
			<p>
				Οι αναλογίες ανά 100.000 κατοίκους χρησιμοποιούν την απογραφή ΕΛΣΤΑΤ {report.populationYear} στους
				51 παλαιούς νομούς, όπως τους χρησιμοποιεί και ο κατάλογος. Ένα μηδέν σημαίνει «δεν καταγράφεται στον
				κατάλογο», όχι απουσία υγειονομικής φροντίδας.
			</p>
		</section>

		<section>
			<h3>Αποστάσεις και θέσεις</h3>
			<p>
				Οι αποστάσεις μετρούν από την έδρα του νομού ως το πλησιέστερο σημείο, σε ευθεία γραμμή· δεν είναι
				χρόνος διαδρομής. Στα νησιά η ευθεία περνάει πάνω από θάλασσα· η πραγματική διαδρομή (πλοίο, αεροπλάνο)
				είναι πολύ μεγαλύτερη. Τα {report.distanceFlagKm} χλμ είναι όριο επισκόπησης, όχι κλινικό πρότυπο.
				Καταχωρίσεις με λάθος θέση από το Υπουργείο (μηδενικές συντεταγμένες, εκτός Ελλάδας, ή σε άλλη πόλη)
				τοποθετούνται στο κέντρο της πόλης τους, σημειώνονται «περίπου» και μετρούν στις αποστάσεις
				(απόκλιση λίγων χιλιομέτρων). Εξαιρούνται μόνο όταν δεν ξέρουμε ούτε την πόλη.
			</p>
			<p>
				Σε αυτή τη σάρωση <span class="num">{fmtInt(provisional)}</span> καταχωρίσεις έχουν ακόμη λάθος ή
				ανεπιβεβαίωτη θέση. Οι αποστάσεις προς αυτές είναι προσωρινές και η σύνοψη το γράφει δίπλα στον αριθμό.
			</p>
			<p><a href="/pin-issues.csv" download>Μονάδες με λάθος θέση στον κατάλογο (CSV)</a></p>
		</section>

		<section>
			<h3>Εβδομαδιαίες αλλαγές</h3>
			<p>
				Συγκρίνουμε μόνο διαδοχικές πλήρεις σαρώσεις. «Δεν επιστρέφεται πια» σημαίνει ότι ο κατάλογος έπαψε
				να επιστρέφει την καταχώριση, όχι ότι το ιατρείο έκλεισε.
			</p>
		</section>

		<section>
			<h3>Διορθώσεις</h3>
			<p>
				Βρήκες λάθος; Γράψε μας στην <a href={FEEDBACK_FORM} target="_blank" rel="noopener">ανώνυμη φόρμα</a>
				ή άνοιξε θέμα στο <a href={`${PUBLIC_REPO}/issues`} target="_blank" rel="noopener">GitHub</a>. Διορθώνουμε
				στην επόμενη σάρωση.
			</p>
		</section>

		<p class="version">Έκδοση μεθοδολογίας {report.methodologyVersion}.</p>
	</div>
</details>

<style>
	.method {
		border-top: 1px solid var(--line);
		border-bottom: 1px solid var(--line);
		padding: 0.6rem 0;
		color: var(--ink-2);
	}
	summary {
		list-style: none;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 1rem;
		align-items: baseline;
		cursor: pointer;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	.t {
		font-family: var(--serif);
		font-size: 1.05rem;
		font-weight: 600;
		color: var(--ink);
	}
	.s {
		font-size: 0.84rem;
		color: var(--ink-3);
	}
	.more {
		font-size: 0.82rem;
		color: var(--accent-d);
		font-weight: 500;
		text-decoration: underline;
		text-decoration-color: var(--line-2);
		text-underline-offset: 3px;
	}
	.method[open] .more {
		color: var(--ink-3);
	}
	.cases {
		margin: 0;
		padding-left: 1.1rem;
		display: grid;
		gap: 0.35rem;
	}
	.body {
		display: grid;
		gap: 0.9rem;
		padding: 0.9rem 0 0.3rem;
		font-size: 0.9rem;
		line-height: 1.5;
	}
	h3 {
		font-family: var(--sans);
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--ink);
		margin-bottom: 0.25rem;
	}
	p {
		margin: 0;
	}
	p + p {
		margin-top: 0.35rem;
	}
	.strong {
		color: var(--ink);
		font-weight: 600;
	}
	.num {
		font-variant-numeric: tabular-nums;
	}
	.scans {
		list-style: none;
		margin: 0.5rem 0 0.3rem;
		padding: 0;
		display: grid;
		gap: 0.15rem;
	}
	.scans li {
		display: grid;
		grid-template-columns: 4.5rem minmax(0, 1fr) auto;
		gap: 0.8rem;
		font-size: 0.84rem;
	}
	.inc {
		color: var(--warn);
	}
	.muted {
		color: var(--ink-3);
		font-size: 0.82rem;
	}
	.version {
		font-size: 0.76rem;
		color: var(--ink-3);
	}
	@media (max-width: 600px) {
		summary {
			grid-template-columns: minmax(0, 1fr) auto;
		}
		.s {
			grid-column: 1 / -1;
		}
	}
</style>
