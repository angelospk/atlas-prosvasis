// The one DOM helper the export buttons share: hand a Blob to the browser as a download.
// Kept out of format.ts so that file stays pure (no window, no document).

export function downloadBlob(name: string, blob: Blob): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = name;
	a.rel = 'noopener';
	document.body.appendChild(a);
	a.click();
	a.remove();
	// Let the click consume the URL before revoking it.
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(name: string, text: string, mime = 'text/csv;charset=utf-8'): void {
	downloadBlob(name, new Blob([text], { type: mime }));
}
