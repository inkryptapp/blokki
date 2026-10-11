<script lang="ts">
	import { resolve } from '$app/paths';
	import * as examples from './examples.js';
</script>

<svelte:head>
	<title>Writing Extensions · blokki</title>
</svelte:head>

<h1>Writing Extensions</h1>

<p>
	Every blokki Extension is a Lexical extension, made with <code>defineExtension</code> from
	<code>lexical</code>. blokki has no extension type of its own, so everything that Lexical's
	extension API offers works, and any Lexical extension can be added to an Editor. The
	<code>extensions</code> option of <code>createEditor</code> takes Extensions as they are, or
	configured with <code>configExtension</code>.
</p>

<pre><code>{examples.enable}</code></pre>

<h2>Schema Versions</h2>

<p>
	An Extension that defines node types declares a Schema Version with <code>declareSchema</code>,
	added to its dependencies. The name is the Extension's key in the schema map of a
	<a href={resolve('/docs/snapshots')}>Snapshot</a>.
</p>

<pre><code>{examples.declare}</code></pre>

<h2>Migrations</h2>

<p>
	When the JSON of a node type changes, raise the Schema Version and add a Migration for it. The
	<code>migrations</code> are keyed by the version that each one produces:
	<code>migrations[2]</code>
	upgrades version 1 to version 2. Every version from 2 up to the current one needs a Migration.
</p>

<p>
	A Migration receives the serialized root node in the previous version's format and returns it in
	the next version's format. It must be pure and must not change its input. It may change any node
	in the document, including node types that other Extensions define.
</p>

<pre><code>{examples.migration}</code></pre>

<h2>Block types</h2>

<p>
	A node type becomes a Block type when its Extension registers it with <code>BlockIdExtension</code
	>. A node of that type that is a direct child of the root then gets a Block ID and follows the
	<a href={resolve('/docs/block-ids')}>editing rules</a>.
</p>

<pre><code>{examples.blockType}</code></pre>

<h2>Node types in a Shared Document</h2>

<p>
	Peers edit a <a href={resolve('/docs/collaboration')}>Shared Document</a> concurrently, so it cannot
	be migrated like a Snapshot. Inside a Shared Document, change a node type only in additive ways: add
	an optional property with a default, or add a new node type. Raise the Schema Version for such a change
	as usual, so that clients with older code switch to read-only once a newer client writes. Its Migration
	can return the root unchanged. Any other change needs a Document Upgrade.
</p>

<p>
	<code>@lexical/yjs</code> syncs a node's plain properties only when the node's constructor
	initializes them. The binding creates each node type once with no arguments and syncs the
	properties that this instance has. Give every constructor parameter a default, and assign every
	property in the constructor, even when its value is <code>null</code>. Node state made with
	Lexical's <code>createState</code> syncs too.
</p>

<pre><code>{examples.nodeConstructor}</code></pre>
