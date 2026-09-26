// Coverage atlas: what the Ministry's e-ραντεβού directory offers, per prefecture and per
// specialty. Built offline by scripts/ministry-scan/coverage.py from a full scan; the page
// only reads it. All counts are "σημεία παροχής" (bookable sites), not doctors or capacity.

export type Sector = 'esy' | 'pfy' | 'eopyy' | 'private';
export const SECTORS: Sector[] = ['esy', 'pfy', 'eopyy', 'private'];
export const SECTOR_LABEL: Record<Sector, string> = {
	esy: 'Νοσοκομεία ΕΣΥ',
	pfy: 'Κέντρα Υγείας / ΠΦΥ',
	eopyy: 'Συμβεβλημένοι ΕΟΠΥΥ',
	private: 'Ιδιώτες'
};

export interface ScanMeta {
	/** ISO date/time of the scan. Dates are relative to this, never to "today". */
	at: string;
	source: string;
	units: number;
	doctors: number;
	errors: number;
	providersWithoutPin: number;
	providersWithoutPrefecture: number;
	/** false = the scan kept only one specialty per hospital/centre (counts are a floor). */
	unitSpecialtiesComplete: boolean;
}

export interface Prefecture {
	/** Ministry prefecture id (old νομός, 1–51). */
	id: number;
	/** Nominative, as people say it: «Σέρρες», «Έβρος». */
	name: string;
	/** Genitive for «Ν. Σερρών». */
	genitive: string;
	/** ELSTAT 2021 residents. */
	population: number;
	/** Capital: the origin of «nearest provider» distances. */
	seat: { label: string; lat: number; lon: number };
}

export interface Specialty {
	id: number;
	/** Display name with accents, e.g. «Καρδιολόγος» (unknown ones stay uppercase). */
	name: string;
}

export interface Provider {
	id: string;
	sector: Sector;
	name: string;
	city: string;
	address: string;
	prefectureId: number | null;
	/** null = no trustworthy position (excluded from distances, listed as such). */
	lat: number | null;
	lon: number | null;
	/** Ministry pin was missing/wrong: this is the town centre. */
	approx: boolean;
	specialtyIds: number[];
	/** Hospitals/centres only: first free appointment at scan time, ISO (any specialty). */
	firstDate: string | null;
	/** First free appointment per specialty id (as string key), ISO. Prefer this. */
	firstDates?: Record<string, string>;
}

export type SectorCounts = Record<Sector, number>;

/** One prefecture × specialty. */
export interface CoverageCell {
	prefectureId: number;
	specialtyId: number;
	counts: SectorCounts;
	/** Providers per 100,000 residents (all sectors). */
	per100k: number;
	/** Soonest first-free date among this prefecture's providers (all sectors), ISO, or null. */
	earliestDate: string | null;
	/** Seat → nearest provider anywhere in Greece (km), null = none located nationwide. */
	nearestKm: number | null;
	nearestProviderId: string | null;
	/** Same, public (ΕΣΥ + ΠΦΥ) only. */
	nearestPublicKm: number | null;
	nearestPublicProviderId: string | null;
}

export interface AtlasData {
	scan: ScanMeta;
	populationYear: number;
	/** «Πλησιέστερος πάροχος > N χλμ» screening threshold (not a clinical standard). */
	distanceFlagKm: number;
	prefectures: Prefecture[];
	specialties: Specialty[];
	providers: Provider[];
	cells: CoverageCell[];
}

export type Mode = 'place' | 'specialty';
export type Metric = 'count' | 'per100k' | 'nearestKm' | 'earliestDate';

/** What the explorer is looking at. place = a prefecture id (null = all Greece). */
export interface Selection {
	mode: Mode;
	prefectureId: number | null;
	specialtyId: number | null;
	sectors: Sector[];
}

// ---- weekly continuity: history, pin-error ledger, headline findings ----

export interface ScanSummary {
	/** Scan date "YYYY-MM-DD" (its id). */
	id: string;
	at: string;
	units: number;
	doctors: number;
	/** Only complete scans are compared or published. */
	complete: boolean;
}

/** One site × specialty record that appeared/disappeared between two scans. */
export interface ChangeItem {
	providerId: string;
	name: string;
	sector: Sector;
	prefectureId: number | null;
	specialtyId: number;
}

/** Difference between two consecutive complete scans. «Removed» = no longer returned by
 *  the directory, never "closed". Items are capped at 200 per side; counts are exact. */
export interface ScanDelta {
	from: string;
	to: string;
	comparable: boolean;
	added: number;
	removed: number;
	addedItems: ChangeItem[];
	removedItems: ChangeItem[];
}

export type PinReason = 'zero' | 'abroad' | 'wrong_city';

/** A Ministry record whose map pin is wrong, tracked across weekly scans. */
export interface PinIssue {
	providerId: string;
	name: string;
	sector: Sector;
	city: string;
	prefectureId: number | null;
	/** zero = (0,0) → Gulf of Guinea; abroad = outside Greece; wrong_city = >40 km from its town. */
	reason: PinReason;
	/** open = still wrong in the latest scan; fixed = seen correct later; unverified = record vanished. */
	status: 'open' | 'fixed' | 'unverified';
	firstSeen: string;
	lastSeen: string;
	/** First scan where it was seen correct (the fix happened between two scans). */
	fixedSeen: string | null;
	/** Days from first seen to the latest scan (open) or to fixedSeen. */
	daysOpen: number;
	/** It was fixed once and came back. */
	recurred: boolean;
}

/** A template-generated headline; `selection` (partial) opens the evidence in the explorer. */
export interface Finding {
	id: string;
	text: string;
	selection: Partial<Selection> | null;
	evidenceKey: string | null;
}

/** GeoJSON of the 51 prefectures (feature.properties: { id: number; name: string }). */
export interface PrefectureBoundaries {
	type: 'FeatureCollection';
	features: {
		type: 'Feature';
		properties: { id: number; name: string };
		geometry: { type: 'Polygon'; coordinates: number[][][] } | { type: 'MultiPolygon'; coordinates: number[][][][] };
	}[];
}

/** AtlasData plus the weekly layers (all present from coverage.py v2 on). */
export interface AtlasReport extends AtlasData {
	scans: ScanSummary[];
	methodologyVersion: string;
	history: ScanDelta[];
	pinIssues: PinIssue[];
	findings: Finding[];
}
