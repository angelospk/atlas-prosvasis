# Atlas components

Presentational Svelte 5 components for the «Άτλας πρόσβασης» page. Everything renders from
props; nothing fetches or reads a store. Types come from `src/lib/atlas/types.ts` (unchanged).
`../+page.svelte` assembles them with local `$state` over the data from `+page.server.ts`.
`atlas.test.ts` covers the helpers and a server render of every component
(`npx vitest run src/routes/atlas`).

## Brief 3: simple by default, depth one tap away

The page is steered from one sticky **SelectionBar**; every graphic derives from the same
`Selection`. Page order the assembler uses:

1. H1 «Άτλας πρόσβασης» + a one-sentence lede. No eyebrow.
2. **SelectionBar** (sticky).
3. **WeeklyBriefing** (four findings).
4. **PrefectureChoropleth** with **MetricSummary** beside it (desktop) / below (phone).
5. **CoverageList** (rows expand in place) with **AccessMap** beside it on desktop only. On
   phones the list only; the choropleth is the phone's map.
6. `<details>` «Περισσότερα εργαλεία», collapsed: **CoverageMatrix** (with «Μεγάλη προβολή»),
   **SpecialtyCoverageBars**, **CoverageRanking**, **ScanChangeChart**.
7. **MethodologyBlock**.

Not mounted any more: `ExplorerControls`, `EvidencePanel`, `PinErrorTracker` (files kept).

**What `Selection` means now.** `prefectureId` and `specialtyId` are independent pickers,
both nullable. The SelectionBar sets `mode` itself: a specialty with no prefecture → `specialty`
(the list shows prefectures), anything else → `place` (the list shows specialties, national
rows when `prefectureId` is null). The assembler should not set `mode` by hand; when applying a
finding, merge its partial selection and let the SelectionBar's next change fix `mode`, or apply
the same rule (`specialtyId != null && prefectureId == null ? 'specialty' : 'place'`).

**Theme.** Import `atlas.css` once from the page and put the `atlas` class on the page root. It
declares the palette and fonts as custom properties and holds the few shared, intentionally
global classes: `.smark.{esy|pfy|eopyy|private}` (the sector square; add `.off` for an absent
sector), `.hatch` (unknown data), and the Leaflet pin/cluster/tooltip classes (`.atlas-pin`,
`.atlas-cluster`, `.atlas-km`). Fonts: **Source Serif 4** (headings only, 600/700, upright) and
**IBM Plex Sans** (everything else, numbers included, tabular). They are not loaded here; the
page's `<svelte:head>` must add
`https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Source+Serif+4:wght@600;700&display=swap`.
No italics anywhere.

**Copy rules.** No em dashes in UI text; a comma, a middle dot «·» or a full stop instead.
`format.ts` exports `EMPTY` («–», an en dash) for empty numeric cells; it is never used as
punctuation inside a sentence. Short, plain Greek; the honesty rules (directory ≠ capacity,
«δεν καταγράφεται» ≠ «δεν υπάρχει») are said once, simply.

**format.ts.** Pure helpers used by every component: Greek `titleCase`, accent-insensitive
`fold`, number/km/date formatting (dates are always shown relative to `scan.at`), `cellKey` /
`parseKey` (`${prefectureId}:${specialtyId}`, prefecture `0` = all Greece), `buildIndex`, the row
deriver `deriveRows` + `sortRows` that the list and the summary share, `selectionLabel` («Ν.
Αρκαδίας · Παιδίατρος · ΕΣΥ + ΠΦΥ»), `isDefaultSelection`, `specialtiesCovered` (specialties with
≥1 site per prefecture) with the fixed `COUNT_BREAKS` / `countClass`, plus the weekly helpers
(`rateClass` / `RATE_BREAKS`, projection, `sectorsLabel`, `toCsv`, …). Sector filtering happens
here: counts sum over `selection.sectors`, per-100k is recomputed from the prefecture's
population, the soonest date is the minimum over the prefecture's public providers in the chosen
sectors, and the nearest distance comes from the cell when the sectors are all four or exactly
ΕΣΥ+ΠΦΥ, otherwise it is a haversine over the located providers. `nearestKm` sorts farthest
first; nulls always last.

