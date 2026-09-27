<script lang="ts">
	// The site mark: the same drawing as static/favicon.svg.
	let { size = 28, label = '' }: { size?: number; label?: string } = $props();
</script>
<svg class="atlas-mark" viewBox="0 0 64 64" width={size} height={size} role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : 'true'}><path d="M32 1A31 31 0 0 1 63 32v27a4 4 0 0 1-4 4H32A31 31 0 0 1 32 1Z" fill="#164e78" stroke="#9bc2db" stroke-width="2" /><text x="31" y="45" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="40" fill="#fff">α</text></svg>
<style>.atlas-mark { flex: none; display: block; }</style>
