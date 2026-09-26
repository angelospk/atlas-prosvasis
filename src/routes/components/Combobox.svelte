<script module lang="ts">
	/** One option of a picker; `search` is the folded text the query is matched against. */
	export interface ComboOption {
		id: number | null;
		label: string;
		sub: string | null;
		search: string;
	}
</script>

<script lang="ts">
	// A searchable single-value picker (ARIA combobox: input + listbox). Shared by the
	// SelectionBar and ExplorerControls. Controlled: the chosen id comes in as `value`, every
	// pick goes out through `onPick`; only the open state, the query and the cursor live here.
	import { fold } from './format';

	let {
		id,
		label,
		options,
		value,
		onPick,
		placeholder = '',
		compact = false
	}: {
		/** Unique per page: used for the listbox id and option ids. */
		id: string;
		label: string;
		options: ComboOption[];
		value: number | null;
		onPick: (id: number | null) => void;
		placeholder?: string;
		/** Smaller control for the sticky bar. */
		compact?: boolean;
	} = $props();

	const listId = $derived(`${id}-list`);
	const valueLabel = $derived(options.find((o) => o.id === value)?.label ?? '');

	let open = $state(false);
	let query = $state('');
	let cursor = $state(0);
	let root = $state<HTMLElement | null>(null);

	const filtered = $derived.by(() => {
		const q = fold(query.trim());
		if (!q) return options;
		return options.filter((o) => o.search.includes(q));
	});

	function show() {
		if (!open) {
			open = true;
			query = '';
			cursor = Math.max(0, options.findIndex((o) => o.id === value));
		}
	}
	function hide() {
		open = false;
		query = '';
	}
	function pick(o: ComboOption) {
		onPick(o.id);
		hide();
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			hide();
			(e.currentTarget as HTMLElement).blur();
			return;
		}
		if (!open) {
			if (e.key === 'ArrowDown' || e.key === 'Enter') show();
			return;
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			cursor = Math.min(filtered.length - 1, cursor + 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			cursor = Math.max(0, cursor - 1);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const o = filtered[cursor];
			if (o) pick(o);
		}
	}
	function onInput(e: Event) {
		show();
		query = (e.currentTarget as HTMLInputElement).value;
		cursor = 0;
	}
	// Blur fires before the option's click: wait a tick so the click can land.
	function onBlur() {
		setTimeout(() => {
			if (open && !root?.contains(document.activeElement)) hide();
		}, 0);
	}
</script>

<label class="field" class:compact bind:this={root}>
	<span class="flabel">{label}</span>
	<input
		type="text"
		role="combobox"
		autocomplete="off"
		spellcheck="false"
		aria-expanded={open}
		aria-controls={listId}
		aria-autocomplete="list"
		aria-activedescendant={open && filtered[cursor] ? `${listId}-${cursor}` : undefined}
		{placeholder}
		value={open ? query : valueLabel}
		onfocus={show}
		onclick={show}
		oninput={onInput}
		onkeydown={onKey}
		onblur={onBlur}
	/>
	{#if open}
		<ul class="list" id={listId} role="listbox">
			{#each filtered as o, i (o.id ?? 'all')}
				<!-- Keyboard lives on the combobox input (ARIA combobox pattern); options are pointer targets. -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<li
					id={`${listId}-${i}`}
					role="option"
					aria-selected={i === cursor}
					class:cur={i === cursor}
					class:chosen={o.id === value}
					onmousedown={(e) => e.preventDefault()}
					onclick={() => pick(o)}
				>
					<span>{o.label}</span>
					{#if o.sub}<span class="sub">{o.sub}</span>{/if}
				</li>
			{:else}
				<li class="empty">Δεν βρέθηκε τίποτα</li>
			{/each}
		</ul>
	{/if}
</label>

<style>
	.field {
		position: relative;
		display: grid;
		gap: 0.3rem;
		min-width: 0;
	}
	.flabel {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--ink-2);
	}
	input {
		min-height: 44px;
		height: 44px;
		border: 1px solid var(--line-2);
		background: var(--card);
		border-radius: var(--r-ctl);
		padding: 0 12px;
		font: inherit;
		font-size: 16px;
		color: var(--ink);
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		text-overflow: ellipsis;
	}
	input::placeholder {
		color: var(--ink-3);
	}
	input:focus {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
		border-color: var(--accent);
	}
	.compact {
		gap: 0.15rem;
	}
	.compact .flabel {
		font-size: 0.7rem;
	}
	.compact input {
		min-height: 44px;
		height: 44px;
		font-size: 16px;
		padding: 0 10px;
	}
	.list {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		z-index: 30;
		margin: 4px 0 0;
		padding: 4px 0;
		list-style: none;
		max-height: min(300px, 50vh);
		width: 100%;
		min-width: 0;
		max-width: 100%;
		box-sizing: border-box;
		overflow-y: auto;
		overflow-x: hidden;
		background: var(--card);
		border: 1px solid var(--line-2);
		border-radius: 10px;
		box-shadow: var(--shadow);
	}
	.list li {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.5rem 0.8rem;
		font-size: 0.93rem;
		cursor: pointer;
		white-space: normal;
		overflow-wrap: anywhere;
	}
	.list li.cur {
		background: var(--paper-2);
	}
	.list li.chosen {
		font-weight: 600;
	}
	.list li.empty {
		color: var(--ink-3);
		cursor: default;
	}
	.sub {
		color: var(--ink-3);
		font-size: 0.82rem;
	}
</style>