## Components

**Combobox** `{ id, label, options: ComboOption[], value, onPick, placeholder?, compact? }`.
Internal piece: the searchable picker (input + listbox, accent-insensitive, ArrowUp/Down, Enter,
Escape; blur closes after a tick so a click can land). `ComboOption` is `{ id: number | null,
label, sub, search }`; `id: null` is the «all» entry. Used by SelectionBar and ExplorerControls.

**SelectionBar** `{ data, selection, onChange, onReset }`. Sticky (`position: sticky; top: 0`,
z-index 40). One row: «Νομός» («Όλη η Ελλάδα» + the 51), «Ειδικότητα» («Όλες» + all), and
«Φορείς: όλοι ▾», a `<details>` collapsed by default that opens the four sector toggles (at least
one stays on). Under it one plain line: «Βλέπεις: όλη την Ελλάδα · Παιδίατρος · ΕΣΥ + ΠΦΥ»,
with «Καθαρισμός» → `onReset()` whenever anything differs from the default. Every change is a
new `Selection` through `onChange`, with `mode` set as described above. On a 390px phone it is
two pickers + the sectors button on one row and the line below, about 100px tall. The assembler
should mount it directly under the masthead and give the page's other sticky elements a lower
z-index (the Leaflet map already sits in its own stacking context).

**WeeklyBriefing** `{ report, onSelect }`. Heading with the scan date, a context line («Σε
σύγκριση με τη σάρωση της 19 Σεπ · 11 νέες καταχωρίσεις, 2 δεν επιστρέφονται πια»), then the
first **four** `findings` as a numbered list; the text comes from the data untouched. A finding
with a `selection` is a button calling `onSelect(selection, evidenceKey)`, labelled «Δες το
στον χάρτη». The assembler merges the partial selection into the current one and, when
`evidenceKey` is set, uses it as the list's expanded row.

**PrefectureChoropleth** `{ data, boundaries, selection, onSelect }`. Pure SVG, projected here
(equirectangular × cos 38.5°, 640-unit viewBox), paths computed once per `boundaries`. Two
metrics, derived from the selection:

- **No specialty** → «Ειδικότητες με ραντεβού σε κάθε νομό»: the number of specialties with ≥1
  site in the selected sectors, out of `data.specialties.length`. Five **fixed** classes: 0–5 ·
  6–10 · 11–20 · 21–30 · 31+ (five greens, `#e6ece7` → `#245446`; the lowest class is still a
  tone because 0–5 is not «none»). Fixed so two weeks compare by eye.
- **A specialty** → sites per 100 000 residents in the selected sectors (the specialty-mode rows
  of `deriveRows`, so it agrees with the list to the decimal). Fixed classes 0 · >0–1 · >1–2 ·
  >2–4 · >4; zero is paper with a brick outline; unknown is hatched.

Tap or click a prefecture (on the map, the Attica inset, or the alphabetical `<select>`) calls
`onSelect(prefectureId)`; nothing opens. The hover/focus tooltip stays on desktop (hidden under
720px). Every path is `tabindex=0` / `role=button` with the full description as `aria-label`.
Legend counts prefectures per class (+ «χωρίς μέτρηση»). **PNG** (serialised SVG + canvas title,
legend, source, after `document.fonts.ready`, in Source Serif 4 / IBM Plex Sans) and **CSV**
(the 51 rows; in count mode: prefecture, seat, population, specialties with a site) work in
both modes. Credits for OpenStreetMap (ODbL) and geoBoundaries (CC BY 4.0) under the map and
in the PNG.

**MetricSummary** `{ data, selection }`. One sentence for the selection («Στον Ν. Έβρου: 31 από
49 ειδικότητες με πάροχο…», the specialty version, or the national version) and a `<dl>` of
aligned figures: sites, per 100k, missing count, farthest seat (brick when over the threshold)
and, when present, a «χωρίς μέτρηση» count.

