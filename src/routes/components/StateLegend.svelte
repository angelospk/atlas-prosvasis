<script lang="ts">
	// The three states of a specialty, with the same symbols on both maps: the prefecture
	// area (solid, hatched, empty) and the site point (filled, hollow circle). Shape and
	// pattern carry the difference, not a new colour, so it reads without colour vision too.
	let { publicOnly = true }: { publicOnly?: boolean } = $props();
</script>

<ul class="state-legend" aria-label="Υπόμνημα καταστάσεων">
	<li><span class="area on" aria-hidden="true"></span><span class="pt on" aria-hidden="true"></span>ηλεκτρονικό ραντεβού</li>
	<li><span class="area reg" aria-hidden="true"></span><span class="pt off" aria-hidden="true"></span>δηλωμένο ιατρείο, χωρίς ηλεκτρονικό ραντεβού</li>
	<li><span class="area none" aria-hidden="true"></span><span class="pt blank" aria-hidden="true"></span>καμία {publicOnly ? 'δημόσια ' : ''}δομή στον κατάλογο</li>
</ul>

<style>
	.state-legend {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.3rem;
		font-size: 0.8rem;
		color: var(--ink-2);
	}
	li {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.area {
		display: inline-block;
		width: 18px;
		height: 13px;
		border-radius: 2px;
		box-sizing: border-box;
		border: 1px solid var(--line-2);
	}
	/* Same values as PrefectureChoropleth (inline there, for the PNG export). */
	.area.on {
		background: #5894b8;
		border-color: #5894b8;
	}
	.area.reg {
		background: repeating-linear-gradient(-45deg, #5894b8 0 2px, #edf3f6 2px 5px);
		border-color: #5894b8;
	}
	.area.none {
		background: #edf3f6;
		border-color: #a34418;
	}
	.pt {
		display: inline-block;
		width: 11px;
		height: 11px;
		border-radius: 50%;
		box-sizing: border-box;
		border: 2px solid #24638e;
	}
	.pt.on {
		background: #24638e;
	}
	.pt.off {
		background: #ffffff;
	}
	.pt.blank {
		border-color: transparent;
	}
</style>
