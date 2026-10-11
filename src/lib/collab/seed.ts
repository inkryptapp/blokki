import { buildEditorFromExtensions, type AnyLexicalExtensionArgument } from '@lexical/extension';
import {
	createBindingV2__EXPERIMENTAL,
	syncLexicalUpdateToYjsV2__EXPERIMENTAL,
	type Provider
} from '@lexical/yjs';
import { defineExtension } from 'lexical';
import type { Doc } from 'yjs';
import { CoreExtension, importSnapshot, type Snapshot } from '../core/index.js';

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
 * Writes a Snapshot into an empty Shared Document, in one Yjs transaction.
 *
 * @throws Error when the Shared Document already has content.
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
		// importSnapshot commits synchronously, so the listener writes the content before dispose.
		importSnapshot(editor, snapshot);
	} finally {
		editor.dispose();
	}
}
