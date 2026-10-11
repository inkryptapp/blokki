<script lang="ts">
	import { resolve } from '$app/paths';
	import * as examples from './examples.js';
</script>

<svelte:head>
	<title>Block IDs · blokki</title>
</svelte:head>

<h1>Block IDs</h1>

<p>
	Every Block has a Block ID from the moment it is created. Links and tables of contents point at
	Blocks through their IDs, so an ID stays with the content that a user thinks of as "that Block"
	through everyday editing. Paragraphs are the only Blocks so far. Extensions can register more
	Block types, as described in <a href={resolve('/docs/extensions')}>Writing Extensions</a>.
</p>

<p>
	A Block ID is 10 random characters from a URL-safe alphabet of letters, digits, <code>-</code>,
	and <code>_</code>, about 60 bits. It is unique within one document, not across documents. It is
	stored as Lexical node state, so it survives a Snapshot and syncs through Yjs. A Snapshot stores
	it under the node's <code>$</code> key:
</p>

<pre><code>{examples.stored}</code></pre>

<h2>In the page</h2>

<p>
	The Editor renders each Block ID as a <code>data-block-id</code> attribute on the Block's element,
	never as an <code>id</code>. An <code>id</code> could collide with the app's own ids, or with a second
	Editor that shows the same document. The attribute also works as a style hook:
</p>

<pre><code>{examples.scrollMargin}</code></pre>

<h2>Anchor Links</h2>

<p>
	An Anchor Link is a URL that points at one Block. <code>editor.getAnchorLink(blockId)</code>
	builds it with the <code>anchorLink</code> option, which defaults to <code>#</code> followed by the
	Block ID.
</p>

<pre><code>{examples.anchorLink}</code></pre>

<p>
	<code>editor.scrollToBlock(blockId)</code> scrolls a Block into view. It returns
	<code>false</code> when the Editor is not mounted or has no Block with that ID.
</p>

<pre><code>{examples.scrollToBlock}</code></pre>

<p>
	Inside a Lexical read or update, <code>$getBlockId(node)</code> from <code>blokki/core</code>
	returns the Block ID of a node, or <code>null</code> when it has none.
</p>

<pre><code>{examples.readBlockId}</code></pre>

<h2>Editing rules</h2>

<p>The Editor applies these rules, so that a Block ID stays with its content:</p>

<ol>
	<li>
		Enter in the middle or at the end of a Block: the original keeps its ID, and the new Block below
		gets a new one.
	</li>
	<li>
		Enter at the very start of a non-empty Block: the new empty Block appears above with a new ID,
		and the content keeps its ID. Adding a blank line above a Block therefore keeps every link to
		the Block working.
	</li>
	<li>
		Backspace at the start of a Block merges it into the Block above, which keeps its ID. When the
		Block above is empty, the empty Block is removed instead, and the lower Block keeps its ID.
	</li>
	<li>Turning a Block into another type keeps its ID.</li>
	<li>Moving a Block keeps its ID.</li>
	<li>A duplicated Block, and every Block inside it, gets a new ID.</li>
	<li>
		A pasted Block keeps its ID only if no Block in the document already has it. Cut and paste
		therefore keeps Anchor Links working, and copy and paste creates new IDs.
	</li>
	<li>Undoing a deletion restores the original ID.</li>
	<li>
		When two Blocks share an ID, for example after concurrent edits or an import, the one later in
		document order gets a new ID.
	</li>
</ol>
