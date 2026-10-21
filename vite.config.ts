import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
	// The one source of the version the footer shows: package.json.
	define: { __ATLAS_VERSION__: JSON.stringify(pkg.version) },
	plugins: [
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
			},
			// Fully prerendered: GitHub Pages serves files, there is no server.
			adapter: adapter({ strict: true })
		})
	]
});
