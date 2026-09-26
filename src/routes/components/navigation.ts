export const SECTION_IDS = {
	map: 'atlas-map',
	list: 'atlas-list',
	waits: 'atlas-waits',
	details: 'atlas-details'
} as const;

export type Section = keyof typeof SECTION_IDS;

export const SECTION_ORDER: readonly Section[] = ['map', 'list', 'waits', 'details'];

export interface SectionStart {
	section: Section;
	top: number;
}

/**
 * Pick the last section start above the sticky reading band. Before the first start,
 * the first section remains active; at the document bottom the final section wins.
 * This is intentionally DOM-free so the scroll-spy policy can be tested on the server.
 */
export function calculateActiveSection(
	starts: readonly SectionStart[],
	bandTop: number,
	atBottom = false
): Section {
	if (atBottom) return SECTION_ORDER[SECTION_ORDER.length - 1];
	const ordered = SECTION_ORDER
		.map((section) => starts.find((start) => start.section === section))
		.filter((start): start is SectionStart => start != null)
		.sort((a, b) => a.top - b.top);
	return ordered.filter((start) => start.top <= bandTop).at(-1)?.section ?? ordered[0]?.section ?? 'map';
}

export const activeSectionFromStarts = calculateActiveSection;
