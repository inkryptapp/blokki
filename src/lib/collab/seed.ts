import { buildEditorFromExtensions, type AnyLexicalExtensionArgument } from '@lexical/extension';
import {
	createBindingV2__EXPERIMENTAL,
	syncLexicalUpdateToYjsV2__EXPERIMENTAL,
	type Provider
} from '@lexical/yjs';
import { defineExtension } from 'lexical';
import type { Doc } from 'yjs';
import { CoreExtension, importSnapshot, type Snapshot } from '../core/index.js';
import { unsupportedTypesOf } from '../core/unsupported.js';

/** Options for {@link seedSharedDocument}. */
export interface SeedOptions {
	/**
	 * The Extensions of the Editors that will open the Shared Document, so that the seeded
	 * content uses the same node types.
	 *
	 * @defaultValue `[]`
	 */
	readonly extensions?: readonly AnyLexicalExtensionArgument[];
}

// Seeding writes no selection, so Lexical never reads presence from this provider.
const OFFLINE_PROVIDER: Provider = {
	awareness: {
		getLocalState: () => null,
		getStates: () => new Map(),
		on: () => {},
		off: () => {},
		setLocalState: () => {},
		setLocalStateField: () => {}
	},
	connect: () => {},
	disconnect: () => {},
	on: () => {},
	off: () => {}
};

/**
 * Gives a new Shared Document its initial content from a Snapshot. The client that creates the
 * document calls it once, before anyone else joins. Editors never seed on connect, because two
 * clients that connect to an empty document at the same time would both seed it, and the content
 * would appear twice.
 *
 * Seeding runs headless, so it also works in Node. It is not an undo step for any Editor.
 *
 * @throws Error when the Shared Document already has content.
 * @throws The errors of `importSnapshot` when the Snapshot cannot be loaded.
 *
 * @example
 * ```ts
 * const doc = new Y.Doc();
 * seedSharedDocument(doc, snapshot, { extensions });
 * // Then connect the provider and mount the Editor.
 * ```
 */
export function seedSharedDocument(doc: Doc, snapshot: Snapshot, options: SeedOptions = {}): void {
	const editor = buildEditorFromExtensions(
		defineExtension({
			name: 'blokki/seed',
			// Starts from an empty root, which matches the empty Shared Document.
			$initialEditorState: null,
			dependencies: [CoreExtension, ...(options.extensions ?? [])]
		})
	);
	try {
		const binding = createBindingV2__EXPERIMENTAL(editor, 'seed', doc, new Map([['seed', doc]]));
		if (binding.root.length > 0) {
			throw new Error('The Shared Document already has content. Seed it only once.');
		}
		// A dry run before the binding writes anything. The Shared Document stores Lexical nodes,
		// so a node type without its Extension would be written as a placeholder and lost.
		importSnapshot(editor, snapshot);
		const unsupported = unsupportedTypesOf(editor);
		if (unsupported.length > 0) {
			throw new Error(
				`Seeding needs the Extensions of every node type in the Snapshot. Missing: ${[...new Set(unsupported)].join(', ')}.`
			);
		}
		editor.registerUpdateListener(
			({ prevEditorState, editorState, dirtyElements, dirtyLeaves, normalizedNodes, tags }) => {
				syncLexicalUpdateToYjsV2__EXPERIMENTAL(
					binding,
					OFFLINE_PROVIDER,
					prevEditorState,
					editorState,
					dirtyElements,
					dirtyLeaves,
					normalizedNodes,
					tags
				);
			}
		);
		// Imports again, now with the listener. importSnapshot commits synchronously, so the
		// listener writes the content before dispose.
		importSnapshot(editor, snapshot);
	} finally {
		editor.dispose();
	}
}
