<script lang="ts">
	import { resolve } from '$app/paths';
	import * as examples from './examples.js';
</script>

<svelte:head>
	<title>Collaboration · blokki</title>
</svelte:head>

<h1>Collaboration</h1>

<p>
	With collaboration on, several people edit one document in real time. blokki binds the Editor to a
	Yjs document, the Shared Document, through Lexical's Yjs binding. The Shared Document is then the
	source of truth: the Editor takes its content from it and ignores the <code>content</code> option.
</p>

<h2>Install</h2>

<pre><code>{examples.install}</code></pre>

<p>
	Both packages are optional peer dependencies. Only <code>blokki/collab</code> imports them, so an app
	without collaboration does not need them.
</p>

<h2>Connect an Editor</h2>

<pre><code>{examples.connect}</code></pre>

<p>
	The app creates the Y.Doc and the provider, which must implement the <code>Provider</code>
	interface of <code>@lexical/yjs</code>. blokki never constructs providers or persistence. The
	Editor connects the provider when it mounts and disconnects it when it unmounts.
</p>

<table>
	<thead>
		<tr><th>Option</th><th>Description</th></tr>
	</thead>
	<tbody>
		<tr><td><code>doc</code></td><td>The Shared Document.</td></tr>
		<tr
			><td><code>provider</code></td><td
				>The provider that syncs <code>doc</code> with other peers.</td
			></tr
		>
		<tr>
			<td><code>user</code></td>
			<td>
				The local user, as other people see them: a stable <code>id</code>, a <code>name</code>
				shown next to their caret, and an optional CSS <code>color</code>. The default color is
				derived from <code>id</code>.
			</td>
		</tr>
	</tbody>
</table>

<h2>Seeding a new document</h2>

<p>
	An Editor never writes initial content into a Shared Document. If two clients connected to an
	empty document at the same time and both did, the content would appear twice. Instead, the client
	that creates a document seeds it once, before anyone else joins:
</p>

<pre><code>{examples.seed}</code></pre>

<ul>
	<li>
		Pass the Extensions of the Editors that will open the document. Seeding throws when the Snapshot
		contains a node type that those Extensions lack, because a Shared Document cannot hold
		Unsupported Blocks.
	</li>
	<li>Seeding throws when the Shared Document already has content.</li>
	<li>It records the Schema Version of each Extension in the Shared Document.</li>
	<li>It runs without a DOM, so a server or a script can seed in Node too.</li>
	<li>It is not an undo step for any Editor.</li>
</ul>

<p>An Editor connected to an empty Shared Document stays empty until content arrives.</p>

<h2>Undo</h2>

<p>
	With collaboration on, undo and redo use a Yjs undo manager that reverts only the local user's
	changes, never another person's. Do not add Lexical's <code>HistoryExtension</code> to the same Editor:
	the two Extensions conflict, and mounting the Editor fails.
</p>

<h2>Schema Versions</h2>

<p>
	A Shared Document cannot be migrated like a Snapshot, because peers edit it concurrently. It
	records the Schema Version of each Extension instead. A client raises a recorded version, or adds
	the versions of its own Extensions, the first time it writes to the document.
</p>

<p>A client opens the Shared Document read-only and calls <code>onUpgradeRequired</code> when:</p>

<ul>
	<li>
		its code is older than a recorded Schema Version, with a <code>NewerSchemaVersionError</code>,
	</li>
	<li>it lacks an Extension that the document uses, with a <code>MissingExtensionError</code>.</li>
</ul>

<p>
	It checks when it loads the document and whenever the recorded versions change, so a connected
	client with older code switches to read-only as soon as a newer client writes. A read-only client
	never writes to the Shared Document, and its undo and redo do nothing. It holds only the part of
	the document that it can represent, so <code>editor.getSnapshot()</code> throws the same error.
</p>

<p>
	Inside a Shared Document, Extensions change their node types only in additive ways, as described
	in <a href={resolve('/docs/extensions')}>Writing Extensions</a>. Any other change needs a Document
	Upgrade: export a Snapshot, and seed a new Shared Document from it with the new Extensions, which
	runs their Migrations. Edits made offline to the old document do not carry over.
</p>

<h2>Presence</h2>

<p>
	Other people's carets appear in the Editor with their name and color. The Editor removes the local
	user's presence at once when it unmounts or when the browser hides the page, for example when the
	tab closes. Other people never see a caret that belongs to nobody.
</p>
