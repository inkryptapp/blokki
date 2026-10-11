<script lang="ts">
	import { resolve } from '$app/paths';
	import * as examples from './examples.js';
</script>

<svelte:head>
	<title>Snapshots · blokki</title>
</svelte:head>

<h1>Snapshots</h1>

<p>
	A Snapshot is a document as JSON, for storing it when collaboration is off. It wraps Lexical's
	serialized state with a schema map, which records the Schema Version of each Extension whose node
	types the document uses:
</p>

<pre><code>{examples.shape}</code></pre>

<h2>Save and load</h2>

<pre><code>{examples.saveAndLoad}</code></pre>

<p>
	<code>editor.getSnapshot()</code> returns the current document. It also works before the Editor mounts
	and after it unmounts. The keys of the schema map are sorted, so the same content always exports to
	the same JSON.
</p>

<p>
	<code>parseSnapshot</code> checks that a value read from storage has the shape of a Snapshot and
	throws an <code>InvalidSnapshotError</code> when it does not. The nodes inside are checked when
	the Snapshot loads: when Lexical cannot parse them, mounting the Editor throws an
	<code>InvalidSnapshotError</code>.
</p>

<h2>In Node</h2>

<p>
	<code>blokki/core</code> imports no Svelte code and needs no DOM, so Snapshots can be processed in
	Node, in a worker, or in tests. <code>createHeadlessEditor</code> builds a Lexical editor without a
	DOM. Pass it the same Extensions as the app's Editor, so that both read and write the same node types.
</p>

<pre><code>{examples.headless}</code></pre>

<h2>Schema Versions and Migrations</h2>

<p>
	Every Extension that defines node types declares a Schema Version. When an Extension changes the
	JSON of its nodes, it raises its version and adds a Migration: a pure function that upgrades the
	serialized document from the previous version. On import, blokki runs every pending Migration of
	each enabled Extension, in order, before Lexical parses the document. The stored Snapshot does not
	change until the app saves the next export, which records the new versions. Lexical's own
	<code>version</code> field on each node is not used.
	<a href={resolve('/docs/extensions')}>Writing Extensions</a> shows how to declare a Schema Version and
	its Migrations.
</p>

<h2>Documents from newer code</h2>

<p>
	blokki never downgrades a document. A Snapshot can use a newer Schema Version than the app's code,
	for example when a newer release of the app saved it. The Editor then:
</p>

<ul>
	<li>shows the document read-only, as far as the older code can parse it,</li>
	<li>
		sets <code>editor.upgradeRequired</code> to a <code>NewerSchemaVersionError</code> and calls the
		<code>onUpgradeRequired</code> option with it, once,
	</li>
	<li>
		returns the original Snapshot from <code>getSnapshot()</code>, so saving it again loses nothing.
	</li>
</ul>

<pre><code>{examples.upgradeRequired}</code></pre>

<p>
	The headless <code>importSnapshot</code> throws the <code>NewerSchemaVersionError</code> instead.
	It extends <code>UpgradeRequiredError</code>, the base class of every error that means the
	document needs newer code.
</p>

<h2>Unsupported Blocks</h2>

<p>
	A Snapshot can contain nodes whose Extension the Editor does not enable, for example after the app
	turned a feature off. Lexical cannot load an unknown node type, so the import replaces each such
	Block with an Unsupported Block: a read-only placeholder that keeps the node's JSON. An unknown
	node inside a Block, such as an inline mention, gets an inline placeholder. Export writes the
	original JSON back unchanged, and the schema map keeps the Extension's entry. Turning a feature
	off therefore never deletes content.
</p>

<p>
	A placeholder renders as a <code>div</code> or a <code>span</code> with a
	<code>data-blokki-unsupported</code> attribute that holds the original node type, so the app can style
	it.
</p>

<p>
	Shared Documents have no Unsupported Blocks. A client that lacks an Extension the document uses
	opens it read-only, as described in <a href={resolve('/docs/collaboration')}>Collaboration</a>.
</p>
