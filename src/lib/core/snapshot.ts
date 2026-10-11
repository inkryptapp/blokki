import {
	$createParagraphNode,
	$getRoot,
	HISTORY_MERGE_TAG,
	type EditorState,
	type LexicalEditor,
	type SerializedRootNode
} from 'lexical';
import { NewerSchemaVersionError, schemaOf, type SchemaMap } from './schema.js';
import { usesSharedDocument } from './shared-document.js';

/**
 * The complete content of a document in blokki's portable, versioned format: Lexical's serialized
 * root node, wrapped with the schema map of the Extensions that defined its node types.
 *
 * ```json
 * { "schema": { "core": 1 }, "root": { "type": "root", "children": [] } }
 * ```
 */
export interface Snapshot {
	/** The Schema Version of each Extension whose node types the document uses. */
	readonly schema: SchemaMap;
	/** Lexical's serialized root node. */
	readonly root: SerializedRootNode;
}

/**
 * Thrown when a value is not a valid Snapshot: by {@link parseSnapshot} when its shape is wrong,
 * and by {@link importSnapshot} when Lexical cannot parse its nodes.
 */
export class InvalidSnapshotError extends Error {
	override readonly name = 'InvalidSnapshotError';
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const isSchemaVersion = (value: unknown): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;

function assertSnapshot(value: unknown): asserts value is Snapshot {
	if (!isRecord(value)) {
		throw new InvalidSnapshotError('A Snapshot must be an object.');
	}
	const { schema, root } = value;
	if (!isRecord(schema)) {
		throw new InvalidSnapshotError('A Snapshot must have a "schema" object.');
	}
	for (const [name, version] of Object.entries(schema)) {
		if (!isSchemaVersion(version)) {
			throw new InvalidSnapshotError(
				`The Schema Version of "${name}" must be a positive integer, got ${JSON.stringify(version)}.`
			);
		}
	}
	if (!isRecord(root) || root.type !== 'root' || !Array.isArray(root.children)) {
		throw new InvalidSnapshotError('A Snapshot must have a "root" node with "children".');
	}
}

/**
 * Checks that a value read from storage has the shape of a Snapshot and returns it typed. It
 * checks the envelope and the root node. Importing the Snapshot checks the nodes inside it.
 *
 * @throws {@link InvalidSnapshotError} when the value is not a Snapshot.
 *
 * @example
 * ```ts
 * const snapshot = parseSnapshot(JSON.parse(await file.text()));
 * ```
 */
export function parseSnapshot(value: unknown): Snapshot {
	assertSnapshot(value);
	return value;
}

/**
 * Replaces the content of a Lexical editor with a Snapshot. The editor must be built with
 * blokki's `CoreExtension`, as {@link createHeadlessEditor} and every Editor are.
 *
 * Before Lexical parses the document, the import runs every pending Migration of each enabled
 * Extension, in order, starting from the version that the Snapshot records. The Snapshot itself
 * stays unchanged. The change is not an undo step. A Snapshot whose root has no children loads
 * as one empty paragraph. When the import fails, the editor keeps its content.
 *
 * @throws {@link NewerSchemaVersionError} when the Snapshot uses a newer Schema Version of an
 * enabled Extension than the editor supports.
 * @throws {@link InvalidSnapshotError} when Lexical cannot parse the Snapshot, for example
 * because it contains a node type that the editor does not have.
 * @throws Error when a Shared Document provides the editor's content. A Shared Document is never
 * rebuilt from a Snapshot. Seed a new Shared Document instead.
 * @throws The error of a Migration that fails.
 */
export function importSnapshot(editor: LexicalEditor, snapshot: Snapshot): void {
	loadRoot(editor, migrate(editor, snapshot));
}

/**
 * Runs the pending Migrations of a Snapshot for the editor's Extensions and returns the upgraded
 * root node.
 */
function migrate(editor: LexicalEditor, snapshot: Snapshot): SerializedRootNode {
	const { versions, declarations } = schemaOf(editor);
	for (const [schema, documentVersion] of Object.entries(snapshot.schema)) {
		const supportedVersion = versions[schema];
		if (supportedVersion !== undefined && documentVersion > supportedVersion) {
			throw new NewerSchemaVersionError(schema, documentVersion, supportedVersion);
		}
	}
	let root = snapshot.root;
	let copied = false;
	for (const { name, version, migrations = {} } of declarations) {
		for (let target = (snapshot.schema[name] ?? version) + 1; target <= version; target += 1) {
			const migration = migrations[target];
			if (migration === undefined) {
				continue;
			}
			// A Migration may not mutate its input, but a copy keeps the caller's Snapshot safe even
			// when one does.
			if (!copied) {
				root = structuredClone(root);
				copied = true;
			}
			root = migration(root);
		}
	}
	return root;
}

/**
 * Parses a serialized root node into the editor without checking Schema Versions.
 *
 * @throws {@link InvalidSnapshotError} when Lexical cannot parse it.
 * @throws Error when a Shared Document provides the editor's content.
 */
export function loadRoot(editor: LexicalEditor, root: SerializedRootNode): void {
	if (usesSharedDocument(editor)) {
		throw new Error(
			"A Shared Document provides this editor's content, so a Snapshot cannot be imported into it. Seed a new Shared Document instead."
		);
	}
	// Lexical passes parse errors to the editor's onError handler. When an Extension installs a
	// handler that does not throw, Lexical returns a partly parsed state instead. This callback
	// runs only after the whole tree has been parsed, so it marks success.
	let parsed = false;
	let state: EditorState;
	try {
		state = editor.parseEditorState({ root }, () => {
			const parsedRoot = $getRoot();
			if (parsedRoot.isEmpty()) {
				parsedRoot.append($createParagraphNode());
			}
			parsed = true;
		});
	} catch (cause) {
		throw new InvalidSnapshotError('Lexical could not parse the Snapshot.', { cause });
	}
	if (!parsed) {
		throw new InvalidSnapshotError('Lexical could not parse the Snapshot.');
	}
	editor.setEditorState(state, { tag: HISTORY_MERGE_TAG });
}

/**
 * Exports the content of a Lexical editor as a Snapshot, after applying its pending updates. The
 * schema map lists the Schema Version of every enabled Extension that declares one, with keys in
 * sorted order, so the same content always serializes to the same JSON.
 */
export function exportSnapshot(editor: LexicalEditor): Snapshot {
	// editor.read() commits pending updates before it runs.
	const { root } = editor.read(() => editor.getEditorState().toJSON());
	const schema = Object.fromEntries(
		Object.entries(schemaOf(editor).versions).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
	);
	return { schema, root };
}