**CoverageList** `{ data, selection, sort, onSort, selectedKey, onSelect }`. One row per
specialty (place mode) or per prefecture (specialty mode), six columns: name (+ seat), the
four-slot sector mark, count, per 100k, soonest date («Τρί 29 Σεπ +3 ημ.»), nearest km. In the
national view the count column adds «σε N/51» and the distance column becomes the number of
seats over the threshold. Header buttons call `onSort` and expose `aria-sort`. **Rows expand in
place**: a click calls `onSelect(key)`; the row whose key equals `selectedKey` is open
(`aria-expanded`) and shows the sites by sector (name, town, «θέση περίπου» / «χωρίς θέση», and
for public sites the soonest date for that specialty, relative to the scan), capped at eight per
sector with «και N ακόμη». When the prefecture has none it shows «Δεν καταγράφεται σημείο» and
the nearest one with its straight-line km from the seat (brick over the threshold, hatched when
it could not be computed). Clicking the open row calls **`onSelect(null)`** to collapse it, so
`onSelect` is `(key: string | null) => void`; the assembler just assigns
`selectedKey = key`. One row is open at a time. Below 720px the header disappears, per-100k is
hidden, the row folds into two lines and the detail stacks.

**AccessMap** `{ data, selection, selectedKey, onSelect }`. Unchanged: Leaflet in `onMount`
(SSR-safe), providers as sector squares (dashed ring when `approx`), seats as open circles, a
dashed seat → nearest line with the km for the selected cell. Desktop only in the new page
order.

**CoverageMatrix** `{ data, sectors, metric, onMetric, onSelect }`. Specialties × prefectures
with sticky headers on both axes, one metric at a time (segmented control). Inline: 22px cells
with no digits; the readout line describes the hovered/focused cell and each cell carries it as
`aria-label`. **«Μεγάλη προβολή»** opens the same table in a full-viewport `role="dialog"`
(`aria-modal`, Escape closes, Tab is trapped inside, focus goes to the close button and returns
to the opener, body scroll locked while open, scrollable both ways, sticky labels) with 30px
cells that show their digits: count, whole km, rate with one decimal (whole above 10), or days
from the scan for dates; dark cells switch to paper text. Under 720px the inline table is hidden
behind a one-line hint and only the big view is offered (horizontal scroll inside it is fine).
Colour: `color-mix` of the card with `--accent-d` (count, per 100k) or `--ink` (distance, date:
darker = worse), square-root scale capped at the 95th percentile. Zero is paper; unknown is
hatched; a flagged distance gets a brick underline. Header clicks sort; the corner resets.

**SpecialtyCoverageBars** `{ data, sectors, selectedSpecialtyId, onSelect }`. One bar per
specialty: prefectures with ≥1 site in `sectors`, out of 51, gaps first; eight rows, «Όλες οι
ειδικότητες» expands; rows call `onSelect(specialtyId)`. CSV export.

**CoverageRanking** `{ data, selection, onSelect }`. The ten prefectures with the lowest rate for
`selection.specialtyId` in `selection.sectors`; zero ties broken by population, said in the
footnote. Rows call `onSelect(prefectureId)`. Quiet prompt without a specialty.

**ScanChangeChart** `{ report }`. Paired bars per weekly interval (added / «δεν επιστρέφονται
πια»), latest first; a week opens to list its records. With fewer than two complete scans: «Η
σύγκριση ξεκινά από την επόμενη εβδομάδα».

**MethodologyBlock** `{ report }`. A `<details>`: source and the list of scans, sectors, what a
«σημείο παροχής» is, the hospital floor when `unitSpecialtiesComplete` is false, ELSTAT
denominators, straight-line distances and the threshold, repaired pins, «removed» ≠ closed,
version. Place it last.

**SnapshotNotice** `{ scan, populationYear, distanceFlagKm }`. One line + folded caveats. Optional
in the new order (the lede and the methodology cover it); still renders.

## Kept but not mounted

**ExplorerControls** `{ data, selection, onChange, compare?, onCompare? }`: tabs, the two
Comboboxes, sector chips. **EvidencePanel** `{ data, key, sectors, onClose }`: the providers
behind a cell as a fixed side panel / bottom sheet (replaced by the list's inline rows).
**PinErrorTracker** `{ report }`: the pin-error ledger and the link to `/atlas/pin-errors.csv`;
the CSV report stays elsewhere, the tracker is off the page.
