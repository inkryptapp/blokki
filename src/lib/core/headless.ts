import {
	buildEditorFromExtensions,
	type AnyLexicalExtensionArgument,
	type LexicalEditorWithDispose
} from '@lexical/extension';
import { RichTextExtension } from '@lexical/rich-text';
import { defineExtension } from 'lexical';
import { declareSchema } from './schema.js';
import { SharedDocumentExtension } from './shared-document.js';

/**
 * The node types that every Editor has: root, paragraph, text, line break, tab, heading, and
 * quote. They are recorded as the `core` schema in a Snapshot.
 */
export const CoreExtension = defineExtension({
	name: 'blokki/core',
	dependencies: [
		RichTextExtension,
		SharedDocumentExtension,
		declareSchema({ name: 'core', version: 1 })
	]
});

/** Options for {@link createHeadlessEditor}. */
export interface HeadlessEditorOptions {
	/**
	 * Lexical extensions to enable in addition to {@link CoreExtension}. Pass the same Extensions
	 * that the app's Editor uses, so that both read and write the same node types.
	 *
	 * @defaultValue `[]`
	 */
	readonly extensions?: readonly AnyLexicalExtensionArgument[];
}

/**
 * Creates a Lexical editor with no DOM, for working with Snapshots in Node or in a worker. It
 * starts with one empty paragraph. Call `dispose()` when done with it.
 *
 * @example
 * ```ts
 * const editor = createHeadlessEditor();
 * importSnapshot(editor, parseSnapshot(JSON.parse(text)));
 * const snapshot = exportSnapshot(editor);
 * editor.dispose();
 * ```
 */
export function createHeadlessEditor({
	extensions = []
}: HeadlessEditorOptions = {}): LexicalEditorWithDispose {
	return buildEditorFromExtensions(
		defineExtension({
			name: 'blokki/headless',
			dependencies: [CoreExtension, ...extensions]
		})
	);
}
