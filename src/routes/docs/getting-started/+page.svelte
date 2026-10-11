<script lang="ts">
	import { resolve } from '$app/paths';
	import * as examples from './examples.js';
</script>

<svelte:head>
	<title>Getting started · blokki</title>
</svelte:head>

<h1>Getting started</h1>

<p>
	blokki is a block-based rich-text editor for Svelte 5, built on
	<a href="https://lexical.dev">Lexical</a>. It is in early development and not on npm yet. These
	pages describe the code on the main branch.
</p>

<h2>Install</h2>

<p>Install blokki together with its peer dependencies:</p>

<pre><code>{examples.install}</code></pre>

<p>
	blokki needs Svelte 5.29 or later. It pins Lexical to one minor version, currently 0.52, so that
	your app and blokki share one copy of Lexical. Two copies in one app break Lexical's node
	registration. Collaboration needs two more packages, described in
	<a href={resolve('/docs/collaboration')}>Collaboration</a>.
</p>

<p>The package has three entry points:</p>

<table>
	<thead>
		<tr><th>Import</th><th>Contents</th></tr>
	</thead>
	<tbody>
		<tr><td><code>blokki</code></td><td>Svelte components and the Editor API.</td></tr>
		<tr>
			<td><code>blokki/core</code></td>
			<td>Headless document functions. They run in Node and import no Svelte code.</td>
		</tr>
		<tr><td><code>blokki/collab</code></td><td>Real-time collaboration through Yjs.</td></tr>
	</tbody>
</table>

<h2>Show an Editor</h2>

<pre><code>{examples.basic}</code></pre>

<p>
	<code>createEditor(options)</code> only stores configuration. It touches no DOM and builds no
	Lexical editor, so a component script can call it during SSR. <code>&lt;EditorContent&gt;</code>
	builds the Lexical editor when it mounts in the browser. It passes other attributes, such as
	<code>class</code> and <code>aria-label</code>, to the editable element. That element has the
	<code>textbox</code> role, so give it an accessible name.
</p>

<p><code>createEditor</code> takes these options, all optional:</p>

<table>
	<thead>
		<tr><th>Option</th><th>Description</th></tr>
	</thead>
	<tbody>
		<tr>
			<td><code>extensions</code></td>
			<td>
				Lexical extensions to enable in addition to rich-text paragraph editing. See
				<a href={resolve('/docs/extensions')}>Writing Extensions</a>.
			</td>
		</tr>
		<tr>
			<td><code>content</code></td>
			<td>
				The document to start with, as a <a href={resolve('/docs/snapshots')}>Snapshot</a>. Without
				it, the Editor starts with one empty paragraph.
			</td>
		</tr>
		<tr>
			<td><code>onUpgradeRequired</code></td>
			<td>
				Called when the document needs newer code than the app runs. See
				<a href={resolve('/docs/snapshots')}>Snapshots</a>.
			</td>
		</tr>
		<tr>
			<td><code>anchorLink</code></td>
			<td>
				Builds the URL of a link to one Block. See <a href={resolve('/docs/block-ids')}>Block IDs</a
				>.
			</td>
		</tr>
	</tbody>
</table>

<h2>Server rendering</h2>

<p>
	During SSR, <code>&lt;EditorContent&gt;</code> renders an empty element that cannot be edited. To
	keep the page from jumping when the Editor mounts, pass a <code>skeleton</code> snippet that matches
	the document's layout. The snippet renders in place of the element on the server and until the component
	mounts in the browser.
</p>

<pre><code>{examples.skeleton}</code></pre>

<p>
	No blokki module has side effects when it is imported, so importing blokki during SSR is safe.
</p>

<h2>Several Editors on one page</h2>

<p>
	Each Editor keeps its own state, so a page can show as many as it needs, and typing in one never
	changes another. Show each Editor in one <code>&lt;EditorContent&gt;</code> at a time. Mounting an Editor
	that is already mounted throws.
</p>

<h2>Unmounting</h2>

<p>
	When <code>&lt;EditorContent&gt;</code> unmounts, it disposes the Lexical editor. That removes
	every listener, observer, and DOM node that the Editor added. The Editor keeps the document:
	<code>editor.getSnapshot()</code> still returns it, and the next
	<code>&lt;EditorContent&gt;</code> that shows the Editor continues from it.
</p>

<h2>The Lexical editor</h2>

<p>
	<code>editor.lexical</code> is the Lexical editor behind an Editor, for anything that blokki does
	not wrap. It exists while an <code>&lt;EditorContent&gt;</code> shows the Editor, and each mount creates
	a new one. Reading it while the Editor is not mounted throws.
</p>

<pre><code>{examples.lexical}</code></pre>

<aside>
	<code>editor.lexical</code> follows Lexical's versioning and is outside the semver promise of blokki.
	A blokki release that upgrades Lexical can change it in any way that Lexical changes.
</aside>
